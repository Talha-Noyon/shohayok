import {useCallback, useEffect, useReducer, useRef} from 'react'

import {ChatError, loadConversation, loadQuota, sendMessage} from './api.js'
import {chatReducer, EMPTY_CHAT} from './chatState.js'

const STORAGE_KEY = 'shohayok.conversation'

/** The conversation id survives a reload. Storage can be blocked, so every access may fail. */
function storedId(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

function store(id: string | undefined): void {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // The conversation still works; it just will not come back after a reload
  }
}

export function useChat() {
  const [state, dispatch] = useReducer(chatReducer, EMPTY_CHAT)
  const running = useRef<AbortController | null>(null)
  const busy = state.messages.some(
    (message) => message.status === 'pending' || message.status === 'streaming'
  )

  useEffect(() => {
    let cancelled = false
    void loadQuota().then((quota) => {
      if (!cancelled && quota) dispatch({type: 'quota', quota})
    })
    const id = storedId()
    if (id) {
      void loadConversation(id).then((conversation) => {
        if (cancelled) return
        if (conversation) dispatch({type: 'restore', conversation})
        else store(undefined)
      })
    }
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (state.conversationId) store(state.conversationId)
  }, [state.conversationId])

  const send = useCallback(
    async (text: string) => {
      const message = text.trim()
      if (!message || busy) return
      const botId = crypto.randomUUID()
      dispatch({type: 'sent', customerId: crypto.randomUUID(), botId, text: message})
      const controller = new AbortController()
      running.current = controller
      try {
        for await (const event of sendMessage(message, state.conversationId, controller.signal)) {
          dispatch({type: 'event', botId, event})
        }
      } catch (error) {
        if (controller.signal.aborted) return
        const reason =
          error instanceof ChatError ? error.message : 'Something went wrong. Send again.'
        dispatch({type: 'event', botId, event: {type: 'error', message: reason}})
      }
    },
    [busy, state.conversationId]
  )

  const reset = useCallback(() => {
    running.current?.abort()
    store(undefined)
    dispatch({type: 'reset'})
  }, [])

  const select = useCallback((id: string) => dispatch({type: 'select', id}), [])

  return {state, busy, send, reset, select}
}
