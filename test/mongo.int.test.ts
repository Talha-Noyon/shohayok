import type {Server} from 'node:http'

import {MongoClient} from 'mongodb'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'

import type {Config} from '../src/config.js'
import {policyChunk, productChunk} from '../src/ingest/chunk.js'
import type {ProviderName} from '../src/llm/types.js'
import {answerQuestion} from '../src/rag/pipeline.js'
import {keywordSearch} from '../src/retrieval/keyword.js'
import {Retriever} from '../src/retrieval/retriever.js'
import {createApp} from '../src/server/app.js'
import {createServices, type Services} from '../src/services.js'
import {loadPolicies, loadProducts} from '../src/shop/schema.js'
import {
  ensureTextIndex,
  openStore,
  openVectorIndex,
  upsertChunks,
  type Store
} from '../src/store/mongo.js'
import {hashEmbed} from './helpers/hashEmbed.js'
import {json, sse, startFakeServer, type FakeServer} from './helpers/fakeServer.js'
import {listen, postChat, readEvents} from './helpers/http.js'

const MONGO_URI = process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017'
const DB = `shohayok_test_${process.pid}`

async function mongoReachable(): Promise<boolean> {
  const client = new MongoClient(MONGO_URI, {serverSelectionTimeoutMS: 1_500})
  try {
    await client.connect()
    return true
  } catch {
    return false
  } finally {
    await client.close()
  }
}

const reachable = await mongoReachable()
const allChunks = async () => [
  ...(await loadProducts()).map(productChunk),
  ...(await loadPolicies()).map(policyChunk)
]
const CHUNK_COUNT = 515

describe.skipIf(!reachable)('with a real MongoDB', () => {
  let store: Store

  beforeAll(async () => {
    store = await openStore(MONGO_URI, DB)
    const chunks = await allChunks()
    const rows = chunks.map((chunk) => ({chunk, embedding: hashEmbed(chunk.text)}))
    await upsertChunks(store.chunks, rows, 'hash-test')
    await ensureTextIndex(store.chunks)
  })

  afterAll(async () => {
    await store?.client.db(DB).dropDatabase()
    await store?.close()
  })

  it('stores every chunk once and removes chunks that left the data', async () => {
    expect(await store.chunks.countDocuments()).toBe(CHUNK_COUNT)
    const [first] = await allChunks()
    if (!first) throw new Error('no chunk in the data')
    const result = await upsertChunks(
      store.chunks,
      [{chunk: first, embedding: hashEmbed(first.text)}],
      'hash-test'
    )
    expect(result).toEqual({written: 1, removed: CHUNK_COUNT - 1})
    await upsertChunks(
      store.chunks,
      (await allChunks()).map((chunk) => ({chunk, embedding: hashEmbed(chunk.text)})),
      'hash-test'
    )
    expect(await store.chunks.countDocuments()).toBe(CHUNK_COUNT)
  })

  it('finds Bengali words through the $text index', async () => {
    const hits = await keywordSearch(store.chunks, 'কেতকী জামদানি শাড়ির দাম কত?', 3)
    expect(hits[0]?.docId).toBe('P001')
  })

  it('retrieves a Banglish question by vector and keyword together', async () => {
    const retriever = new Retriever({
      embed: async (texts) => texts.map((text) => hashEmbed(text)),
      vectorIndex: await openVectorIndex(store.chunks, 'local', 'hash-test'),
      keyword: (query, k) => keywordSearch(store.chunks, query, k)
    })
    const {hits, confidence} = await retriever.retrieve(['ketoki jamdhani saree er dam koto?'], 4)
    expect(hits[0]?.docId).toBe('P001')
    expect(confidence).toBeGreaterThan(0)
  })

  it('refuses to search chunks embedded by a different model', async () => {
    await expect(openVectorIndex(store.chunks, 'local', 'bge-m3')).rejects.toThrow(
      'embedded with hash-test, but EMBED_MODEL is bge-m3'
    )
  })

  const answer = ['শোরুম প্রতিদিন সকাল ১০টা থেকে রাত ৯টা পর্যন্ত খোলা। ', '[F11]']
  const embedAll = (body: unknown) =>
    (body as {input: string[]}).input.map((text) => hashEmbed(text))

  const providers = {
    ollama: {
      chatPath: '/api/chat',
      handlers: {
        '/api/tags': () => json({models: [{name: 'hash-test:latest'}]}),
        '/api/embed': (body: unknown) => json({embeddings: embedAll(body)}),
        '/api/chat': () => ({
          pieces: [
            `${JSON.stringify({message: {content: answer[0]}})}\n`,
            `${JSON.stringify({message: {content: answer[1]}, done: true})}\n`
          ]
        })
      },
      config: (url: string): Partial<Config> => ({ollamaUrl: url})
    },
    openrouter: {
      chatPath: '/api/v1/chat/completions',
      handlers: {
        '/api/v1/key': () => json({data: {is_free_tier: true}}),
        '/api/v1/embeddings': (body: unknown) =>
          json({data: embedAll(body).map((embedding, index) => ({embedding, index}))}),
        '/api/v1/chat/completions': () => ({pieces: sse(...answer)})
      },
      config: (url: string): Partial<Config> => ({
        openRouterKey: 'test-key',
        openRouterUrl: `${url}/api/v1`
      })
    }
  }

  for (const [name, provider] of Object.entries(providers) as [
    ProviderName,
    (typeof providers)[ProviderName]
  ][]) {
    describe(`the whole app, with a fake ${name}`, () => {
      let fake: FakeServer
      let services: Services
      let server: Server
      let url: string

      beforeAll(async () => {
        fake = await startFakeServer(provider.handlers)
        services = await createServices({
          mongoUri: MONGO_URI,
          mongoDb: DB,
          dnsServers: [],
          chatProvider: name,
          embedProvider: name,
          ollamaUrl: 'http://127.0.0.1:9',
          openRouterKey: undefined,
          openRouterUrl: 'http://127.0.0.1:9',
          embedModel: 'hash-test',
          chatModel: 'chat-test',
          rewriteModel: 'chat-test',
          vectorBackend: 'local',
          handoffThreshold: 0.1,
          topK: 4,
          port: 0,
          ...provider.config(fake.url)
        })
        const app = createApp({
          answer: (question, signal) => answerQuestion(question, services.pipeline, signal),
          health: () => services.health()
        })
        ;({url, server} = await listen(app))
      })

      afterAll(async () => {
        server?.close()
        await services?.close()
        await fake?.close()
      })

      it('answers a Bangla question end to end and cites the right document', async () => {
        const events = await readEvents(await postChat(url, 'আপনাদের শোরুম কখন খোলা থাকে?'))

        const meta = events[0] as {type: string; lang: string; sources: {docId: string}[]}
        expect(meta).toMatchObject({type: 'meta', lang: 'bn', handoff: false})
        expect(meta.sources[0]?.docId).toBe('F11')
        expect(events.at(-1)).toMatchObject({type: 'done', answer: answer.join('')})

        const chat = fake.requests.find((request) => request.path === provider.chatPath)
        const system = (chat?.body as {messages: {content: string}[]}).messages[0]?.content
        expect(system).toContain('[F11] Showroom and opening hours')
        expect(system).toContain('Reply in Bangla, written in Bengali script.')
      })

      it('reports health', async () => {
        expect(await (await fetch(`${url}/api/health`)).json()).toMatchObject({
          ok: true,
          vectorBackend: 'local',
          chunks: CHUNK_COUNT,
          providers: {chat: name, embed: name},
          providersUp: true
        })
      })
    })
  }
})
