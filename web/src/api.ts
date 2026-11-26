import type {ConversationView, Quota, StreamEvent} from '../../src/shared/api.js'
import {readNdjson} from './stream.js'

/** A failure with a message written for the person using the page */
export class ChatError extends Error {}

export async function* sendMessage(
  message: string,
  conversationId: string | undefined,
  signal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  let response: Response
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({message, conversationId}),
      signal
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ChatError("Couldn't reach Shohayok. Check your connection, then send again.")
  }
  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => ({}))) as {error?: string}
    throw new ChatError(
      body.error ?? `Shohayok answered with error ${response.status}. Send again.`
    )
  }
  yield* readNdjson<StreamEvent>(response.body)
}

export async function loadConversation(id: string): Promise<ConversationView | null> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`).catch(() => null)
  return response?.ok ? ((await response.json()) as ConversationView) : null
}

export async function loadQuota(): Promise<Quota | null> {
  const response = await fetch('/api/quota').catch(() => null)
  return response?.ok ? ((await response.json()) as Quota) : null
}
