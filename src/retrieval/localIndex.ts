import type {Hit, VectorIndex} from './types.js'
import {dot, normalize} from './vectorMath.js'

export interface IndexedChunk {
  chunkId: string
  docId: string
  title: string
  text: string
  embedding: number[]
}

/**
 * Exact cosine search in memory, for MongoDB servers without Atlas Vector Search. The vectors
 * still live in MongoDB and are loaded at startup. Fine for a few thousand chunks.
 */
export class LocalVectorIndex implements VectorIndex {
  readonly kind = 'local' as const
  readonly dimensions: number
  private readonly rows: {chunk: Omit<IndexedChunk, 'embedding'>; vector: Float32Array}[]

  constructor(chunks: IndexedChunk[]) {
    this.dimensions = chunks[0]?.embedding.length ?? 0
    this.rows = chunks.map(({embedding, ...chunk}) => {
      if (embedding.length !== this.dimensions) {
        throw new Error(
          `Chunk ${chunk.chunkId} has ${embedding.length} dimensions, expected ${this.dimensions}`
        )
      }
      return {chunk, vector: normalize(embedding)}
    })
  }

  get size(): number {
    return this.rows.length
  }

  async search(vector: number[], k: number): Promise<Hit[]> {
    if (this.rows.length === 0) return []
    if (vector.length !== this.dimensions) {
      throw new Error(
        `The query has ${vector.length} dimensions but the stored chunks have ${this.dimensions}. ` +
          'Run npm run ingest again with the same EMBED_MODEL.'
      )
    }
    const query = normalize(vector)
    return this.rows
      .map(({chunk, vector: stored}) => ({...chunk, score: dot(query, stored)}))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
  }
}
