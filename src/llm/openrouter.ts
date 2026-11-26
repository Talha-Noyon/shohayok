import {parseJsonLoose, readLines} from './text.js'
import type {ChatMessage, LlmProvider} from './types.js'

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1'

export class OpenRouterError extends Error {
  readonly status: number | undefined

  constructor(message: string, status?: number, options?: ErrorOptions) {
    super(message, options)
    this.name = 'OpenRouterError'
    this.status = status
  }
}

export interface OpenRouterClientOptions {
  apiKey: string
  baseUrl?: string
  /** For calls that return one JSON answer; streaming calls follow the caller's signal */
  timeoutMs?: number
  /** Retries after a per-minute rate limit or an overloaded upstream provider */
  maxRetries?: number
  /** First wait between retries when OpenRouter sends no Retry-After header */
  retryDelayMs?: number
  fetchImpl?: typeof fetch
}

/** OpenRouter's limit on free models per day; retrying does not help until midnight UTC */
const DAILY_LIMIT = /per[- ]?day/i

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** OpenRouter speaks the OpenAI API: chat completions streamed as server-sent events */
export class OpenRouterClient implements LlmProvider {
  readonly name = 'openrouter' as const
  readonly baseUrl: string
  private readonly apiKey: string
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly retryDelayMs: number
  private readonly fetchImpl: typeof fetch

  constructor({
    apiKey,
    baseUrl = OPENROUTER_URL,
    timeoutMs = 120_000,
    maxRetries = 4,
    retryDelayMs = 3_000,
    fetchImpl = fetch
  }: OpenRouterClientOptions) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.timeoutMs = timeoutMs
    this.maxRetries = maxRetries
    this.retryDelayMs = retryDelayMs
    this.fetchImpl = fetchImpl
  }

  /**
   * Checks the key. True when the account is on the free tier, false when it has bought credits,
   * null when OpenRouter does not say. Throws when the key is rejected.
   */
  async checkKey(): Promise<{freeTier: boolean | null}> {
    const body = await this.json<{data?: {is_free_tier?: unknown}}>('GET', '/key')
    const freeTier = body.data?.is_free_tier
    return {freeTier: typeof freeTier === 'boolean' ? freeTier : null}
  }

  /** Chat and embedding model ids together */
  async listModels(): Promise<string[]> {
    type Models = {data?: {id: string}[]}
    const [chat, embedding] = await Promise.all([
      this.json<Models>('GET', '/models'),
      this.json<Models>('GET', '/embeddings/models')
    ])
    return [...(chat.data ?? []), ...(embedding.data ?? [])].map((model) => model.id)
  }

  async embed(model: string, input: string[]): Promise<number[][]> {
    if (input.length === 0) return []
    const body = await this.json<{data?: {embedding: number[]; index: number}[]}>(
      'POST',
      '/embeddings',
      {model, input}
    )
    const data = [...(body.data ?? [])].sort((a, b) => a.index - b.index)
    if (data.length !== input.length) {
      throw new OpenRouterError(
        `OpenRouter returned ${data.length} embeddings for ${input.length} inputs from ${model}`
      )
    }
    return data.map((item) => item.embedding)
  }

  /**
   * Asks for a JSON schema first. Some free endpoints refuse schemas, so on a 400 or 404 it asks
   * again without one; the prompt itself still asks for JSON, and the answer is parsed loosely.
   */
  async chatJson(model: string, messages: ChatMessage[], schema: object): Promise<unknown> {
    type Completion = {choices?: {message?: {content?: string | null}}[]}
    const request = {model, messages, stream: false, temperature: 0}
    let body: Completion
    try {
      body = await this.json<Completion>('POST', '/chat/completions', {
        ...request,
        response_format: {type: 'json_schema', json_schema: {name: 'answer', strict: true, schema}}
      })
    } catch (error) {
      if (!(error instanceof OpenRouterError) || (error.status !== 400 && error.status !== 404)) {
        throw error
      }
      body = await this.json<Completion>('POST', '/chat/completions', request)
    }
    const content = body.choices?.[0]?.message?.content
    if (!content) throw new OpenRouterError(`OpenRouter returned an empty answer from ${model}`)
    return parseJsonLoose(content)
  }

  async *chatStream(
    model: string,
    messages: ChatMessage[],
    signal?: AbortSignal
  ): AsyncGenerator<string> {
    const response = await this.send(
      'POST',
      '/chat/completions',
      {model, messages, stream: true, temperature: 0.2},
      signal
    )
    if (!response.body) throw new OpenRouterError('OpenRouter sent no response body')
    for await (const line of readLines(response.body)) {
      // Lines starting with ":" are keep-alive comments, such as ": OPENROUTER PROCESSING"
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') return
      const chunk = JSON.parse(data) as {
        error?: {message?: string}
        choices?: {delta?: {content?: string | null}}[]
      }
      if (chunk.error) throw new OpenRouterError(chunk.error.message ?? 'OpenRouter stream failed')
      const text = chunk.choices?.[0]?.delta?.content
      if (text) yield text
    }
  }

  private async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    return (await (await this.send(method, path, body)).json()) as T
  }

  private async send(
    method: string,
    path: string,
    body: unknown,
    signal?: AbortSignal
  ): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      let response: Response
      try {
        response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            'x-title': 'Shohayok',
            ...(body === undefined ? {} : {'content-type': 'application/json'})
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: signal ?? AbortSignal.timeout(this.timeoutMs)
        })
      } catch (error) {
        if (signal?.aborted) throw error
        throw new OpenRouterError(`Cannot reach OpenRouter at ${this.baseUrl}`, undefined, {
          cause: error
        })
      }
      if (response.ok) return response

      const error = await toError(response)
      if (attempt >= this.maxRetries || !isRetryable(error)) throw error
      await sleep(this.retryDelay(attempt, response.headers.get('retry-after')))
    }
  }

  private retryDelay(attempt: number, retryAfter: string | null): number {
    const seconds = Number(retryAfter)
    if (retryAfter !== null && retryAfter !== '' && Number.isFinite(seconds)) {
      return Math.min(seconds * 1000, 60_000)
    }
    return Math.min(this.retryDelayMs * 2 ** attempt, 30_000)
  }
}

