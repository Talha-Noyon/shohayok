import {describe, expect, it} from 'vitest'

import {Budget} from '../src/limits/budget.js'
import {MemoryCounter} from '../src/limits/counter.js'
import {RateLimiter} from '../src/limits/rateLimit.js'
import {clientIp, visitorId} from '../src/limits/visitor.js'

const NOON = Date.UTC(2026, 10, 26, 12, 0, 0)

describe('MemoryCounter', () => {
  it('counts up to the limit and then refuses', async () => {
    const counter = new MemoryCounter(() => NOON)
    const takes = []
    for (let i = 0; i < 4; i++) takes.push(await counter.take('k', 3, 60))
    expect(takes).toEqual([true, true, true, false])
    expect(await counter.get('k')).toBe(3)
  })

  it('refuses everything at a limit of zero', async () => {
    expect(await new MemoryCounter(() => NOON).take('k', 0, 60)).toBe(false)
  })

  it('forgets a count once it expires', async () => {
    let now = NOON
    const counter = new MemoryCounter(() => now)
    await counter.take('k', 1, 60)
    now += 61_000
    expect(await counter.take('k', 1, 60)).toBe(true)
  })

  it('gives one back, and fills up when told the limit is reached', async () => {
    const counter = new MemoryCounter(() => NOON)
    await counter.take('k', 5, 60)
    await counter.refund('k')
    expect(await counter.get('k')).toBe(0)
    await counter.fill('k', 5, 60)
    expect(await counter.take('k', 5, 60)).toBe(false)
  })
})

describe('Budget', () => {
  const budget = (dailyLimit = 3, visitorLimit = 2) =>
    new Budget(new MemoryCounter(() => NOON), {dailyLimit, visitorLimit, enabled: true}, () => NOON)

  it('lets each visitor use only their share of the day', async () => {
    const day = budget(10, 2)
    expect([await day.take('a'), await day.take('a'), await day.take('a')]).toEqual([
      true,
      true,
      false
    ])
    expect(await day.take('b')).toBe(true)
    expect(await day.status('a')).toMatchObject({
      used: 3,
      limit: 10,
      visitorUsed: 2,
      visitorLimit: 2
    })
  })

  it('stops everyone when the day is spent, without charging a visitor who was refused', async () => {
    const day = budget(2, 5)
    await day.take('a')
    await day.take('b')
    expect(await day.take('c')).toBe(false)
    expect((await day.status('c')).visitorUsed).toBe(0)
  })

  it('does not count a visitor refused by their own limit against the day', async () => {
    const day = budget(10, 1)
    await day.take('a')
    await day.take('a')
    expect((await day.status()).used).toBe(1)
  })

  it('treats the day as spent once the provider says so', async () => {
    const day = budget(10, 10)
    await day.exhaust()
    expect(await day.take('a')).toBe(false)
    expect((await day.status()).used).toBe(10)
  })

  it('resets at midnight UTC, six in the morning in Dhaka', async () => {
    expect((await budget().status()).resetsAt).toBe('2026-11-27T00:00:00.000Z')
  })

  it('counts nothing when it is off, as with a local model', async () => {
    const off = new Budget(new MemoryCounter(() => NOON), {
      dailyLimit: 0,
      visitorLimit: 0,
      enabled: false
    })
    expect(await off.take('a')).toBe(true)
    expect(await off.status('a')).toMatchObject({enabled: false, used: 0})
  })
})

describe('RateLimiter', () => {
  it('allows a few messages a minute per visitor', async () => {
    const limiter = new RateLimiter(
      new MemoryCounter(() => NOON),
      {perMinute: 2, perDay: 100},
      () => NOON
    )
    expect([await limiter.allow('a'), await limiter.allow('a'), await limiter.allow('a')]).toEqual([
      true,
      true,
      false
    ])
    expect(await limiter.allow('b')).toBe(true)
  })
})

describe('visitors', () => {
  it('reads the client address the proxy forwarded', () => {
    expect(clientIp({'x-forwarded-for': '203.0.113.7, 10.0.0.1'})).toBe('203.0.113.7')
    expect(clientIp({'x-real-ip': '203.0.113.8'})).toBe('203.0.113.8')
    expect(clientIp({}, '::1')).toBe('::1')
    expect(clientIp({})).toBe('unknown')
  })

  it('keeps a keyed hash of the address, never the address', () => {
    const id = visitorId('203.0.113.7', 'secret')
    expect(id).toBe(visitorId('203.0.113.7', 'secret'))
    expect(id).not.toBe(visitorId('203.0.113.7', 'other secret'))
    expect(id).not.toContain('203')
    expect(id).toMatch(/^[A-Za-z0-9_-]{16}$/)
  })
})
