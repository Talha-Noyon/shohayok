/**
 * One search result. For vector search `score` is the cosine similarity, from -1 to 1. For
 * keyword search it is MongoDB's text score, which only means something within one query.
 */
export interface Hit {
  chunkId: string
  docId: string
  title: string
  text: string
  score: number
}

export interface VectorIndex {
  readonly kind: 'atlas' | 'local'
  search(vector: number[], k: number): Promise<Hit[]>
}
