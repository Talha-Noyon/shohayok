import type {Counter} from './counter.js'

export interface BudgetConfig {
  /** Model requests the whole demo may make per UTC day */
  dailyLimit: number
  /** Model requests one visitor may make per UTC day */
  visitorLimit: number
  /** Off for local models, which cost nothing */
  enabled: boolean
}

export interface Quota {
  used: number
  limit: number
  visitorUsed: number
  visitorLimit: number
  /** When the free models' daily allowance starts again: midnight UTC */
  resetsAt: string
}

const DAY = 86_400_000

/**
 * OpenRouter's free models allow 50 requests a day for the whole account. The budget hands them
 * out: a request is made only after `take` says yes, so the demo stops a little short of the
 * limit and no one visitor can spend the day.
 */
export class Budget {
  private readonly counter: Counter
  private readonly config: BudgetConfig
  private readonly now: () => number

  constructor(counter: Counter, config: BudgetConfig, now: () => number = Date.now) {
    this.counter = counter
    this.config = config
    this.now = now
  }

  private day(): {key: string; resetsAt: number; ttlSeconds: number} {
    const now = this.now()
    const start = Math.floor(now / DAY) * DAY
    const resetsAt = start + DAY
    return {
      key: `model:${new Date(start).toISOString().slice(0, 10)}`,
      resetsAt,
      // Kept a day past the reset, so a status read near midnight still finds it
      ttlSeconds: Math.ceil((resetsAt - now + DAY) / 1000)
    }
  }

  /** Reserves one model request. False when the day's or the visitor's share is spent. */
  async take(visitor?: string): Promise<boolean> {
    if (!this.config.enabled) return true
    const {key, ttlSeconds} = this.day()
    if (!(await this.counter.take(key, this.config.dailyLimit, ttlSeconds))) return false
    if (visitor === undefined) return true
    const mine = await this.counter.take(`${key}:${visitor}`, this.config.visitorLimit, ttlSeconds)
    if (!mine) await this.counter.refund(key)
    return mine
  }

  async status(visitor?: string): Promise<Quota> {
    const {key, resetsAt} = this.day()
    if (!this.config.enabled) {
      return {
        used: 0,
        limit: Infinity,
        visitorUsed: 0,
        visitorLimit: Infinity,
        resetsAt: new Date(resetsAt).toISOString()
      }
    }
    const [used, visitorUsed] = await Promise.all([
      this.counter.get(key),
      visitor === undefined ? 0 : this.counter.get(`${key}:${visitor}`)
    ])
    return {
      used,
      limit: this.config.dailyLimit,
      visitorUsed,
      visitorLimit: this.config.visitorLimit,
      resetsAt: new Date(resetsAt).toISOString()
    }
  }

  /** The provider said the day's free requests are gone, whatever our count says */
  async exhaust(): Promise<void> {
    if (!this.config.enabled) return
    const {key, ttlSeconds} = this.day()
    await this.counter.fill(key, this.config.dailyLimit, ttlSeconds)
  }
}
