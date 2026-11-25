import {describe, expect, it} from 'vitest'

import type {SourceDoc} from '../src/corpus/schema.js'
import {chunkHeader, splitLong, toChunks} from '../src/ingest/chunk.js'

const saree: SourceDoc = {
  id: 'P01',
  type: 'product',
  title: {en: 'Tangail cotton saree', bn: 'টাঙ্গাইল সুতি শাড়ি'},
  body: {en: 'Soft handwoven cotton.', bn: 'নরম তাঁতের সুতি শাড়ি।'},
  price: 1450,
  tags: ['saree', 'cotton']
}

describe('chunkHeader', () => {
  it('writes the price with both kinds of digits', () => {
    expect(chunkHeader(saree)).toBe(
      'Tangail cotton saree / টাঙ্গাইল সুতি শাড়ি\nPrice: Tk 1450 / দাম: ১৪৫০ টাকা\nTags: saree, cotton'
    )
  })
})

describe('toChunks', () => {
  it('keeps a short document in one chunk with both languages', () => {
    const chunks = toChunks(saree)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({id: 'P01#0', docId: 'P01', type: 'product'})
    expect(chunks[0]?.text).toContain('Soft handwoven cotton.')
    expect(chunks[0]?.text).toContain('নরম তাঁতের সুতি শাড়ি।')
  })

  it('splits a long document and repeats the header in every chunk', () => {
    const long: SourceDoc = {
      ...saree,
      body: {
        en: Array.from(
          {length: 12},
          (_, i) => `English sentence number ${i} about the saree.`
        ).join('\n'),
        bn: Array.from({length: 12}, (_, i) => `শাড়ি নিয়ে বাংলা বাক্য ${i}।`).join('\n')
      }
    }
    const chunks = toChunks(long, 300)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(300)
      expect(chunk.text.startsWith(chunkHeader(long))).toBe(true)
    }
    expect(chunks.map((chunk) => chunk.id)).toEqual(chunks.map((_, n) => `P01#${n}`))
  })
})

describe('splitLong', () => {
  it('breaks at the Bengali full stop', () => {
    expect(splitLong('প্রথম বাক্য। দ্বিতীয় বাক্য।', 15)).toEqual(['প্রথম বাক্য।', 'দ্বিতীয় বাক্য।'])
  })

  it('cuts a sentence that is longer than the budget', () => {
    const parts = splitLong('x'.repeat(250), 100)
    expect(parts.map((part) => part.length)).toEqual([100, 100, 50])
  })
})
