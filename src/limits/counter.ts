import {MongoServerError, type Collection} from 'mongodb'

/** Counters that expire. Serverless instances share no memory, so the app keeps them in MongoDB. */
export interface Counter {
  /** Adds one unless the count already reached `limit`. True when it added. */
  take(key: string, limit: number, ttlSeconds: number): Promise<boolean>
  get(key: string): Promise<number>
  /** Raises the count to `value`, for when the provider says the limit is reached */
  fill(key: string, value: number, ttlSeconds: number): Promise<void>
  /** Gives one back, after a take that was not used */
  refund(key: string): Promise<void>
}

export interface CounterDoc {
  _id: string
  n: number
  expiresAt: Date
}

const DUPLICATE_KEY = 11000

/**
 * One atomic update per take. When the count is at the limit the filter matches nothing and the
 * upsert collides with the existing document, which MongoDB reports as a duplicate key. There is
 * no read-then-write, so two instances cannot both take the last unit.
 */
export class MongoCounter implements Counter {
  private readonly counters: Collection<CounterDoc>
  private readonly now: () => number

  constructor(counters: Collection<CounterDoc>, now: () => number = Date.now) {
    this.counters = counters
    this.now = now
  }

  async take(key: string, limit: number, ttlSeconds: number): Promise<boolean> {
    if (limit <= 0) return false
    try {
      await this.counters.updateOne(
        {_id: key, n: {$lt: limit}},
        {$inc: {n: 1}, $setOnInsert: {expiresAt: this.expiry(ttlSeconds)}},
        {upsert: true}
      )
      return true
    } catch (error) {
      if (!(error instanceof MongoServerError && error.code === DUPLICATE_KEY)) throw error
    }
    // Either the count is at the limit, or a parallel take created the document first. Now that
    // it exists, a plain update tells the two apart.
    const retry = await this.counters.updateOne({_id: key, n: {$lt: limit}}, {$inc: {n: 1}})
    return retry.modifiedCount === 1
  }

  async get(key: string): Promise<number> {
    return (await this.counters.findOne({_id: key}))?.n ?? 0
  }

  async fill(key: string, value: number, ttlSeconds: number): Promise<void> {
    await this.counters.updateOne(
      {_id: key},
      {$max: {n: value}, $setOnInsert: {expiresAt: this.expiry(ttlSeconds)}},
      {upsert: true}
    )
  }

  async refund(key: string): Promise<void> {
    await this.counters.updateOne({_id: key, n: {$gt: 0}}, {$inc: {n: -1}})
  }

  private expiry(ttlSeconds: number): Date {
    return new Date(this.now() + ttlSeconds * 1000)
  }
}

/** The same counters in memory, for tests and for a single local process */
export class MemoryCounter implements Counter {
  private readonly counts = new Map<string, {n: number; expiresAt: number}>()
  private readonly now: () => number

  constructor(now: () => number = Date.now) {
    this.now = now
  }

  private current(key: string, ttlSeconds = 0) {
    const entry = this.counts.get(key)
    if (entry && entry.expiresAt > this.now()) return entry
    const fresh = {n: 0, expiresAt: this.now() + ttlSeconds * 1000}
    this.counts.set(key, fresh)
    return fresh
  }

  async take(key: string, limit: number, ttlSeconds: number): Promise<boolean> {
    const entry = this.current(key, ttlSeconds)
    if (entry.n >= limit) return false
    entry.n += 1
    return true
  }

  async get(key: string): Promise<number> {
    const entry = this.counts.get(key)
    return entry && entry.expiresAt > this.now() ? entry.n : 0
  }

  async fill(key: string, value: number, ttlSeconds: number): Promise<void> {
    const entry = this.current(key, ttlSeconds)
    entry.n = Math.max(entry.n, value)
  }

  async refund(key: string): Promise<void> {
    const entry = this.counts.get(key)
    if (entry && entry.n > 0) entry.n -= 1
  }
}
