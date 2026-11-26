import {describe, expect, it} from 'vitest'

import type {Lang} from '../src/lang/detect.js'
import {colorName, listWords, money, sizeLabel} from '../src/shop/format.js'

describe('money', () => {
  it.each<[Lang, string]>([
    ['en', 'Tk 12,500'],
    ['bn', '১২,৫০০ টাকা'],
    ['banglish', '12,500 taka']
  ])('writes Taka the way a %s reply would', (lang, text) => {
    expect(money(12500, lang)).toBe(text)
  })
})

describe('sizeLabel', () => {
  it.each<[string, Lang, string]>([
    ['Free size', 'en', 'Free size'],
    ['Free size', 'bn', 'ফ্রি সাইজ'],
    ['Free size', 'banglish', 'free size'],
    ['2-3Y', 'en', '2–3 years'],
    ['2-3Y', 'bn', '২–৩ বছর'],
    ['2-3Y', 'banglish', '2-3 bochor'],
    ['42', 'bn', '৪২'],
    ['XL', 'bn', 'XL']
  ])('writes %s in %s as %s', (size, lang, text) => {
    expect(sizeLabel(size, lang)).toBe(text)
  })
})

describe('colorName', () => {
  it.each<[Lang, string]>([
    ['en', 'Sky Blue'],
    ['bn', 'আকাশি'],
    ['banglish', 'akashi']
  ])('names a colour in %s', (lang, text) => {
    expect(colorName('sky-blue', lang)).toBe(text)
  })
})

describe('listWords', () => {
  it('joins with commas and the word for "and" in each language', () => {
    expect(listWords(['a'], 'en')).toBe('a')
    expect(listWords(['a', 'b'], 'en')).toBe('a and b')
    expect(listWords(['a', 'b', 'c'], 'en')).toBe('a, b and c')
    expect(listWords(['ক', 'খ', 'গ'], 'bn')).toBe('ক, খ ও গ')
    expect(listWords(['a', 'b'], 'banglish')).toBe('a ar b')
  })
})
