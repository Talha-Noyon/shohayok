import {GENERATED_AT} from '../shop/generate.js'
import {loadOrders, loadPolicies, loadProducts, type Order} from '../shop/schema.js'
import {
  ensureIndexes,
  ensureTextIndex,
  replaceAll,
  upsertChunks,
  type Store
} from '../store/mongo.js'
import {policyChunk, productChunk, type Chunk} from './chunk.js'

const DAY = 86_400_000

/**
 * Moves every order date forward by whole days, so the newest timeline step lands at or before
 * `now`. The demo then always has parcels on their way, whenever it was ingested.
 */
export function shiftOrderDates(orders: Order[], now: number): Order[] {
  const days = Math.max(0, Math.floor((now - GENERATED_AT) / DAY))
  if (days === 0) return orders
  const shift = (iso: string) => new Date(Date.parse(iso) + days * DAY).toISOString()
  return orders.map((order) => ({
    ...order,
    placedAt: shift(order.placedAt),
    timeline: order.timeline.map((step) => ({...step, at: shift(step.at)}))
  }))
}

export interface IngestOptions {
  /** Embeds chunk texts. Leave it out to store chunks without vectors, for keyword search only. */
  embed?: (texts: string[]) => Promise<number[][]>
  embedModel?: string
  /** Texts per embedding request. Each request counts against a free model's daily limit. */
  batchSize?: number
  now?: number
  onProgress?: (embedded: number, total: number) => void
}

export interface IngestResult {
  products: number
  orders: number
  chunks: number
  removed: number
  /** The vector size, or 0 when nothing was embedded */
  dimensions: number
  /** Chunks sent to the embedding model */
  embedded: number
  /** Chunks whose text and model were unchanged, so their stored vector was kept */
  reused: number
}

/** Stored vectors still valid for these chunks: same text, same model */
async function reusableVectors(
  store: Store,
  chunks: Chunk[],
  embedModel: string
): Promise<Map<string, number[]>> {
  const stored = await store.chunks
    .find(
      {_id: {$in: chunks.map((chunk) => chunk.id)}, embedModel},
      {projection: {text: 1, embedding: 1}}
    )
    .toArray()
  const textOf = new Map(chunks.map((chunk) => [chunk.id, chunk.text]))
  return new Map(
    stored.flatMap((doc) =>
      doc.embedding && textOf.get(doc._id) === doc.text ? [[doc._id, doc.embedding]] : []
    )
  )
}

/**
 * Loads the shop from data/, embeds its chunks, and replaces what MongoDB holds. A chunk whose
 * text and model are unchanged keeps its stored vector, so a re-ingest costs only what changed.
 */
export async function ingestShop(store: Store, options: IngestOptions = {}): Promise<IngestResult> {
  const [products, policies, orders] = await Promise.all([
    loadProducts(),
    loadPolicies(),
    loadOrders()
  ])
  const chunks = [...products.map(productChunk), ...policies.map(policyChunk)]

  const embeddings = new Map<string, number[]>()
  let reused = 0
  if (options.embed) {
    const kept = options.embedModel
      ? await reusableVectors(store, chunks, options.embedModel)
      : new Map<string, number[]>()
    for (const [id, vector] of kept) embeddings.set(id, vector)
    reused = kept.size
    const missing = chunks.filter((chunk) => !kept.has(chunk.id))
    const batch = options.batchSize ?? 50
    for (let start = 0; start < missing.length; start += batch) {
      const slice = missing.slice(start, start + batch)
      const vectors = await options.embed(slice.map((chunk) => chunk.text))
      slice.forEach((chunk, i) => {
        const vector = vectors[i]
        if (vector) embeddings.set(chunk.id, vector)
      })
      options.onProgress?.(Math.min(start + batch, missing.length), missing.length)
    }
  }

  const {written, removed} = await upsertChunks(
    store.chunks,
    chunks.map((chunk) => ({chunk, embedding: embeddings.get(chunk.id)})),
    options.embed ? options.embedModel : undefined
  )
  await ensureTextIndex(store.chunks)
  await replaceAll(
    store.products,
    products.map((product) => ({...product, _id: product.id}))
  )
  await replaceAll(
    store.orders,
    shiftOrderDates(orders, options.now ?? Date.now()).map((order) => ({...order, _id: order.id}))
  )
  await ensureIndexes(store)
  // Answers came from the old data
  await store.caches.deleteMany({_id: {$regex: /^answer:/}})

  return {
    products: products.length,
    orders: orders.length,
    chunks: written,
    removed,
    dimensions: embeddings.values().next().value?.length ?? 0,
    embedded: options.embed ? chunks.length - reused : 0,
    reused
  }
}
