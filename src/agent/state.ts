import type {Lang} from '../lang/detect.js'
import type {ToolName, ToolResult} from '../tools/types.js'
import type {Route} from './route.js'

/** A lookup waiting for details the customer has not sent yet */
export type Pending =
  | {tool: 'order_status'; orderId?: string; phone?: string}
  | {tool: 'request_callback'; question: string}

/** What a conversation remembers between messages, without asking a model */
export interface ConversationState {
  /** The language of the last message that had letters in it */
  lang?: Lang
  /** Lasts one message: the next one may fill it in */
  pending?: Pending
  lastTool?: ToolName | 'answer'
  /** Products the last reply named, in order, so "the second one" can be found */
  lastProducts: string[]
  /** Failed order lookups in this conversation */
  failedLookups: number
}

export const NEW_STATE: ConversationState = {lastProducts: [], failedLookups: 0}

const PRODUCT_ID = /^P\d{3}$/

/** The state after a reply. `sources` are the documents the reply named or used. */
export function applyResult(
  state: ConversationState,
  route: Route,
  result: ToolResult | undefined,
  sources: string[]
): ConversationState {
  const products = sources.filter((id) => PRODUCT_ID.test(id))
  const next: ConversationState = {
    ...state,
    pending: undefined,
    lastTool: route.kind === 'tool' ? route.tool : 'answer',
    lastProducts: products.length > 0 ? products : state.lastProducts
  }

  if (result?.tool === 'order_status' && route.kind === 'tool' && route.tool === 'order_status') {
    if (result.outcome === 'missing') {
      next.pending = {tool: 'order_status', orderId: route.orderId, phone: route.phone}
    }
    if (result.outcome === 'not_found') next.failedLookups = state.failedLookups + 1
  }
  if (
    result?.tool === 'request_callback' &&
    result.outcome === 'missing' &&
    route.kind === 'tool' &&
    route.tool === 'request_callback'
  ) {
    next.pending = {tool: 'request_callback', question: route.question}
  }
  return next
}
