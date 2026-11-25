import type {Config} from './config.js'
import {OpenRouterClient} from './llm/openrouter.js'
import {createProviders} from './llm/providers.js'
import type {LlmProvider, ProviderName} from './llm/types.js'
import type {PipelineDeps} from './rag/pipeline.js'
import {rewriteBanglish} from './rag/rewrite.js'
import {keywordSearch} from './retrieval/keyword.js'
import {Retriever} from './retrieval/retriever.js'
import type {VectorIndex} from './retrieval/types.js'
import {openStore, openVectorIndex, resolveVectorBackend, type Store} from './store/mongo.js'

export interface Health {
  ok: boolean
  vectorBackend: 'atlas' | 'local'
  chunks: number
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
  pipeline: PipelineDeps
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

/** Connects MongoDB and the model providers, and wires the pipeline the server and eval share */
export async function createServices(config: Config): Promise<Services> {
  const store = await openStore(config.mongoUri, config.mongoDb)
  try {
    const backend = await resolveVectorBackend(config.vectorBackend, store.chunks)
    const vectorIndex = await openVectorIndex(store.chunks, backend, config.embedModel)
    const providers = createProviders(config)
    const retriever = new Retriever({
      embed: (texts) => providers.embed.embed(config.embedModel, texts),
      vectorIndex,
      keyword: (query, k) => keywordSearch(store.chunks, query, k)
    })

    const pipeline: PipelineDeps = {
      retrieve: (queries, topK) => retriever.retrieve(queries, topK),
      rewrite: (question) =>
        rewriteBanglish(
          (model, messages, schema) => providers.chat.chatJson(model, messages, schema),
          config.rewriteModel,
          question,
          (error) =>
            console.warn(
              `Banglish rewrite skipped: ${error instanceof Error ? error.message : error}`
            )
        ),
      generate: (messages, signal) => providers.chat.chatStream(config.chatModel, messages, signal),
      topK: config.topK,
      handoffThreshold: config.handoffThreshold
    }

    return {
      config,
      store,
      providers,
      vectorIndex,
      pipeline,
      async health() {
        const inUse = [...new Set([providers.chat, providers.embed])]
        const [chunks, up] = await Promise.all([
          store.chunks.estimatedDocumentCount(),
          Promise.all(inUse.map(reachable))
        ])
        const providersUp = up.every(Boolean)
        return {
          ok: chunks > 0 && providersUp,
          vectorBackend: backend,
          chunks,
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
