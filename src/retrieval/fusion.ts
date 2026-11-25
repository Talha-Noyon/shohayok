import type {Hit} from './types.js'

export interface RankedList {
  hits: Hit[]
  /** True when the scores are cosine similarities, from vector search */
  cosine: boolean
}

export interface FusedHit {
  chunkId: string
  docId: string
  title: string
  text: string
  /** Reciprocal rank fusion score */
  rrf: number
  /** The best cosine similarity any vector search gave this chunk; null if only keywords found it */
  cosine: number | null
}

/** The usual constant: it keeps one top rank from outweighing agreement between lists */
export const RRF_K = 60

/**
 * Reciprocal rank fusion. Every list adds 1 / (k + rank) for each chunk it ranks, so a chunk that
 * several searches agree on rises, and vector and keyword scores never need to share a scale.
 */
export function fuse(lists: RankedList[], k = RRF_K): FusedHit[] {
  const fused = new Map<string, FusedHit>()
  for (const list of lists) {
    list.hits.forEach((hit, index) => {
      const entry = fused.get(hit.chunkId) ?? {
        chunkId: hit.chunkId,
        docId: hit.docId,
        title: hit.title,
        text: hit.text,
        rrf: 0,
        cosine: null
      }
      entry.rrf += 1 / (k + index + 1)
      if (list.cosine) entry.cosine = Math.max(entry.cosine ?? -1, hit.score)
      fused.set(hit.chunkId, entry)
    })
  }
  return [...fused.values()].sort(
    (a, b) =>
      b.rrf - a.rrf || (b.cosine ?? -1) - (a.cosine ?? -1) || a.chunkId.localeCompare(b.chunkId)
  )
}
