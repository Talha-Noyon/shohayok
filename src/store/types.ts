import type {Chunk, ChunkFilters} from '../ingest/chunk.js'
import type {Order, Product} from '../shop/schema.js'

/** A chunk as stored in MongoDB, with the vector of the model that embedded it */
export interface ChunkDoc {
  /** The chunk id, `<docId>#<n>` */
  _id: string
  docId: string
  type: Chunk['type']
  title: string
  text: string
  textEn: string
  textBn: string
  filters: ChunkFilters
  /** Missing when the chunk was stored offline, for keyword search only */
  embedding?: number[]
  /** Vectors from different models cannot be compared, so every chunk records its model */
  embedModel?: string
  updatedAt: Date
}

export type ProductDoc = Product & {_id: string}
export type OrderDoc = Order & {_id: string}
