import {createHash} from 'node:crypto'

import type {Collection} from 'mongodb'

export interface Cache<T> {
  get(key: string): Promise<T | undefined>
  set(key: string, value: T, ttlSeconds: number): Promise<void>
}

export interface CacheDoc<T> {
  _id: string
  value: T
  expiresAt: Date
}

/** "answer:<hash>": the prefix stays readable, so ingest can clear one kind at a time */
export function cacheKey(kind: string, ...parts: string[]): string {
  const hash = createHash('sha256').update(parts.join('\u0000')).digest('base64url')
  return `${kind}:${hash}`
}

/** Entries in MongoDB, deleted by a TTL index once they expire */
export class MongoCache<T> implements Cache<T> {
  private readonly docs: Collection<CacheDoc<T>>
  private readonly now: () => number

  constructor(docs: Collection<CacheDoc<T>>, now: () => number = Date.now) {
    this.docs = docs
    this.now = now
  }

  async get(key: string): Promise<T | undefined> {
    // The TTL monitor runs once a minute, so expired entries can still be there
    const doc = await this.docs.findOne({_id: key, expiresAt: {$gt: new Date(this.now())}})
    return doc?.value
  }

  async set(key: string, value: T, ttlSeconds: number): Promise<void> {
    const expiresAt = new Date(this.now() + ttlSeconds * 1000)
    await this.docs.updateOne({_id: key}, {$set: {value, expiresAt}}, {upsert: true})
  }
}

export class MemoryCache<T> implements Cache<T> {
  private readonly entries = new Map<string, {value: T; expiresAt: number}>()
  private readonly now: () => number

  constructor(now: () => number = Date.now) {
    this.now = now
  }

  async get(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key)
    return entry && entry.expiresAt > this.now() ? entry.value : undefined
  }

  async set(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.entries.set(key, {value, expiresAt: this.now() + ttlSeconds * 1000})
  }
}

const EMBEDDING_TTL = 30 * 86_400

/**
 * Wraps an embedder so a text is embedded once per model. Only unseen texts are sent, all in one
 * request, and `requested` says how many there were, so a free daily allowance lasts longer.
 */
export function cachedEmbedder(
  embed: (texts: string[]) => Promise<number[][]>,
  cache: Cache<number[]>,
  model: string
): (texts: string[]) => Promise<{vectors: number[][]; requested: number}> {
  return async (texts) => {
    const keys = texts.map((text) => cacheKey('embed', model, text))
    const vectors = await Promise.all(keys.map((key) => cache.get(key)))
    const missing = texts.flatMap((text, i) => (vectors[i] ? [] : [{text, i}]))
    if (missing.length > 0) {
      const fresh = await embed(missing.map((item) => item.text))
      await Promise.all(
        missing.map(({i}, j) => {
          const vector = fresh[j] ?? []
          vectors[i] = vector
          return cache.set(keys[i] ?? '', vector, EMBEDDING_TTL)
        })
      )
    }
    return {vectors: vectors.map((vector) => vector ?? []), requested: missing.length}
  }
}
