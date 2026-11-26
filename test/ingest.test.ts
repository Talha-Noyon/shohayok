import {describe, expect, it} from 'vitest'

import {shiftOrderDates} from '../src/ingest/ingest.js'
import {GENERATED_AT} from '../src/shop/generate.js'
import type {Order} from '../src/shop/schema.js'

const DAY = 86_400_000

const order = (placedAt: string, deliveredAt: string): Order => ({
  id: 'NDI-10001',
  phone: '01000000009',
  district: 'sylhet',
  items: [
    {
      productId: 'P001',
      sku: 'P001-red-free-size',
      name: {en: 'A', bn: 'অ'},
      color: 'red',
      size: 'Free size',
      qty: 1,
      price: 100
    }
  ],
  subtotal: 100,
  deliveryFee: 130,
  total: 230,
  payment: 'cod',
  status: 'delivered',
  timeline: [
    {status: 'placed', at: placedAt},
    {status: 'delivered', at: deliveredAt}
  ],
  placedAt
})

describe('shiftOrderDates', () => {
  const generated = new Date(GENERATED_AT).toISOString()
  const earlier = new Date(GENERATED_AT - 3 * DAY).toISOString()

  it('moves every date by whole days, so the newest is never in the future', () => {
    const now = GENERATED_AT + 10 * DAY + 5 * 3_600_000
    const [shifted] = shiftOrderDates([order(earlier, generated)], now)
    expect(shifted?.placedAt).toBe(new Date(GENERATED_AT + 7 * DAY).toISOString())
    expect(shifted?.timeline.map((step) => step.at)).toEqual([
      new Date(GENERATED_AT + 7 * DAY).toISOString(),
      new Date(GENERATED_AT + 10 * DAY).toISOString()
    ])
    expect(Date.parse(shifted?.timeline.at(-1)?.at ?? '')).toBeLessThanOrEqual(now)
  })

  it('leaves the dates alone when the data is current', () => {
    const [shifted] = shiftOrderDates([order(earlier, generated)], GENERATED_AT + 3_600_000)
    expect(shifted?.placedAt).toBe(earlier)
  })
})
