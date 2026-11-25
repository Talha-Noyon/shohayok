import type {Server} from 'node:http'

import {afterEach, describe, expect, it} from 'vitest'

import type {AnswerEvent} from '../src/rag/pipeline.js'
import {createApp, type AppDeps} from '../src/server/app.js'
import {listen, postChat, readEvents} from './helpers/http.js'

let server: Server | undefined

afterEach(() => {
  server?.close()
  server = undefined
})

async function start(deps: Partial<AppDeps>) {
  const app = createApp({
    answer: async function* () {},
    health: async () => ({ok: true}),
    ...deps
  })
  const running = await listen(app)
  server = running.server
  return running.url
}

describe('POST /api/chat', () => {
  it('streams the pipeline events as newline-delimited JSON', async () => {
    const asked: string[] = []
    const url = await start({
      answer: async function* (question): AsyncGenerator<AnswerEvent> {
        asked.push(question)
        yield {
          type: 'meta',
          lang: 'en',
          rewrite: null,
          handoff: false,
          confidence: 0.9,
          sources: []
        }
        yield {type: 'token', text: 'Tk 70.'}
      }
    })

    const response = await postChat(url, '  How much is delivery?  ')

    expect(response.headers.get('content-type')).toContain('application/x-ndjson')
    expect((await readEvents(response)).map((event) => event.type)).toEqual(['meta', 'token'])
    expect(asked).toEqual(['How much is delivery?'])
  })

  it('rejects an empty or oversized message', async () => {
    const url = await start({})
    expect((await postChat(url, '   ')).status).toBe(400)
    expect((await postChat(url, 'x'.repeat(501))).status).toBe(400)
    expect((await postChat(url, 42)).status).toBe(400)
  })

  it('ends the stream with an error event when the pipeline fails midway', async () => {
    const url = await start({
      answer: async function* (): AsyncGenerator<AnswerEvent> {
        yield {type: 'token', text: 'Partial'}
        throw new Error('Ollama 500: out of memory')
      }
    })
    const events = await readEvents(await postChat(url, 'question'))
    expect(events.at(-1)).toEqual({type: 'error', message: 'Ollama 500: out of memory'})
  })
})

describe('GET routes', () => {
  it('reports health', async () => {
    const url = await start({health: async () => ({ok: true, chunks: 35})})
    expect(await (await fetch(`${url}/api/health`)).json()).toEqual({ok: true, chunks: 35})
  })

  it('serves the chat page', async () => {
    const url = await start({})
    const response = await fetch(`${url}/`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<title>Shohayok</title>')
  })
})
