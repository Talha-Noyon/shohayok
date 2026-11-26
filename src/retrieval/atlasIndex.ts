import type {Collection} from 'mongodb'

import type {ChunkDoc} from '../store/types.js'
import {toMongoFilter, type Hit, type SearchFilter, type VectorIndex} from './types.js'

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

  async search(vector: number[], k: number, filter?: SearchFilter): Promise<Hit[]> {
    const query = toMongoFilter(filter)
    const docs = await this.chunks
      .aggregate<Omit<Hit, 'chunkId'> & {_id: string}>([
        {
          $vectorSearch: {
            index: VECTOR_INDEX_NAME,
            path: 'embedding',
            queryVector: vector,
            numCandidates: Math.max(100, k * 20),
            limit: k,
            ...(Object.keys(query).length > 0 && {filter: query})
          }
        },
        {
          $project: {
            docId: 1,
            title: 1,
            text: 1,
            textEn: 1,
            textBn: 1,
            score: {$meta: 'vectorSearchScore'}
          }
        }
      ])
      .toArray()
    return docs.map(({_id, score, ...doc}) => ({
      chunkId: _id,
      ...doc,
      score: atlasScoreToCosine(score)
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

/** The chunk fields that `$vectorSearch` can filter on. Atlas needs each one declared. */
export const FILTER_PATHS = ['filters.type', 'filters.category', 'filters.colors', 'filters.price']

interface IndexField {
  type: string
  path: string
  numDimensions?: number
  similarity?: string
}

export interface VectorIndexDefinition {
  fields: IndexField[]
}

export function vectorIndexDefinition(dimensions: number): VectorIndexDefinition {
  return {
    fields: [
      {type: 'vector', path: 'embedding', numDimensions: dimensions, similarity: 'cosine'},
      ...FILTER_PATHS.map((path) => ({type: 'filter', path}))
    ]
  }
}

/** True when the index is missing, or built for another vector size or other filter fields */
export function needsRebuild(
  existing: VectorIndexDefinition | undefined,
  wanted: VectorIndexDefinition
): boolean {
  const describe = (definition: VectorIndexDefinition) =>
    definition.fields
      .map((field) => `${field.type}:${field.path}:${field.numDimensions ?? ''}`)
      .sort()
      .join('|')
  return !existing?.fields || describe(existing) !== describe(wanted)
}

/** The fields of a `$listSearchIndexes` entry that this module reads */
interface SearchIndexInfo {
  name: string
  queryable?: boolean
  latestDefinition?: VectorIndexDefinition
}

/**
 * Creates the vector index, or recreates it when the embedding size or the filter fields changed,
 * and waits until it can be queried. Atlas builds search indexes in the background.
 */
export async function ensureVectorSearchIndex(
  chunks: Collection<ChunkDoc>,
  dimensions: number,
  timeoutMs = 180_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  const current = async () =>
    (await chunks.listSearchIndexes(VECTOR_INDEX_NAME).toArray())[0] as SearchIndexInfo | undefined

  const wanted = vectorIndexDefinition(dimensions)
  const existing = await current()
  const rebuild = needsRebuild(existing?.latestDefinition, wanted)
  if (existing && rebuild) {
    await chunks.dropSearchIndex(VECTOR_INDEX_NAME)
    while (await current()) {
      if (Date.now() > deadline) throw new Error('Timed out dropping the old vector index')
      await sleep(2_000)
    }
  }
  if (rebuild) {
    await chunks.createSearchIndex({
      name: VECTOR_INDEX_NAME,
      type: 'vectorSearch',
      definition: wanted
    })
  }
  while (!(await current())?.queryable) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the vector index to build')
    await sleep(2_000)
  }
}
