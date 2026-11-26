import {GENERATED_AT} from '../shop/generate.js'
import {loadOrders, loadPolicies, loadProducts, type Order} from '../shop/schema.js'
import {
  ensureIndexes,
  ensureTextIndex,
  replaceAll,
  upsertChunks,
  type Store
} from '../store/mongo.js'
import {policyChunk, productChunk} from './chunk.js'

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
}

/** Loads the shop from data/, embeds its chunks, and replaces what MongoDB holds */
export async function ingestShop(store: Store, options: IngestOptions = {}): Promise<IngestResult> {
  const [products, policies, orders] = await Promise.all([
    loadProducts(),
    loadPolicies(),
    loadOrders()
  ])
  const chunks = [...products.map(productChunk), ...policies.map(policyChunk)]

  const embeddings: number[][] = []
  if (options.embed) {
    const batch = options.batchSize ?? 50
    for (let start = 0; start < chunks.length; start += batch) {
      const texts = chunks.slice(start, start + batch).map((chunk) => chunk.text)
      embeddings.push(...(await options.embed(texts)))
      options.onProgress?.(embeddings.length, chunks.length)
    }
  }

  const {written, removed} = await upsertChunks(
    store.chunks,
    chunks.map((chunk, i) => ({chunk, embedding: embeddings[i]})),
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
    dimensions: embeddings[0]?.length ?? 0
  }
}
