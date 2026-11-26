import {describe, expect, it} from 'vitest'

import {toProductFilter} from '../src/store/shopData.js'

describe('toProductFilter', () => {
  it('turns a product query into a MongoDB filter', () => {
    expect(toProductFilter({})).toEqual({})
    expect(
      toProductFilter({
        category: 'sharee',
        styles: ['jamdani', 'katan'],
        colors: ['red'],
        collection: 'ketoki',
        minPrice: 1000,
        maxPrice: 9000,
        size: 'Free size'
      })
    ).toEqual({
      category: 'sharee',
      style: {$in: ['jamdani', 'katan']},
      colors: {$in: ['red']},
      collection: 'ketoki',
      price: {$gte: 1000, $lte: 9000},
      sizes: 'Free size'
    })
  })
})
