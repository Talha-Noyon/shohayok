import {readFileSync} from 'node:fs'

import {describe, expect, it} from 'vitest'

import {DELIVERY} from '../src/shop/delivery.js'
import {PLACES} from '../src/shop/places.js'
import {createRandom} from '../src/shop/random.js'
import {CATEGORIES, COLLECTIONS, COLORS, STYLES, type Term} from '../src/shop/vocab.js'

const LISTS: [string, readonly Term[]][] = [
  ['colours', COLORS],
  ['categories', CATEGORIES],
  ['styles', STYLES],
  ['collections', COLLECTIONS],
  ['places', PLACES]
]

describe('shop vocabulary', () => {
  it.each(LISTS)('%s have unique keys', (_name, terms) => {
    const keys = terms.map((term) => term.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it.each(LISTS)('%s have an English name and a Bengali one in Bengali script', (_name, terms) => {
    for (const term of terms) {
      expect(term.en.trim()).not.toBe('')
      expect(term.bn).toMatch(/^[ঀ-৿\s-]+$/)
    }
  })

  it.each(LISTS)('%s list other spellings lowercased and trimmed', (_name, terms) => {
    for (const term of terms) {
      for (const spelling of term.spellings) expect(spelling).toBe(spelling.trim().toLowerCase())
    }
  })

  it('offers 500 products, each in a category that exists, with a sensible price range', () => {
    const categories = new Set<string>(CATEGORIES.map((category) => category.key))
    let total = 0
    for (const style of STYLES) {
      for (const [category, offer] of Object.entries(style.offers)) {
        expect(categories.has(category)).toBe(true)
        expect(offer.price[0]).toBeLessThan(offer.price[1])
        total += offer.count
      }
    }
    expect(total).toBe(500)
  })

  it('has enough collection names to give every product of a style its own name', () => {
    const largest = Math.max(
      ...STYLES.flatMap((style) => Object.values(style.offers).map((offer) => offer.count))
    )
    expect(COLLECTIONS.length).toBeGreaterThanOrEqual(largest)
  })
})

describe('places', () => {
  const zoneOf = (key: string) => PLACES.find((place) => place.key === key)?.zone

  it('lists all 64 districts', () => {
    expect(PLACES.filter((place) => place.kind === 'district')).toHaveLength(64)
  })

  it('puts Dhaka city inside Dhaka and its outer towns outside', () => {
    expect(zoneOf('dhaka')).toBe('dhaka')
    expect(zoneOf('mirpur')).toBe('dhaka')
    expect(zoneOf('inside-dhaka')).toBe('dhaka')
    expect(zoneOf('savar')).toBe('outside')
    expect(zoneOf('keraniganj')).toBe('outside')
    expect(zoneOf('outside-dhaka')).toBe('outside')
    expect(zoneOf('sylhet')).toBe('outside')
  })

  it('names a real district for every area', () => {
    const districts = new Set(PLACES.filter((p) => p.kind === 'district').map((p) => p.key))
    for (const area of PLACES.filter((place) => place.kind === 'area')) {
      expect(districts.has(area.district ?? '')).toBe(true)
    }
  })
})

describe('delivery', () => {
  const policies = JSON.parse(
    readFileSync(new URL('../data/policies.json', import.meta.url), 'utf8')
  ) as {id: string; body: {en: string}}[]
  const policyText = (id: string) =>
    (policies.find((policy) => policy.id === id)?.body.en ?? '').replace(/(?<=\d),(?=\d)/g, '')

  it.each(Object.values(DELIVERY))('agrees with policy $policy', (zone) => {
    const text = policyText(zone.policy)
    expect(text).toContain(`Tk ${zone.fee}`)
    expect(text).toContain(`${zone.minDays} to ${zone.maxDays} working days`)
    expect(text).toContain(`above Tk ${zone.freeOver}`)
  })
})

describe('createRandom', () => {
  it('repeats the same numbers for the same seed', () => {
    const a = createRandom(7)
    const b = createRandom(7)
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()])
  })

  it('keeps integers within the bounds, both included', () => {
    const random = createRandom(1)
    const seen = new Set<number>()
    for (let i = 0; i < 500; i++) seen.add(random.int(3, 5))
    expect([...seen].sort()).toEqual([3, 4, 5])
  })

  it('shuffles without losing or adding items', () => {
    const shuffled = createRandom(3).shuffle([1, 2, 3, 4, 5])
    expect([...shuffled].sort()).toEqual([1, 2, 3, 4, 5])
  })
})
