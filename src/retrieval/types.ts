import type {Document} from 'mongodb'

import type {ChunkFilters} from '../ingest/chunk.js'

/**
 * One search result. For vector search `score` is the cosine similarity, from -1 to 1. For
 * keyword search it is MongoDB's text score, which only means something within one query.
 */
export interface Hit {
  chunkId: string
  docId: string
  title: string
  text: string
  textEn: string
  textBn: string
  score: number
}

/** Narrows a search to chunks whose filter fields match. Colours match if any one does. */
export interface SearchFilter {
  type?: ChunkFilters['type']
  category?: string
  colors?: string[]
  minPrice?: number
  maxPrice?: number
}

export interface VectorIndex {
  readonly kind: 'atlas' | 'local'
  search(vector: number[], k: number, filter?: SearchFilter): Promise<Hit[]>
}

/** The filter as a MongoDB query. Atlas `$vectorSearch` accepts the same operators. */
export function toMongoFilter(filter: SearchFilter | undefined): Document {
  const query: Document = {}
  if (!filter) return query
  if (filter.type) query['filters.type'] = filter.type
  if (filter.category) query['filters.category'] = filter.category
  if (filter.colors?.length) query['filters.colors'] = {$in: filter.colors}
  if (filter.minPrice !== undefined || filter.maxPrice !== undefined) {
    query['filters.price'] = {
      ...(filter.minPrice !== undefined && {$gte: filter.minPrice}),
      ...(filter.maxPrice !== undefined && {$lte: filter.maxPrice})
    }
  }
  return query
}

/** The same filter for chunks held in memory */
export function matchesFilter(filters: ChunkFilters, filter: SearchFilter | undefined): boolean {
  if (!filter) return true
  if (filter.type && filters.type !== filter.type) return false
  if (filter.category && filters.category !== filter.category) return false
  if (filter.colors?.length && !filter.colors.some((color) => filters.colors?.includes(color))) {
    return false
  }
  if (filter.minPrice !== undefined && (filters.price ?? -Infinity) < filter.minPrice) return false
  if (filter.maxPrice !== undefined && (filters.price ?? Infinity) > filter.maxPrice) return false
  return true
}
