import {describe, expect, it} from 'vitest'

import {loadDocs, loadEvalSet} from '../src/corpus/schema.js'
import {MAX_CHUNK_CHARS, toChunks} from '../src/ingest/chunk.js'

const docs = await loadDocs()
const evalSet = await loadEvalSet()

describe('corpus', () => {
  it('has 20 products and 15 policies with unique ids', () => {
    expect(docs.filter((doc) => doc.type === 'product')).toHaveLength(20)
    expect(docs.filter((doc) => doc.type === 'policy')).toHaveLength(15)
    expect(new Set(docs.map((doc) => doc.id)).size).toBe(docs.length)
  })

  it('gives every product id a P and every policy id an F', () => {
    for (const doc of docs) expect(doc.id[0]).toBe(doc.type === 'product' ? 'P' : 'F')
  })

  it('chunks every document within the size limit', () => {
    for (const chunk of docs.flatMap((doc) => toChunks(doc))) {
      expect(chunk.text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS)
    }
  })
})

describe('eval set', () => {
  const ids = new Set(docs.map((doc) => doc.id))

  it('has 17 questions in each language, 2 of them without an answer', () => {
    for (const lang of ['en', 'bn', 'banglish'] as const) {
      const items = evalSet.filter((item) => item.lang === lang)
      expect(items).toHaveLength(17)
      expect(items.filter((item) => !item.answerable)).toHaveLength(2)
    }
    expect(new Set(evalSet.map((item) => item.id)).size).toBe(evalSet.length)
  })

  it('points answerable questions at documents that exist, and the rest at none', () => {
    for (const item of evalSet) {
      if (item.answerable) {
        expect(item.expectDocs.length, item.id).toBeGreaterThan(0)
        for (const docId of item.expectDocs)
          expect(ids.has(docId), `${item.id} ${docId}`).toBe(true)
      } else {
        expect(item.expectDocs, item.id).toEqual([])
        expect(item.expectFacts, item.id).toEqual([])
      }
    }
  })
})
