import type {Chunk} from '../ingest/chunk.js'

/** A chunk as stored in MongoDB, with the vector of the model that embedded it */
export interface ChunkDoc {
  /** The chunk id, `<docId>#<n>` */
  _id: string
  docId: string
  type: Chunk['type']
  title: string
  text: string
  embedding: number[]
  /** Vectors from different models cannot be compared, so every chunk records its model */
  embedModel: string
  updatedAt: Date
}
