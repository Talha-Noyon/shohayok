import {
  MongoClient,
  type Collection,
  type Db,
  type Document,
  type OptionalUnlessRequiredId
} from 'mongodb'

import type {Config} from '../config.js'
import type {Chunk} from '../ingest/chunk.js'
import {AtlasVectorIndex, supportsVectorSearch} from '../retrieval/atlasIndex.js'
import {LocalVectorIndex} from '../retrieval/localIndex.js'
import type {VectorIndex} from '../retrieval/types.js'
import type {CacheDoc} from '../cache/cache.js'
import type {CounterDoc} from '../limits/counter.js'
import type {ChunkDoc, OrderDoc, ProductDoc} from './types.js'

export const CHUNKS = 'chunks'

export interface Store {
  client: MongoClient
  db: Db
  chunks: Collection<ChunkDoc>
  products: Collection<ProductDoc>
  orders: Collection<OrderDoc>
  /** Daily model budget and rate-limit counters */
  usage: Collection<CounterDoc>
  /** Query embeddings and repeated answers */
  caches: Collection<CacheDoc<unknown>>
  close(): Promise<void>
}

/** Hides a password in a connection string before it is printed */
export function redactUri(uri: string): string {
  return uri.replace(/\/\/([^:/@]+):([^@]+)@/, '//$1:***@')
}

export async function openStore(uri: string, dbName: string): Promise<Store> {
  // A small pool: every serverless instance opens its own, and a free Atlas cluster allows 500
  const client = new MongoClient(uri, {serverSelectionTimeoutMS: 5_000, maxPoolSize: 10})
  try {
    await client.connect()
  } catch (error) {
    throw new Error(
      `Cannot connect to MongoDB at ${redactUri(uri)}: ${error instanceof Error ? error.message : error}`,
      {cause: error}
    )
  }
  const db = client.db(dbName)
  // Atlas lists and builds search indexes only on a collection that exists
  if (!(await db.listCollections({name: CHUNKS}).hasNext())) await db.createCollection(CHUNKS)
  return {
    client,
    db,
    chunks: db.collection<ChunkDoc>(CHUNKS),
    products: db.collection<ProductDoc>('products'),
    orders: db.collection<OrderDoc>('orders'),
    usage: db.collection<CounterDoc>('usage'),
    caches: db.collection<CacheDoc<unknown>>('caches'),
    close: () => client.close()
  }
}

/** Language "none": MongoDB has no Bengali stemmer, and English stemming would mangle Banglish */
export async function ensureTextIndex(chunks: Collection<ChunkDoc>): Promise<void> {
  await chunks.createIndex(
    {title: 'text', text: 'text'},
    {name: 'chunk_text', default_language: 'none', weights: {title: 3, text: 1}}
  )
}

/**
 * The lookups the tools make, a product by its collection name or by category and price, and
 * the TTL indexes that delete expired counters and cache entries
 */
export async function ensureIndexes(store: Store): Promise<void> {
  await store.products.createIndex({collection: 1})
  await store.products.createIndex({category: 1, price: 1})
  await store.usage.createIndex({expiresAt: 1}, {expireAfterSeconds: 0})
  await store.caches.createIndex({expiresAt: 1}, {expireAfterSeconds: 0})
}

/** Swaps a collection's contents for new documents */
export async function replaceAll<T extends Document>(
  collection: Collection<T>,
  docs: OptionalUnlessRequiredId<T>[]
): Promise<void> {
  await collection.deleteMany({})
  if (docs.length > 0) await collection.insertMany(docs)
}

/**
 * Writes every chunk, with its vector when there is one, and removes chunks that are no longer
 * in the data
 */
export async function upsertChunks(
  chunks: Collection<ChunkDoc>,
  rows: {chunk: Chunk; embedding?: number[]}[],
  embedModel?: string
): Promise<{written: number; removed: number}> {
  const updatedAt = new Date()
  if (rows.length > 0) {
    await chunks.bulkWrite(
      rows.map(({chunk, embedding}) => ({
        replaceOne: {
          filter: {_id: chunk.id},
          replacement: {
            docId: chunk.docId,
            type: chunk.type,
            title: chunk.title,
            text: chunk.text,
            textEn: chunk.textEn,
            textBn: chunk.textBn,
            filters: chunk.filters,
            ...(embedding && embedModel && {embedding, embedModel}),
            updatedAt
          },
          upsert: true
        }
      }))
    )
  }
  const {deletedCount} = await chunks.deleteMany({_id: {$nin: rows.map(({chunk}) => chunk.id)}})
  return {written: rows.length, removed: deletedCount}
}

export async function resolveVectorBackend(
  setting: Config['vectorBackend'],
  chunks: Collection<ChunkDoc>
): Promise<'atlas' | 'local'> {
  if (setting !== 'auto') return setting
  return (await supportsVectorSearch(chunks)) ? 'atlas' : 'local'
}

/**
 * Opens vector search over the stored chunks. Refuses chunks embedded by another model, since
 * their vectors cannot be compared with this model's queries.
 */
export async function openVectorIndex(
  chunks: Collection<ChunkDoc>,
  backend: 'atlas' | 'local',
  embedModel: string
): Promise<VectorIndex> {
  const others = (await chunks.distinct('embedModel')).filter(
    (model) => model && model !== embedModel
  )
  if (others.length > 0) {
    throw new Error(
      `The stored chunks were embedded with ${others.join(', ')}, but EMBED_MODEL is ${embedModel}. ` +
        'Run npm run ingest again.'
    )
  }
  if (backend === 'atlas') return new AtlasVectorIndex(chunks)
  const docs = await chunks
    .find(
      {embedding: {$exists: true}},
      {projection: {docId: 1, title: 1, text: 1, textEn: 1, textBn: 1, filters: 1, embedding: 1}}
    )
    .toArray()
  return new LocalVectorIndex(
    docs.map((doc) => ({
      chunkId: doc._id,
      docId: doc.docId,
      title: doc.title,
      text: doc.text,
      textEn: doc.textEn,
      textBn: doc.textBn,
      filters: doc.filters,
      embedding: doc.embedding ?? []
    }))
  )
}
