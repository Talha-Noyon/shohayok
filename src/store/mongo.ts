import {MongoClient, type Collection} from 'mongodb'

import type {Config} from '../config.js'
import type {Chunk} from '../ingest/chunk.js'
import {AtlasVectorIndex, supportsVectorSearch} from '../retrieval/atlasIndex.js'
import {LocalVectorIndex} from '../retrieval/localIndex.js'
import type {VectorIndex} from '../retrieval/types.js'
import type {ChunkDoc} from './types.js'

export const CHUNKS = 'chunks'

export interface Store {
  client: MongoClient
  chunks: Collection<ChunkDoc>
  close(): Promise<void>
}

/** Hides a password in a connection string before it is printed */
export function redactUri(uri: string): string {
  return uri.replace(/\/\/([^:/@]+):([^@]+)@/, '//$1:***@')
}

export async function openStore(uri: string, dbName: string): Promise<Store> {
  const client = new MongoClient(uri, {serverSelectionTimeoutMS: 5_000})
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
  return {client, chunks: db.collection<ChunkDoc>(CHUNKS), close: () => client.close()}
}

/** Language "none": MongoDB has no Bengali stemmer, and English stemming would mangle Banglish */
export async function ensureTextIndex(chunks: Collection<ChunkDoc>): Promise<void> {
  await chunks.createIndex(
    {title: 'text', text: 'text'},
    {name: 'chunk_text', default_language: 'none', weights: {title: 3, text: 1}}
  )
}

/** Writes every chunk with its vector and removes chunks that are no longer in the data */
export async function upsertChunks(
  chunks: Collection<ChunkDoc>,
  rows: {chunk: Chunk; embedding: number[]}[],
  embedModel: string
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
            embedding,
            embedModel,
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
  const others = (await chunks.distinct('embedModel')).filter((model) => model !== embedModel)
  if (others.length > 0) {
    throw new Error(
      `The stored chunks were embedded with ${others.join(', ')}, but EMBED_MODEL is ${embedModel}. ` +
        'Run npm run ingest again.'
    )
  }
  if (backend === 'atlas') return new AtlasVectorIndex(chunks)
  const docs = await chunks
    .find({}, {projection: {docId: 1, title: 1, text: 1, embedding: 1}})
    .toArray()
  return new LocalVectorIndex(
    docs.map((doc) => ({
      chunkId: doc._id,
      docId: doc.docId,
      title: doc.title,
      text: doc.text,
      embedding: doc.embedding
    }))
  )
}
