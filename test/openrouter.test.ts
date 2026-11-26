import {afterEach, describe, expect, it} from 'vitest'

import {OpenRouterClient, OpenRouterError} from '../src/llm/openrouter.js'
import {parseJsonLoose} from '../src/llm/text.js'
import {json, sse, startFakeServer, type FakeServer} from './helpers/fakeServer.js'

let fake: FakeServer | undefined

afterEach(async () => {
  await fake?.close()
  fake = undefined
})

async function client(handlers: Parameters<typeof startFakeServer>[0]) {
  fake = await startFakeServer(handlers)
  return new OpenRouterClient({
    apiKey: 'sk-or-test',
    baseUrl: `${fake.url}/api/v1`,
    timeoutMs: 5_000,
    retryDelayMs: 1
  })
}

const messages = [{role: 'user' as const, content: 'q'}]

describe('OpenRouterClient', () => {
  it('sends the key and returns embeddings in input order', async () => {
    const openrouter = await client({
      '/api/v1/embeddings': () =>
        json({
          data: [
            {index: 1, embedding: [0, 1]},
            {index: 0, embedding: [1, 0]}
          ]
        })
    })
    expect(await openrouter.embed('baai/bge-m3', ['a', 'b'])).toEqual([
      [1, 0],
      [0, 1]
    ])
    expect(fake?.requests[0]?.headers.authorization).toBe('Bearer sk-or-test')
    expect(fake?.requests[0]?.body).toEqual({model: 'baai/bge-m3', input: ['a', 'b']})
  })

  it('streams server-sent events, skipping keep-alive comments, until [DONE]', async () => {
    const events = sse('দাম ', '১৪৫০ টাকা').join('')
    const bytes = Buffer.from(events, 'utf8')
    // Cut inside a Bengali character and again in the middle of an event
    const cutA = bytes.indexOf(Buffer.from('দ', 'utf8')) + 1
    const cutB = cutA + 40
    const openrouter = await client({
      '/api/v1/chat/completions': () => ({
        pieces: [bytes.subarray(0, cutA), bytes.subarray(cutA, cutB), bytes.subarray(cutB)]
      })
    })
    const tokens: string[] = []
    for await (const token of openrouter.chatStream('google/gemma-4-31b-it:free', messages)) {
      tokens.push(token)
    }
    expect(tokens).toEqual(['দাম ', '১৪৫০ টাকা'])
    expect(fake?.requests[0]?.body).toMatchObject({
      stream: true,
      model: 'google/gemma-4-31b-it:free'
    })
  })

  it('surfaces an error sent in the middle of a stream', async () => {
    const openrouter = await client({
      '/api/v1/chat/completions': () => ({
        pieces: [
          'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
          'data: {"error":{"message":"Provider returned error"},"choices":[{"delta":{"content":""},"finish_reason":"error"}]}\n\n'
        ]
      })
    })
    const run = async () => {
      for await (const token of openrouter.chatStream('m', messages)) void token
    }
    await expect(run()).rejects.toThrow('Provider returned error')
  })

  it('asks for a JSON schema and reads a fenced answer', async () => {
    const openrouter = await client({
      '/api/v1/chat/completions': () =>
        json({
          choices: [
            {
              message: {
                content: '```json\n{"bangla":"দাম কত?","english":"What is the price?"}\n```'
              }
            }
          ]
        })
    })
    const schema = {type: 'object'}
    expect(await openrouter.chatJson('m', messages, schema)).toEqual({
      bangla: 'দাম কত?',
      english: 'What is the price?'
    })
    expect(fake?.requests[0]?.body).toMatchObject({
      stream: false,
      response_format: {type: 'json_schema', json_schema: {schema}}
    })
  })

  it('asks again without the schema when a model refuses it', async () => {
    const openrouter = await client({
      '/api/v1/chat/completions': (body) =>
        (body as {response_format?: unknown}).response_format
          ? json({error: {message: 'response_format is not supported'}}, 400)
          : json({choices: [{message: {content: '{"bangla":"ক","english":"k"}'}}]})
    })
    expect(await openrouter.chatJson('m', messages, {})).toEqual({bangla: 'ক', english: 'k'})
    expect(fake?.requests).toHaveLength(2)
    expect(fake?.requests[1]?.body).not.toHaveProperty('response_format')
  })

  it('waits and retries after a per-minute rate limit', async () => {
    let calls = 0
    const openrouter = await client({
      '/api/v1/embeddings': () =>
        ++calls === 1
          ? json({error: {message: 'Rate limit exceeded: free-models-per-min.'}}, 429, {
              'retry-after': '0'
            })
          : json({data: [{index: 0, embedding: [1]}]})
    })
    expect(await openrouter.embed('m', ['a'])).toEqual([[1]])
    expect(calls).toBe(2)
  })

  it('does not retry the daily free-model limit, and says when it resets', async () => {
    const openrouter = await client({
      '/api/v1/chat/completions': () =>
        json({error: {message: 'Rate limit exceeded: free-models-per-day'}}, 429)
    })
    await expect(openrouter.chatJson('m', messages, {})).rejects.toThrow('resets at midnight UTC')
    expect(fake?.requests).toHaveLength(1)
  })

  it('names the upstream provider as the cause when its shared pool is busy', async () => {
    // The shape OpenRouter sent on 2026-11-25 when a free Gemma model was saturated
    const busy = json(
      {
        error: {
          message: 'Provider returned error',
          code: 429,
          metadata: {
            raw: 'google/gemma-4-31b-it:free is temporarily rate-limited upstream. Please retry shortly, or add your own provider key: https://openrouter.ai/workspaces/default/byok',
            provider_name: 'Google AI Studio',
            limit_source: 'upstream_provider_shared_pool'
          }
        }
      },
      429,
      {'retry-after': '0'}
    )
    const openrouter = await client({'/api/v1/embeddings': () => busy})
    const failure = await openrouter.embed('m', ['a']).catch((error: unknown) => error)
    const message = (failure as Error).message

    expect(message).toContain(
      'Provider returned error (google/gemma-4-31b-it:free is temporarily rate-limited upstream)'
    )
    expect(message).toContain('shared upstream capacity is busy, not your key')
    expect(message).not.toContain('byok')
    expect(fake?.requests.length).toBeGreaterThan(1) // a busy pool is worth retrying
  })

  it('explains a rejected key and a model that needs credits', async () => {
    const openrouter = await client({
      '/api/v1/key': () => json({error: {message: 'No auth credentials found', code: 401}}, 401),
      '/api/v1/embeddings': () => json({error: {message: 'Insufficient credits'}}, 402)
    })
    await expect(openrouter.checkKey()).rejects.toThrow(
      'OpenRouter 401: No auth credentials found. Check OPENROUTER_API_KEY.'
    )
    const failure = await openrouter.embed('baai/bge-m3', ['a']).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(OpenRouterError)
    expect((failure as Error).message).toContain('needs credits')
  })

  it('reports whether the key is on the free tier', async () => {
    const openrouter = await client({'/api/v1/key': () => json({data: {is_free_tier: true}})})
    expect(await openrouter.checkKey()).toEqual({freeTier: true})
  })

  it('lists chat and embedding models together', async () => {
    const openrouter = await client({
      '/api/v1/models': () => json({data: [{id: 'google/gemma-4-31b-it:free'}]}),
      '/api/v1/embeddings/models': () => json({data: [{id: 'baai/bge-m3'}]})
    })
    expect(await openrouter.listModels()).toEqual(['google/gemma-4-31b-it:free', 'baai/bge-m3'])
  })
})

describe('parseJsonLoose', () => {
  it('reads plain, fenced and wrapped JSON', () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({a: 1})
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({a: 1})
    expect(parseJsonLoose('Here you go: {"a":1} Hope it helps.')).toEqual({a: 1})
  })

  it('throws when there is no JSON at all', () => {
    expect(() => parseJsonLoose('I cannot help with that.')).toThrow('did not answer with JSON')
  })
})
