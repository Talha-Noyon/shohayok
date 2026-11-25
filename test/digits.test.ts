import {describe, expect, it} from 'vitest'

import {normalizeForMatch, toAsciiDigits, toBengaliDigits} from '../src/lang/digits.js'

describe('digits', () => {
  it('converts between Bengali and ASCII digits', () => {
    expect(toAsciiDigits('দাম ১৪৫০ টাকা')).toBe('দাম 1450 টাকা')
    expect(toBengaliDigits('Tk 1450')).toBe('Tk ১৪৫০')
  })

  it('normalizes numbers so every spelling of a price matches', () => {
    expect(normalizeForMatch('দাম ১,৪৫০ টাকা')).toBe('দাম 1450 টাকা')
    expect(normalizeForMatch('Price:  Tk 1,450')).toBe('price: tk 1450')
    expect(normalizeForMatch('Tk 1,00,000')).toBe('tk 100000')
  })

  it('leaves a comma between separate numbers alone when a space follows it', () => {
    expect(normalizeForMatch('sizes 38, 40 and 42')).toBe('sizes 38, 40 and 42')
  })
})
