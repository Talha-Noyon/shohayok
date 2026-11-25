import {msSince} from '../util/time.js'
import {fuse, type FusedHit, type RankedList} from './fusion.js'
import type {Hit, VectorIndex} from './types.js'

export interface RetrieverDeps {
  embed(texts: string[]): Promise<number[][]>
  vectorIndex: VectorIndex
  keyword(query: string, k: number): Promise<Hit[]>
  /** How many hits each single search returns before fusion */
  perListK?: number
}

export interface Retrieval {
  hits: FusedHit[]
  /** The best cosine similarity from any vector search; null when the index is empty */
  confidence: number | null
  embedMs: number
  searchMs: number
}

/**
 * Hybrid retrieval for one or more phrasings of the same question: every phrasing is embedded in
 * one call, searched by vector and by keyword in parallel, and all lists are fused by rank.
 */
export class Retriever {
  private readonly deps: RetrieverDeps

  constructor(deps: RetrieverDeps) {
    this.deps = deps
  }

  async retrieve(queries: string[], topK: number): Promise<Retrieval> {
    const unique = [...new Set(queries.map((query) => query.trim()).filter(Boolean))]
    if (unique.length === 0) return {hits: [], confidence: null, embedMs: 0, searchMs: 0}
    const perListK = this.deps.perListK ?? Math.max(topK * 2, 8)

    const embedStart = performance.now()
    const vectors = await this.deps.embed(unique)
    const embedMs = msSince(embedStart)

    const searchStart = performance.now()
    const lists: RankedList[] = await Promise.all(
      unique.flatMap((query, i) => [
        this.deps.vectorIndex
          .search(vectors[i] ?? [], perListK)
          .then((hits) => ({hits, cosine: true})),
        this.deps.keyword(query, perListK).then((hits) => ({hits, cosine: false}))
      ])
    )
    const searchMs = msSince(searchStart)

    const cosines = lists.filter((list) => list.cosine).flatMap((list) => list.hits)
    return {
      hits: fuse(lists).slice(0, topK),
      confidence: cosines.length > 0 ? Math.max(...cosines.map((hit) => hit.score)) : null,
      embedMs,
      searchMs
    }
  }
}