function isRetryable(error: OpenRouterError): boolean {
  if (error.status === 429) return !DAILY_LIMIT.test(error.message)
  return error.status === 502 || error.status === 503
}

const HINTS: Record<number, string> = {
  401: 'Check OPENROUTER_API_KEY.',
  402: 'This model needs credits. Add credits on openrouter.ai, or choose a model whose id ends in :free.'
}

interface ErrorBody {
  error?: {message?: string; metadata?: {raw?: unknown; limit_source?: unknown}}
}

async function toError(response: Response): Promise<OpenRouterError> {
  const text = await response.text()
  let message = text || response.statusText
  // "Provider returned error" says little: the upstream provider's own reason is in metadata
  let detail = ''
  let upstream = false
  try {
    const {error} = JSON.parse(text) as ErrorBody
    message = error?.message ?? message
    if (typeof error?.metadata?.raw === 'string') detail = error.metadata.raw
    upstream =
      (typeof error?.metadata?.limit_source === 'string' &&
        error.metadata.limit_source.startsWith('upstream')) ||
      /rate-limited upstream/i.test(detail)
  } catch {
    // not JSON: keep the raw text
  }
  message = message.trim().replace(/\.$/, '')
  // The detail can end with a long link to OpenRouter's own-key settings; one sentence is enough
  detail = detail.split(/(?<=\.)\s/)[0]?.trim() ?? ''

  let hint = HINTS[response.status]
  if (response.status === 429) {
    if (DAILY_LIMIT.test(message)) {
      hint =
        'The daily limit on free models is used up. It resets at midnight UTC, and buying $10 of credits raises it.'
    } else if (upstream) {
      hint =
        "This free model's shared upstream capacity is busy, not your key. Retry later, or set CHAT_MODEL to another :free model."
    } else {
      hint = 'OpenRouter is limiting requests from this key. Wait a minute and try again.'
    }
  }
  const reason =
    detail && detail !== message ? `${message} (${detail.replace(/\.$/, '')})` : message
  return new OpenRouterError(
    `OpenRouter ${response.status}: ${reason}.${hint ? ` ${hint}` : ''}`,
    response.status
  )
}
