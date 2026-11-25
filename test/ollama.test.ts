import {afterEach, describe, expect, it} from 'vitest'

import {OllamaClient, OllamaError} from '../src/llm/ollama.js'
import {hasModel} from '../src/llm/providers.js'
import {json, startFakeServer, type FakeServer} from './helpers/fakeServer.js'

let fake: FakeServer | undefined

afterEach(async () => {
  await fake?.close()
  fake = undefined
})

async function client(handlers: Parameters<typeof startFakeServer>[0]) {
  fake = await startFakeServer(handlers)
  return new OllamaClient({baseUrl: fake.url, timeoutMs: 5_000})
}

describe('OllamaClient', () => {
  it('embeds a batch in one call', async () => {
    const ollama = await client({
      '/api/embed': () =>
        json({
          embeddings: [
            [1, 0],
            [0, 1]
          ]
        })
    })
    expect(await ollama.embed('bge-m3', ['a', 'b'])).toEqual([
      [1, 0],
      [0, 1]
    ])
    expect(fake?.requests[0]?.body).toEqual({model: 'bge-m3', input: ['a', 'b']})
  })

  it('rejects an embedding reply of the wrong length', async () => {
    const ollama = await client({'/api/embed': () => json({embeddings: [[1, 0]]})})
    await expect(ollama.embed('bge-m3', ['a', 'b'])).rejects.toThrow(OllamaError)
  })

  it('streams tokens even when lines and Bengali characters are split across reads', async () => {
    const lines =
      [
        {message: {content: 'দাম '}, done: false},
        {message: {content: '১৪৫০ টাকা'}, done: false},
        {message: {content: ''}, done: true}
      ]
        .map((part) => JSON.stringify(part))
        .join('\n') + '\n'
    const bytes = Buffer.from(lines, 'utf8')
    // Cut inside the first Bengali character's bytes, and again in the middle of a line
    const cutA = bytes.indexOf(Buffer.from('দ', 'utf8')) + 1
    const cutB = cutA + 30
    const ollama = await client({
      '/api/chat': () => ({
        pieces: [bytes.subarray(0, cutA), bytes.subarray(cutA, cutB), bytes.subarray(cutB)]
      })
    })
    const tokens: string[] = []
    for await (const token of ollama.chatStream('gemma3:12b', [{role: 'user', content: 'q'}])) {
      tokens.push(token)
    }
    expect(tokens).toEqual(['দাম ', '১৪৫০ টাকা'])
    expect(fake?.requests[0]?.body).toMatchObject({model: 'gemma3:12b', stream: true})
  })

  it('surfaces an error sent in the middle of a stream', async () => {
    const ollama = await client({
      '/api/chat': () => ({
        pieces: ['{"message":{"content":"Hi"}}\n', '{"error":"out of memory"}\n']
      })
    })
    const run = async () => {
      for await (const token of ollama.chatStream('m', [])) void token
    }
    await expect(run()).rejects.toThrow('out of memory')
  })

  it('parses a structured JSON answer', async () => {
    const ollama = await client({
      '/api/chat': () =>
        json({message: {content: '{"bangla":"দাম কত?","english":"What is the price?"}'}})
    })
    const schema = {type: 'object'}
    expect(await ollama.chatJson('m', [{role: 'user', content: 'dam koto?'}], schema)).toEqual({
      bangla: 'দাম কত?',
      english: 'What is the price?'
    })
    expect(fake?.requests[0]?.body).toMatchObject({stream: false, format: schema})
  })

  it('reports the error Ollama sends, such as a missing model', async () => {
    const ollama = await client({
      '/api/embed': () => json({error: 'model "bge-m3" not found, try pulling it first'}, 404)
    })
    await expect(ollama.embed('bge-m3', ['a'])).rejects.toThrow(
      'Ollama 404: model "bge-m3" not found, try pulling it first'
    )
  })

  it('says plainly when Ollama is not running', async () => {
    const ollama = new OllamaClient({baseUrl: 'http://127.0.0.1:9', timeoutMs: 2_000})
    await expect(ollama.listModels()).rejects.toThrow('Cannot reach Ollama at http://127.0.0.1:9')
  })
})

describe('hasModel', () => {
  it('matches a model with or without the latest tag', () => {
    expect(hasModel(['bge-m3:latest', 'gemma3:12b'], 'bge-m3')).toBe(true)
    expect(hasModel(['bge-m3:latest', 'gemma3:12b'], 'gemma3:12b')).toBe(true)
    expect(hasModel(['gemma3:4b'], 'gemma3:12b')).toBe(false)
  })
})
