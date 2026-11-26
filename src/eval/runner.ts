import {runTurn, type AgentDeps, type CachedAnswer, type TurnEvent} from '../agent/turn.js'
import {MemoryCache} from '../cache/cache.js'
import {shiftOrderDates} from '../ingest/ingest.js'
import {policyChunk, productChunk} from '../ingest/chunk.js'
import {Budget} from '../limits/budget.js'
import {MemoryCounter} from '../limits/counter.js'
import type {LlmProvider} from '../llm/types.js'
import {loadOrders, loadPolicies, loadProducts} from '../shop/schema.js'
import {MemoryConversations} from '../store/conversations.js'
import {memoryShop} from '../tools/memoryShop.js'
import type {EvalCase} from './cases.js'
import type {CaseRun} from './score.js'

/** Sends a case's earlier messages, then its question, in one conversation */
export async function runCase(item: EvalCase, deps: AgentDeps, visitor: string): Promise<CaseRun> {
  let conversationId: string | undefined
  const requests = {embed: 0, chat: 0}
  let quota = false
  let last: Extract<TurnEvent, {type: 'done'}> | undefined
  for (const message of [...item.history, item.question]) {
    last = undefined
    for await (const event of runTurn({message, conversationId, visitor}, deps)) {
      if (event.type === 'meta') conversationId = event.conversationId
      if (event.type === 'done') last = event
    }
    if (!last) throw new Error(`${item.id}: the turn did not finish`)
    requests.embed += last.trace.modelRequests.embed
    requests.chat += last.trace.modelRequests.chat
    if (last.trace.decision === 'quota') quota = true
  }
  if (!last) throw new Error(`${item.id}: no message`)
  return {answer: last.answer, trace: last.trace, requests, quota}
}

const refuse = async (): Promise<never> => {
  throw new Error('No model runs offline')
}

const noModel: LlmProvider = {
  name: 'ollama',
  listModels: async () => [],
  embed: refuse,
  chatJson: refuse,
  // eslint-disable-next-line require-yield
  chatStream: async function* () {
    return refuse()
  }
}

/**
 * The agent with the shop in memory and no model at all: the day's budget is zero, so every
 * model request is refused before it is sent, exactly as when the free requests run out. Tool
 * replies are complete; open questions stop at the keyword-only fallback.
 */
export async function offlineDeps(now = Date.now()): Promise<AgentDeps> {
  const [products, orders, policies] = await Promise.all([
    loadProducts(),
    loadOrders(),
    loadPolicies()
  ])
  const chunks = [...products.map(productChunk), ...policies.map(policyChunk)]
  const byDoc = new Map(chunks.map((chunk) => [chunk.docId, chunk]))
  return {
    conversations: new MemoryConversations(),
    shop: memoryShop(products, shiftOrderDates(orders, now)),
    chat: noModel,
    embed: noModel,
    budget: new Budget(new MemoryCounter(), {dailyLimit: 0, visitorLimit: 0, enabled: true}),
    vectorIndex: {kind: 'local', search: async () => []},
    keyword: async () => [],
    documents: async (ids) =>
      ids.flatMap((id) => {
        const chunk = byDoc.get(id)
        return chunk ? [chunk] : []
      }),
    titles: async (ids) => new Map(ids.map((id) => [id, byDoc.get(id)?.title ?? id])),
    embeddings: new MemoryCache<number[]>(),
    answers: new MemoryCache<CachedAnswer>(),
    config: {
      chatModel: 'none',
      rewriteModel: 'none',
      embedModel: 'none',
      topK: 4,
      handoffThreshold: 0.25,
      listLimit: 5
    }
  }
}
