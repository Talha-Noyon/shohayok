import type {Counter} from './counter.js'

export interface RateLimits {
  perMinute: number
  perDay: number
}

/** Messages per visitor. Replies without a model are free, but still not unlimited. */
export class RateLimiter {
  private readonly counter: Counter
  private readonly limits: RateLimits
  private readonly now: () => number

  constructor(counter: Counter, limits: RateLimits, now: () => number = Date.now) {
    this.counter = counter
    this.limits = limits
    this.now = now
  }

  async allow(visitor: string): Promise<boolean> {
    const iso = new Date(this.now()).toISOString()
    const minute = iso.slice(0, 16)
    const day = iso.slice(0, 10)
    const inMinute = await this.counter.take(
      `rate:${minute}:${visitor}`,
      this.limits.perMinute,
      120
    )
    if (!inMinute) return false
    return this.counter.take(`messages:${day}:${visitor}`, this.limits.perDay, 2 * 86_400)
  }
}
