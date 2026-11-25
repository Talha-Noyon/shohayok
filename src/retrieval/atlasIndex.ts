import type {Collection} from 'mongodb'

import type {ChunkDoc} from '../store/types.js'
import type {Hit, VectorIndex} from './types.js'

export const VECTOR_INDEX_NAME = 'chunk_vectors'

/**
 * Atlas reports cosine similarity rescaled to 0..1, as (1 + cosine) / 2. Undoing that lets one
 * handoff threshold work with both vector backends.
 */
export function atlasScoreToCosine(score: number): number {
  return 2 * score - 1
}

/** Vector search with `$vectorSearch`, on Atlas or the mongodb-atlas-local image */
export class AtlasVectorIndex implements VectorIndex {
  readonly kind = 'atlas' as const
  private readonly chunks: Collection<ChunkDoc>

  constructor(chunks: Collection<ChunkDoc>) {
    this.chunks = chunks
  }

  async search(vector: number[], k: number): Promise<Hit[]> {
    const docs = await this.chunks
      .aggregate<{_id: string; docId: string; title: string; text: string; score: number}>([
        {
          $vectorSearch: {
            index: VECTOR_INDEX_NAME,
            path: 'embedding',
            queryVector: vector,
            numCandidates: Math.max(100, k * 20),
            limit: k
          }
        },
        {$project: {docId: 1, title: 1, text: 1, score: {$meta: 'vectorSearchScore'}}}
      ])
      .toArray()
    return docs.map((doc) => ({
      chunkId: doc._id,
      docId: doc.docId,
      title: doc.title,
      text: doc.text,
      score: atlasScoreToCosine(doc.score)
    }))
  }
}

/** True on servers that run Atlas Search: Atlas itself and the mongodb-atlas-local image */
export async function supportsVectorSearch(chunks: Collection<ChunkDoc>): Promise<boolean> {
  try {
    await chunks.listSearchIndexes().toArray()
    return true
  } catch {
    return false
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The fields of a `$listSearchIndexes` entry that this module reads */
interface SearchIndexInfo {
  name: string
  queryable?: boolean
  latestDefinition?: {fields?: {numDimensions?: number}[]}
}

/**
 * Creates the vector index, or recreates it when the embedding size changed, and waits until it
 * can be queried. Atlas builds search indexes in the background.
 */
export async function ensureVectorSearchIndex(
  chunks: Collection<ChunkDoc>,
  dimensions: number,
  timeoutMs = 180_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  const current = async () =>
    (await chunks.listSearchIndexes(VECTOR_INDEX_NAME).toArray())[0] as SearchIndexInfo | undefined

  const existing = await current()
  const existingDimensions = existing?.latestDefinition?.fields?.[0]?.numDimensions
  if (existing && existingDimensions !== dimensions) {
    await chunks.dropSearchIndex(VECTOR_INDEX_NAME)
    while (await current()) {
      if (Date.now() > deadline) throw new Error('Timed out dropping the old vector index')
      await sleep(2_000)
    }
  }
  if (!existing || existingDimensions !== dimensions) {
    await chunks.createSearchIndex({
      name: VECTOR_INDEX_NAME,
      type: 'vectorSearch',
      definition: {
        fields: [
          {type: 'vector', path: 'embedding', numDimensions: dimensions, similarity: 'cosine'}
        ]
      }
    })
  }
  while (!(await current())?.queryable) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the vector index to build')
    await sleep(2_000)
  }
}
