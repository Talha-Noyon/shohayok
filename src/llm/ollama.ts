import {parseJsonLoose, readLines} from './text.js'
import type {ChatInfo, ChatMessage, LlmProvider} from './types.js'

export class OllamaError extends Error {
  readonly status: number | undefined

  constructor(message: string, status?: number, options?: ErrorOptions) {
    super(message, options)
    this.name = 'OllamaError'
    this.status = status
  }
}

export interface OllamaClientOptions {
  baseUrl: string
  /** For calls that return one JSON answer; streaming calls follow the caller's signal */
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

/** Ollama has no fallback routing: a model list means its first model */
const firstModel = (model: string) => model.split(',')[0]?.trim() || model

/** A small client for the Ollama endpoints this project needs, on plain fetch */
export class OllamaClient implements LlmProvider {
  readonly name = 'ollama' as const
  readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor({baseUrl, timeoutMs = 120_000, fetchImpl = fetch}: OllamaClientOptions) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.timeoutMs = timeoutMs
    this.fetchImpl = fetchImpl
  }

  async listModels(): Promise<string[]> {
    const body = await this.request<{models?: {name: string}[]}>('GET', '/api/tags')
    return (body.models ?? []).map((model) => model.name)
  }

  async pull(model: string): Promise<void> {
    await this.request('POST', '/api/pull', {model, stream: false}, 60 * 60_000)
  }

  async embed(model: string, input: string[]): Promise<number[][]> {
    if (input.length === 0) return []
    const body = await this.request<{embeddings?: number[][]}>('POST', '/api/embed', {model, input})
    if (!Array.isArray(body.embeddings) || body.embeddings.length !== input.length) {
      throw new OllamaError(`Ollama returned no embeddings for model ${model}`)
    }
    return body.embeddings
  }

  /** One complete answer, constrained to `schema` by Ollama's structured outputs */
  async chatJson(
    model: string,
    messages: ChatMessage[],
    schema: object,
    info?: ChatInfo
  ): Promise<unknown> {
    model = firstModel(model)
    if (info) info.model = model
    const body = await this.request<{message?: {content?: string}}>('POST', '/api/chat', {
      model,
      messages,
      stream: false,
      format: schema,
      options: {temperature: 0}
    })
    const content = body.message?.content
    if (!content) throw new OllamaError(`Ollama returned an empty answer from ${model}`)
    return parseJsonLoose(content)
  }

  async *chatStream(
    model: string,
    messages: ChatMessage[],
    signal?: AbortSignal,
    info?: ChatInfo
  ): AsyncGenerator<string> {
    model = firstModel(model)
    if (info) info.model = model
    const response = await this.send(
      'POST',
      '/api/chat',
      {model, messages, stream: true, options: {temperature: 0.2}},
      signal
    )
    if (!response.body) throw new OllamaError('Ollama sent no response body')
    for await (const line of readLines(response.body)) {
      const part = JSON.parse(line) as {
        message?: {content?: string}
        done?: boolean
        error?: string
      }
      if (part.error) throw new OllamaError(part.error)
      if (part.message?.content) yield part.message.content
      if (part.done) return
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    timeoutMs = this.timeoutMs
  ): Promise<T> {
    const response = await this.send(method, path, body, AbortSignal.timeout(timeoutMs))
    return (await response.json()) as T
  }

  private async send(
    method: string,
    path: string,
    body: unknown,
    signal?: AbortSignal
  ): Promise<Response> {
    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: body === undefined ? undefined : {'content-type': 'application/json'},
        body: body === undefined ? undefined : JSON.stringify(body),
        signal
      })
    } catch (error) {
      if (signal?.aborted) throw error
      throw new OllamaError(`Cannot reach Ollama at ${this.baseUrl}. Is it running?`, undefined, {
        cause: error
      })
    }
    if (!response.ok) {
      const text = await response.text()
      let message = text
      try {
        message = (JSON.parse(text) as {error?: string}).error ?? text
      } catch {
        // not JSON: keep the raw text
      }
      throw new OllamaError(`Ollama ${response.status}: ${message}`, response.status)
    }
    return response
  }
}
