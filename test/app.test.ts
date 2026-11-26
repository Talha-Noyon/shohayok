import type {Server} from 'node:http'

import {afterEach, describe, expect, it} from 'vitest'

import type {TurnEvent, TurnInput} from '../src/agent/turn.js'
import {createApp, type AppDeps} from '../src/server/app.js'
import {listen, readEvents} from './helpers/http.js'

let server: Server | undefined

afterEach(() => {
  server?.close()
  server = undefined
})

const QUOTA = {
  enabled: true,
  used: 1,
  limit: 45,
  visitorUsed: 1,
  visitorLimit: 15,
  resetsAt: 'x'
}
const ID = 'AAAAAAAAAAAAAAAAAAAAAA'

async function start(deps: Partial<AppDeps>) {
  const app = createApp({
    turn: async function* () {},
    conversation: async () => null,
    quota: async () => QUOTA,
    allow: async () => true,
    visitor: () => 'visitor-hash',
    health: async () => ({ok: true}),
    ...deps
  })
  const running = await listen(app)
  server = running.server
  return running.url
}

const post = (url: string, body: unknown) =>
  fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(body)
  })

describe('POST /api/chat', () => {
  it('streams the turn as newline-delimited JSON, for this visitor and conversation', async () => {
    const inputs: TurnInput[] = []
    const url = await start({
      turn: async function* (input): AsyncGenerator<TurnEvent> {
        inputs.push(input)
        yield {type: 'token', text: 'Hello'}
      }
    })
    const response = await post(url, {message: ' hi ', conversationId: ID})
    expect(response.headers.get('content-type')).toContain('application/x-ndjson')
    expect(await readEvents(response)).toEqual([{type: 'token', text: 'Hello'}])
    expect(inputs[0]).toMatchObject({message: 'hi', conversationId: ID, visitor: 'visitor-hash'})
  })

  it.each([
    {},
    {message: ''},
    {message: 'x'.repeat(501)},
    {message: 'hi', conversationId: 'short'}
  ])('refuses a bad request: %j', async (body) => {
    const url = await start({})
    expect((await post(url, body)).status).toBe(400)
  })

  it('answers 429 when the visitor sends too many messages, without starting a turn', async () => {
    let started = false
    const url = await start({
      allow: async () => false,
      turn: async function* (): AsyncGenerator<TurnEvent> {
        started = true
        yield {type: 'token', text: 'never sent'}
      }
    })
    const response = await post(url, {message: 'hi'})
    expect(response.status).toBe(429)
    expect(started).toBe(false)
  })

  it('ends with a plain error event when the turn fails, without its details', async () => {
    const url = await start({
      turn: async function* (): AsyncGenerator<TurnEvent> {
        yield {type: 'token', text: 'Par'}
        throw new Error('ECONNRESET at 10.0.0.3:27017')
      }
    })
    const events = await readEvents(await post(url, {message: 'hi'}))
    expect(events.at(-1)).toEqual({
      type: 'error',
      message: 'Something went wrong. Please try again in a moment.'
    })
  })
})

describe('GET /api/conversations/:id', () => {
  it('returns a stored conversation, and 404 for an unknown one', async () => {
    const at = new Date('2026-11-26T10:00:00Z')
    const url = await start({
      conversation: async (id) =>
        id === ID
          ? {
              id,
              visitor: 'v',
              messages: [{role: 'customer', text: 'hi', at}],
              state: {lastProducts: [], failedLookups: 0},
              createdAt: at,
              updatedAt: at,
              expiresAt: at
            }
          : null
    })
    const found = await (await fetch(`${url}/api/conversations/${ID}`)).json()
    expect(found).toEqual({
      id: ID,
      messages: [{role: 'customer', text: 'hi', at: '2026-11-26T10:00:00.000Z'}]
    })
    expect((await fetch(`${url}/api/conversations/BBBBBBBBBBBBBBBBBBBBBB`)).status).toBe(404)
    expect((await fetch(`${url}/api/conversations/bad`)).status).toBe(400)
  })
})

describe('other endpoints', () => {
  it("reports the visitor's quota", async () => {
    const asked: string[] = []
    const url = await start({
      quota: async (visitor) => {
        asked.push(visitor)
        return QUOTA
      }
    })
    expect(await (await fetch(`${url}/api/quota`)).json()).toEqual(QUOTA)
    expect(asked).toEqual(['visitor-hash'])
  })

  it('reports health and sets safe headers on API responses', async () => {
    const url = await start({})
    const response = await fetch(`${url}/api/health`)
    expect(await response.json()).toEqual({ok: true})
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})
