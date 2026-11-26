import type {
  ConversationView,
  Lang,
  Quota,
  Source,
  StreamEvent,
  Trace
} from '../../src/shared/api.js'

export interface UiMessage {
  id: string
  role: 'customer' | 'bot'
  text: string
  status: 'pending' | 'streaming' | 'done' | 'error'
  error?: string
  lang?: Lang
  sources: Source[]
  route?: Trace['route']
  trace?: Trace
}

export interface ChatState {
  conversationId?: string
  messages: UiMessage[]
  /** The reply the inspector shows */
  selectedId?: string
  quota?: Quota
}

export type ChatAction =
  | {type: 'restore'; conversation: ConversationView}
  | {type: 'reset'}
  | {type: 'sent'; customerId: string; botId: string; text: string}
  | {type: 'event'; botId: string; event: StreamEvent}
  | {type: 'select'; id: string}
  | {type: 'quota'; quota: Quota}

export const EMPTY_CHAT: ChatState = {messages: []}

function updateBot(
  state: ChatState,
  botId: string,
  change: (message: UiMessage) => UiMessage
): ChatState {
  return {
    ...state,
    messages: state.messages.map((message) => (message.id === botId ? change(message) : message))
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'restore': {
      const messages = action.conversation.messages.map((message, i): UiMessage => ({
        id: `saved-${i}`,
        role: message.role,
        text: message.text,
        status: 'done',
        lang: message.trace?.language.lang,
        sources: [],
        route: message.trace?.route,
        trace: message.trace
      }))
      const lastReply = messages.findLast((message) => message.role === 'bot')
      return {
        ...state,
        conversationId: action.conversation.id,
        messages,
        selectedId: lastReply?.id
      }
    }
    case 'reset':
      return {...EMPTY_CHAT, quota: state.quota}
    case 'sent':
      return {
        ...state,
        messages: [
          ...state.messages,
          {id: action.customerId, role: 'customer', text: action.text, status: 'done', sources: []},
          {id: action.botId, role: 'bot', text: '', status: 'pending', sources: []}
        ]
      }
    case 'select':
      return {...state, selectedId: action.id}
    case 'quota':
      return {...state, quota: action.quota}
    case 'event': {
      const {event, botId} = action
      switch (event.type) {
        case 'meta':
          return {
            ...updateBot(state, botId, (message) => ({
              ...message,
              status: 'streaming',
              lang: event.lang,
              sources: event.sources,
              route: event.route
            })),
            conversationId: event.conversationId
          }
        case 'token':
          return updateBot(state, botId, (message) => ({
            ...message,
            status: 'streaming',
            text: message.text + event.text
          }))
        case 'done':
          return {
            ...updateBot(state, botId, (message) => ({
              ...message,
              status: 'done',
              text: event.answer,
              trace: event.trace,
              route: event.trace.route
            })),
            selectedId: botId,
            quota: event.trace.quota ?? state.quota
          }
        case 'error':
          return updateBot(state, botId, (message) => ({
            ...message,
            status: 'error',
            error: event.message
          }))
      }
    }
  }
}
