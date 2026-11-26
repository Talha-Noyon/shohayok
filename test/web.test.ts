import {describe, expect, it} from 'vitest'

import type {Trace} from '../src/shared/api.js'
import {chatReducer, EMPTY_CHAT, type ChatState} from '../web/src/chatState.js'
import {readNdjson} from '../web/src/stream.js'

function streamOf(...pieces: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const piece of pieces) {
        controller.enqueue(typeof piece === 'string' ? encoder.encode(piece) : piece)
      }
      controller.close()
    }
  })
}

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = []
  for await (const item of source) items.push(item)
  return items
}

describe('readNdjson', () => {
  it('reads one JSON value per line, however the network splits the lines', async () => {
    const values = await collect(readNdjson(streamOf('{"a":1}\n{"b"', ':2}\n\n{"c":3}')))
    expect(values).toEqual([{a: 1}, {b: 2}, {c: 3}])
  })

  it('keeps a Bengali character whole when its bytes arrive in two reads', async () => {
    const bytes = new TextEncoder().encode('{"text":"দাম"}\n')
    const values = await collect(readNdjson(streamOf(bytes.slice(0, 10), bytes.slice(10))))
    expect(values).toEqual([{text: 'দাম'}])
  })
})

const trace = {
  language: {lang: 'banglish', bengaliShare: 0, banglishWords: ['e', 'koto']},
  route: {kind: 'tool', tool: 'delivery_fee', reason: 'a delivery question'},
  quota: {enabled: true, used: 3, limit: 45, visitorUsed: 1, visitorLimit: 15, resetsAt: 'x'}
} as unknown as Trace

describe('chatReducer', () => {
  const sent = chatReducer(EMPTY_CHAT, {type: 'sent', customerId: 'c1', botId: 'b1', text: 'hi'})

  it('adds the message and a reply waiting for its first word', () => {
    expect(sent.messages.map((m) => [m.role, m.status, m.text])).toEqual([
      ['customer', 'done', 'hi'],
      ['bot', 'pending', '']
    ])
  })

  it('streams the reply in, then keeps its trace, selects it and updates the quota', () => {
    let state: ChatState = sent
    state = chatReducer(state, {
      type: 'event',
      botId: 'b1',
      event: {
        type: 'meta',
        conversationId: 'conv',
        lang: 'banglish',
        route: trace.route,
        sources: [{docId: 'F02', title: 'Delivery outside Dhaka / ঢাকার বাইরে ডেলিভারি'}]
      }
    })
    state = chatReducer(state, {
      type: 'event',
      botId: 'b1',
      event: {type: 'token', text: 'Sylhet '}
    })
    expect(state.messages[1]).toMatchObject({
      status: 'streaming',
      text: 'Sylhet ',
      lang: 'banglish'
    })
    expect(state.conversationId).toBe('conv')

    state = chatReducer(state, {
      type: 'event',
      botId: 'b1',
      event: {type: 'done', answer: 'Sylhet e 130 taka.', trace}
    })
    expect(state.messages[1]).toMatchObject({status: 'done', text: 'Sylhet e 130 taka.', trace})
    expect(state.selectedId).toBe('b1')
    expect(state.quota?.used).toBe(3)
  })

  it('shows the error in the reply that failed', () => {
    const failed = chatReducer(sent, {
      type: 'event',
      botId: 'b1',
      event: {type: 'error', message: 'Something went wrong.'}
    })
    expect(failed.messages[1]).toMatchObject({status: 'error', error: 'Something went wrong.'})
  })

  it('restores a saved conversation and selects its last reply', () => {
    const restored = chatReducer(EMPTY_CHAT, {
      type: 'restore',
      conversation: {
        id: 'conv',
        messages: [
          {role: 'customer', text: 'hi', at: 'x'},
          {role: 'bot', text: 'Hello!', at: 'x', trace}
        ]
      }
    })
    expect(restored.conversationId).toBe('conv')
    expect(restored.messages[1]).toMatchObject({role: 'bot', status: 'done', route: trace.route})
    expect(restored.selectedId).toBe(restored.messages[1]?.id)
  })

  it('starts over but keeps the quota it knows', () => {
    const withQuota = chatReducer(sent, {type: 'quota', quota: trace.quota!})
    expect(chatReducer(withQuota, {type: 'reset'})).toEqual({...EMPTY_CHAT, quota: trace.quota})
  })
})
