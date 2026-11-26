import {cachedEmbedder, cacheKey, type Cache} from '../cache/cache.js'
import {detectLanguage, explainLanguage, hasLetters, type Lang} from '../lang/detect.js'
import type {Budget} from '../limits/budget.js'
import {budgeted, QuotaExhaustedError, type RequestKind} from '../llm/budgeted.js'
import type {ChatInfo, LlmProvider} from '../llm/types.js'
import {extractEntities} from '../nlu/entities.js'
import {detectIntents} from '../nlu/intents.js'
import {normalize} from '../nlu/normalize.js'
import {renderReply} from '../reply/templates.js'
import {Retriever, type Retrieval} from '../retrieval/retriever.js'
import type {Hit, VectorIndex} from '../retrieval/types.js'
import type {Product} from '../shop/schema.js'
import type {ConversationStore} from '../store/conversations.js'
import {
  checkStock,
  deliveryFee,
  listProducts,
  orderStatus,
  requestCallback
} from '../tools/tools.js'
import type {ShopData, ToolResult} from '../tools/types.js'
import {buildAnswerMessages, type HistoryTurn, type PromptDoc} from './prompt.js'
import {rewriteQuestion, type Rewrite} from './rewrite.js'
import {route, type ProductRef, type Route} from './route.js'
import {applyResult, type ConversationState} from './state.js'
import type {Source, TurnEvent} from '../shared/api.js'
import {traceEntities, type Trace} from './trace.js'

export type {Source, TurnEvent} from '../shared/api.js'

export interface CachedAnswer {
  text: string
  sources: Source[]
  trace: Trace
}

export interface AgentConfig {
  chatModel: string
  rewriteModel: string
  embedModel: string
  topK: number
  handoffThreshold: number
  /** Products a list reply shows */
  listLimit: number
}

export interface AgentDeps {
  conversations: ConversationStore
  shop: ShopData
  /** The providers as configured. The turn wraps them in the budget, per visitor. */
  chat: LlmProvider
  embed: LlmProvider
  budget: Budget
  vectorIndex: VectorIndex
  keyword(query: string, k: number): Promise<Hit[]>
  /** The chunks of these documents, for an answer about a product the customer pointed at */
  documents(docIds: string[]): Promise<(PromptDoc & {title: string})[]>
  /** Titles of these documents, to name a reply's sources */
  titles(docIds: string[]): Promise<Map<string, string>>
  embeddings: Cache<number[]>
  answers: Cache<CachedAnswer>
  config: AgentConfig
}

export interface TurnInput {
  message: string
  conversationId?: string
  visitor: string
  signal?: AbortSignal
}

const ANSWER_TTL = 7 * 86_400
const CITED = /\[([PF]\d{2,3})\]/g

const routeSummary = (decided: Route): Trace['route'] => ({
  kind: decided.kind,
  ...(decided.kind === 'tool' && {tool: decided.tool}),
  reason: decided.reason
})

type ToolRoute = Extract<Route, {kind: 'tool'}>

/** The products a reference or a name points at: none, one, or several to choose from */
async function resolveProducts(ref: ProductRef, shop: ShopData): Promise<Product[]> {
  if (ref.by === 'id') return shop.getProducts([ref.id])
  const {items} = await shop.findProducts(
    {
      collection: ref.collection,
      styles: ref.styles.length > 0 ? ref.styles : undefined,
      category: ref.category
    },
    10
  )
  return items
}

async function runTool(
  decided: ToolRoute,
  state: ConversationState,
  deps: AgentDeps,
  conversationId: string
): Promise<ToolResult> {
  switch (decided.tool) {
    case 'smalltalk':
      return {tool: 'smalltalk', kind: decided.smalltalk}
    case 'clarify':
      return {tool: 'clarify'}
    case 'order_status':
      return orderStatus(decided, deps.shop, state.failedLookups)
    case 'delivery_fee':
      return deliveryFee(decided.place)
    case 'request_callback':
      return requestCallback({...decided, conversationId}, deps.shop)
    case 'list_products':
      return listProducts(decided.query, deps.shop, deps.config.listLimit)
    case 'check_stock':
    case 'product_info': {
      const products = await resolveProducts(decided.product, deps.shop)
      const [only] = products
      if (!only) return {tool: 'check_stock', outcome: 'no_product'}
      if (products.length > 1) {
        return {
          tool: 'list_products',
          outcome: 'found',
          items: products.slice(0, deps.config.listLimit),
          total: products.length,
          query: decided.product.by === 'name' ? {collection: decided.product.collection} : {}
        }
      }
      if (decided.tool === 'product_info') return {tool: 'product_info', product: only}
      return checkStock(only, {color: decided.color, size: decided.size})
    }
  }
}

const outcomeOf = (result: ToolResult) => ('outcome' in result ? result.outcome : undefined)

/**
 * Answers one customer message. Rules route it; tools answer from data with fixed replies; open
 * questions are searched and answered by the model, with a rewrite only when the message cannot
 * be understood alone. Every model request passes the visitor's budget. Events stream out: the
 * route and sources first, then the reply, then the trace.
 */
