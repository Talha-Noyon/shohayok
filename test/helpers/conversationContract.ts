import {expect, it} from 'vitest'

import {NEW_STATE} from '../../src/agent/state.js'
import {
  CONVERSATION_DAYS,
  MAX_MESSAGES,
  type ConversationStore
} from '../../src/store/conversations.js'

/** The behaviour every conversation store must have, run against each one */
export function conversationContract(open: () => Promise<ConversationStore>): void {
  it('creates a conversation with an id nobody can guess', async () => {
    const store = await open()
    const conversation = await store.create('visitor-1')
    expect(conversation.id).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(conversation).toMatchObject({visitor: 'visitor-1', messages: [], state: NEW_STATE})
    expect((await store.get(conversation.id))?.id).toBe(conversation.id)
    expect(await store.get('no-such-conversation')).toBeNull()
  })

  it('appends messages, saves the state and keeps only the latest messages', async () => {
    const store = await open()
    const {id} = await store.create('visitor-2')
    const at = new Date()
    for (let i = 0; i < MAX_MESSAGES + 4; i++) {
      await store.append(id, [{role: 'customer', text: `message ${i}`, at}], {
        ...NEW_STATE,
        failedLookups: i
      })
    }
    const saved = await store.get(id)
    expect(saved?.messages).toHaveLength(MAX_MESSAGES)
    expect(saved?.messages.at(-1)?.text).toBe(`message ${MAX_MESSAGES + 3}`)
    expect(saved?.state.failedLookups).toBe(MAX_MESSAGES + 3)
    const days = ((saved?.expiresAt.getTime() ?? 0) - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(CONVERSATION_DAYS - 0.01)
  })

  it('does not keep phone numbers in the saved text', async () => {
    const store = await open()
    const {id} = await store.create('visitor-3')
    await store.append(
      id,
      [{role: 'customer', text: 'NDI-10299 ar 01000000002', at: new Date()}],
      NEW_STATE
    )
    const text = (await store.get(id))?.messages[0]?.text
    expect(text).toContain('NDI-10299')
    expect(text).not.toContain('01000000002')
    expect(text).toContain('010•••••002')
  })
}
