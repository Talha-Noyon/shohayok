import type {AgentDeps, CachedAnswer} from './agent/turn.js'
import {MongoCache} from './cache/cache.js'
import type {Config} from './config.js'
import {Budget, type Quota} from './limits/budget.js'
import {MongoCounter} from './limits/counter.js'
import {RateLimiter} from './limits/rateLimit.js'
import {OpenRouterClient} from './llm/openrouter.js'
import {createProviders} from './llm/providers.js'
import type {LlmProvider, ProviderName} from './llm/types.js'
import {keywordSearch} from './retrieval/keyword.js'
import type {VectorIndex} from './retrieval/types.js'
import {MongoConversations, type ConversationDoc} from './store/conversations.js'
import {openStore, openVectorIndex, resolveVectorBackend, type Store} from './store/mongo.js'
import {MongoShopData} from './store/shopData.js'

export interface Health {
  ok: boolean
  vectorBackend: 'atlas' | 'local'
  chunks: number
  products: number
  orders: number
  quota: Quota
  providers: {chat: ProviderName; embed: ProviderName}
  /** Every provider in use answered */
  providersUp: boolean
  models: {embed: string; chat: string; rewrite: string}
}

export interface Services {
  config: Config
  store: Store
  providers: {chat: LlmProvider; embed: LlmProvider}
  vectorIndex: VectorIndex
  agent: AgentDeps
  rateLimiter: RateLimiter
  health(): Promise<Health>
  close(): Promise<void>
}

/** A cheap call that proves the provider answers: the key check for OpenRouter */
async function reachable(provider: LlmProvider): Promise<boolean> {
  try {
    if (provider instanceof OpenRouterClient) await provider.checkKey()
    else await provider.listModels()
    return true
  } catch {
    return false
  }
}

/** Connects MongoDB and the model providers, and wires the agent the server and eval share */
export async function createServices(config: Config): Promise<Services> {
  const store = await openStore(config.mongoUri, config.mongoDb)
  try {
    const backend = await resolveVectorBackend(config.vectorBackend, store.chunks)
    const vectorIndex = await openVectorIndex(store.chunks, backend, config.embedModel)
    const providers = createProviders(config)

    const counter = new MongoCounter(store.usage)
    const budget = new Budget(counter, config.budget)
    const docsOf = (ids: string[]) =>
      store.chunks
        .find({docId: {$in: ids}}, {projection: {docId: 1, title: 1, textEn: 1, textBn: 1}})
        .toArray()
    const agent: AgentDeps = {
      conversations: new MongoConversations(store.db.collection<ConversationDoc>('conversations')),
      shop: new MongoShopData(store),
      chat: providers.chat,
      embed: providers.embed,
      budget,
      vectorIndex,
      keyword: (query, k) => keywordSearch(store.chunks, query, k),
      documents: async (ids) =>
        (await docsOf(ids)).map(({docId, title, textEn, textBn}) => ({
          docId,
          title,
          textEn,
          textBn
        })),
      titles: async (ids) => new Map((await docsOf(ids)).map((doc) => [doc.docId, doc.title])),
      embeddings: new MongoCache<number[]>(store.caches as never),
      answers: new MongoCache<CachedAnswer>(store.caches as never),
      config: {
        chatModel: config.chatModel,
        rewriteModel: config.rewriteModel,
        embedModel: config.embedModel,
        topK: config.topK,
        handoffThreshold: config.handoffThreshold,
        listLimit: 5
      }
    }

    return {
      config,
      store,
      providers,
      vectorIndex,
      agent,
      rateLimiter: new RateLimiter(counter, config.rate),
      async health() {
        const inUse = [...new Set([providers.chat, providers.embed])]
        const [chunks, products, orders, quota, up] = await Promise.all([
          store.chunks.estimatedDocumentCount(),
          store.products.estimatedDocumentCount(),
          store.orders.estimatedDocumentCount(),
          budget.status(),
          Promise.all(inUse.map(reachable))
        ])
        const providersUp = up.every(Boolean)
        return {
          ok: chunks > 0 && products > 0 && providersUp,
          vectorBackend: backend,
          chunks,
          products,
          orders,
          quota,
          providers: {chat: config.chatProvider, embed: config.embedProvider},
          providersUp,
          models: {embed: config.embedModel, chat: config.chatModel, rewrite: config.rewriteModel}
        }
      },
      close: () => store.close()
    }
  } catch (error) {
    await store.close()
    throw error
  }
}