export async function* runTurn(input: TurnInput, deps: AgentDeps): AsyncGenerator<TurnEvent> {
  const started = performance.now()
  const elapsed = () => Math.round(performance.now() - started)
  const since = (at: number) => Math.round(performance.now() - at)
  const {message, visitor} = input

  const conversation =
    (input.conversationId ? await deps.conversations.get(input.conversationId) : null) ??
    (await deps.conversations.create(visitor))
  const state = conversation.state
  const history: HistoryTurn[] = conversation.messages.map(({role, text}) => ({role, text}))

  const evidence = explainLanguage(message)
  const lang: Lang = hasLetters(message) ? evidence.lang : (state.lang ?? 'en')
  const entities = extractEntities(message)
  const intents = detectIntents(message, entities)
  const decided = route(message, entities, intents, state)

  const requests = {embed: 0, chat: 0}
  const count = (kind: RequestKind) => {
    requests[kind] += 1
  }
  const chat = budgeted(deps.chat, deps.budget, visitor, count)
  const embedder = budgeted(deps.embed, deps.budget, visitor, count)

  const trace: Trace = {
    language: {...evidence, lang},
    entities: traceEntities(entities),
    intents: [...intents],
    route: routeSummary(decided),
    decision: 'tool',
    modelRequests: requests,
    totalMs: 0
  }

  const meta = (sources: Source[]): TurnEvent => ({
    type: 'meta',
    conversationId: conversation.id,
    lang,
    route: trace.route,
    sources
  })

  const named = async (ids: string[]): Promise<Source[]> => {
    if (ids.length === 0) return []
    const titles = await deps.titles(ids)
    return ids.map((docId) => ({docId, title: titles.get(docId) ?? docId}))
  }

  type Outcome = {text: string; state: ConversationState}

  async function* emit(
    result: ToolResult,
    routed: Route,
    toolStarted: number
  ): AsyncGenerator<TurnEvent, Outcome> {
    const reply = renderReply(result, lang)
    trace.tool = {name: result.tool, outcome: outcomeOf(result), ms: since(toolStarted)}
    trace.decision =
      result.tool === 'handoff' ? 'handoff' : result.tool === 'quota' ? 'quota' : 'tool'
    yield meta(await named(reply.sources))
    yield {type: 'token', text: reply.text}
    const next = applyResult(state, routed, result, reply.sources)
    if (result.tool === 'handoff') next.pending = {tool: 'request_callback', question: message}
    return {text: reply.text, state: next}
  }

  async function* toolTurn(routed: ToolRoute): AsyncGenerator<TurnEvent, Outcome> {
    const at = performance.now()
    return yield* emit(await runTool(routed, state, deps, conversation.id), routed, at)
  }

  async function* quotaTurn(routed: Route): AsyncGenerator<TurnEvent, Outcome> {
    const at = performance.now()
    const hits = await deps.keyword(message, 3)
    trace.search = {
      queries: [message],
      hits: hits.map((hit) => ({docId: hit.docId, title: hit.title, cosine: null, rrf: 0})),
      confidence: null,
      threshold: deps.config.handoffThreshold,
      keywordOnly: true,
      embedMs: 0,
      searchMs: since(at)
    }
    const {resetsAt} = await deps.budget.status(visitor)
    const unique = [...new Map(hits.map((hit) => [hit.docId, hit])).values()]
    const result: ToolResult = {
      tool: 'quota',
      hits: unique.map(({docId, title}) => ({docId, title})),
      resetsAt
    }
    return yield* emit(result, routed, at)
  }

  async function rewrite(): Promise<Rewrite | null> {
    const at = performance.now()
    const info: ChatInfo = {}
    let failure: unknown
    const result = await rewriteQuestion(
      (model, messages, schema) => chat.chatJson(model, messages, schema, info),
      deps.config.rewriteModel,
      message,
      history,
      (error) => {
        failure = error
      }
    )
    trace.rewrite = {...(result ?? {}), ok: result !== null, ms: since(at), model: info.model}
    if (failure instanceof QuotaExhaustedError) throw failure
    return result
  }

  /** The rewrite may show the message was a tool question after all: "oitar dam koto?" */
  function reroute(rewritten: Rewrite): ToolRoute | undefined {
    const text = rewritten.english
    const found = extractEntities(text)
    const again = route(text, found, detectIntents(text, found), state)
    if (again.kind !== 'tool' || again.tool === 'smalltalk' || again.tool === 'clarify') return
    const rerouted = {...again, reason: `after a rewrite: ${again.reason}`}
    trace.route = routeSummary(rerouted)
    return rerouted
  }

  async function search(queries: string[]): Promise<Retrieval> {
    const embed = cachedEmbedder(
      (texts) => embedder.embed(deps.config.embedModel, texts),
      deps.embeddings,
      deps.config.embedModel
    )
    const retriever = new Retriever({
      embed: async (texts) => (await embed(texts)).vectors,
      vectorIndex: deps.vectorIndex,
      keyword: deps.keyword
    })
    const result = await retriever.retrieve(queries, deps.config.topK)
    trace.search = {
      queries,
      hits: result.hits.map((hit) => ({
        docId: hit.docId,
        title: hit.title,
        cosine: hit.cosine,
        rrf: hit.rrf
      })),
      confidence: result.confidence,
      threshold: deps.config.handoffThreshold,
      keywordOnly: false,
      embedMs: result.embedMs,
      searchMs: result.searchMs
    }
    return result
  }

  const confident = (result: Retrieval) =>
    result.confidence !== null && result.confidence >= deps.config.handoffThreshold

  async function* generate(
    docs: (PromptDoc & {title: string})[],
    routed: Route,
    cacheAs?: string
  ): AsyncGenerator<TurnEvent, Outcome> {
    const sources = [...new Map(docs.map((doc) => [doc.docId, doc])).values()].map(
      ({docId, title}) => ({docId, title})
    )
    yield meta(sources)
    const info: ChatInfo = {}
    let text = ''
    let firstTokenMs: number | null = null
    try {
      const messages = buildAnswerMessages({question: message, lang, history, docs})
      for await (const piece of chat.chatStream(
        deps.config.chatModel,
        messages,
        input.signal,
        info
      )) {
        firstTokenMs ??= elapsed()
        text += piece
        yield {type: 'token', text: piece}
      }
    } catch (error) {
      if (!(error instanceof QuotaExhaustedError) || text !== '') throw error
      const {resetsAt} = await deps.budget.status(visitor)
      const result: ToolResult = {tool: 'quota', hits: sources.slice(0, 3), resetsAt}
      const reply = renderReply(result, lang)
      trace.decision = 'quota'
      yield {type: 'token', text: reply.text}
      return {text: reply.text, state: applyResult(state, routed, result, [])}
    }
    trace.decision = 'answer'
    trace.answer = {model: info.model, firstTokenMs, replyLang: detectLanguage(text)}
    const cited = [...text.matchAll(CITED)].map((match) => match[1] ?? '')
    if (cacheAs) {
      await deps.answers.set(cacheAs, {text, sources, trace: {...trace}}, ANSWER_TTL)
    }
    return {text, state: applyResult(state, routed, undefined, cited)}
  }

  async function* answerTurn(
    routed: Extract<Route, {kind: 'answer'}>
  ): AsyncGenerator<TurnEvent, Outcome> {
    // A question about the product just shown is answered from that product alone
    if (routed.product) {
      const [product] = await resolveProducts(routed.product, deps.shop)
      const docs = product ? await deps.documents([product.id]) : []
      if (docs.length === 0) return yield* emit({tool: 'handoff'}, routed, performance.now())
      try {
        return yield* generate(docs, routed)
      } catch (error) {
        if (!(error instanceof QuotaExhaustedError) || !product) throw error
        return yield* emit({tool: 'product_info', product}, routed, performance.now())
      }
    }

    // A first question without personal details may have been answered before
    const cacheable = history.length === 0 && !entities.phone && !entities.orderId
    const key = cacheKey('answer', lang, normalize(message))
    if (cacheable) {
      const cached = await deps.answers.get(key)
      if (cached) {
        trace.decision = 'cached'
        trace.search = cached.trace.search
        trace.answer = cached.trace.answer
        yield meta(cached.sources)
        yield {type: 'token', text: cached.text}
        const cited = [...cached.text.matchAll(CITED)].map((match) => match[1] ?? '')
        return {text: cached.text, state: applyResult(state, routed, undefined, cited)}
      }
    }

    try {
      // "oitar dam koto?" means nothing alone: rewrite it with the conversation first
      let rewritten = entities.reference && history.length > 0 ? await rewrite() : null
      if (rewritten) {
        const rerouted = reroute(rewritten)
        if (rerouted) return yield* toolTurn(rerouted)
      }
      const queries = (r: Rewrite | null) => (r ? [message, r.bangla, r.english] : [message])
      let found = await search(queries(rewritten))

      // Banglish, or a follow-up, that search could not place: rewrite it and try once more
      if (!rewritten && !confident(found) && (lang === 'banglish' || history.length > 0)) {
        rewritten = await rewrite()
        if (rewritten) {
          const rerouted = reroute(rewritten)
          if (rerouted) return yield* toolTurn(rerouted)
          found = await search(queries(rewritten))
        }
      }

      if (!confident(found)) return yield* emit({tool: 'handoff'}, routed, performance.now())
      return yield* generate(found.hits, routed, cacheable && !rewritten ? key : undefined)
    } catch (error) {
      if (error instanceof QuotaExhaustedError) return yield* quotaTurn(routed)
      throw error
    }
  }

  const outcome = decided.kind === 'tool' ? yield* toolTurn(decided) : yield* answerTurn(decided)

  trace.totalMs = elapsed()
  trace.quota = await deps.budget.status(visitor)
  const at = new Date()
  await deps.conversations.append(
    conversation.id,
    [
      {role: 'customer', text: message, at},
      {role: 'bot', text: outcome.text, at, trace}
    ],
    {...outcome.state, lang}
  )
  yield {type: 'done', answer: outcome.text, trace}
}
