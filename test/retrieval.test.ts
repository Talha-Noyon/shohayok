import {describe, expect, it} from 'vitest'

import {
  atlasScoreToCosine,
  needsRebuild,
  vectorIndexDefinition
} from '../src/retrieval/atlasIndex.js'
import {fuse, RRF_K} from '../src/retrieval/fusion.js'
import {toTextSearch} from '../src/retrieval/keyword.js'
import {LocalVectorIndex, type IndexedChunk} from '../src/retrieval/localIndex.js'
import {Retriever} from '../src/retrieval/retriever.js'
import {
  matchesFilter,
  toMongoFilter,
  type Hit,
  type SearchFilter,
  type VectorIndex
} from '../src/retrieval/types.js'

const hit = (chunkId: string, score: number): Hit => ({
  chunkId,
  docId: chunkId.split('#')[0] ?? chunkId,
  title: chunkId,
  text: chunkId,
  textEn: chunkId,
  textBn: chunkId,
  score
})

describe('fuse', () => {
  it('ranks a chunk that several lists agree on above a single first place', () => {
    const fused = fuse([
      {hits: [hit('A#0', 0.9), hit('B#0', 0.8)], cosine: true},
      {hits: [hit('C#0', 7), hit('B#0', 5)], cosine: false}
    ])
    expect(fused.map((entry) => entry.chunkId)).toEqual(['B#0', 'A#0', 'C#0'])
    expect(fused[0]?.rrf).toBeCloseTo(2 / (RRF_K + 2))
  })

  it('keeps the best cosine from vector lists and none from keyword-only finds', () => {
    const fused = fuse([
      {hits: [hit('A#0', 0.4)], cosine: true},
      {hits: [hit('A#0', 0.7)], cosine: true},
      {hits: [hit('C#0', 12)], cosine: false}
    ])
    expect(fused.find((entry) => entry.chunkId === 'A#0')?.cosine).toBe(0.7)
    expect(fused.find((entry) => entry.chunkId === 'C#0')?.cosine).toBeNull()
  })
})

describe('LocalVectorIndex', () => {
  const chunk = (
    chunkId: string,
    embedding: number[],
    filters: IndexedChunk['filters'] = {type: 'policy'}
  ): IndexedChunk => ({
    chunkId,
    docId: chunkId,
    title: chunkId,
    text: chunkId,
    textEn: chunkId,
    textBn: chunkId,
    filters,
    embedding
  })

  it('returns the k nearest chunks by cosine similarity, whatever the vector length', async () => {
    const index = new LocalVectorIndex([
      chunk('east', [10, 0]),
      chunk('north', [0, 3]),
      chunk('northeast', [1, 1])
    ])
    const hits = await index.search([2, 0.1], 2)
    expect(hits.map((h) => h.chunkId)).toEqual(['east', 'northeast'])
    expect(hits[0]?.score).toBeCloseTo(0.9988, 3)
  })

  it('refuses a query from a different embedding model', async () => {
    const index = new LocalVectorIndex([chunk('a', [1, 0, 0])])
    await expect(index.search([1, 0], 1)).rejects.toThrow('Run npm run ingest again')
  })

  it('refuses stored chunks of mixed sizes', () => {
    expect(() => new LocalVectorIndex([chunk('a', [1, 0]), chunk('b', [1, 0, 0])])).toThrow(
      'has 3 dimensions, expected 2'
    )
  })

  it('searches only the chunks that match a filter', async () => {
    const index = new LocalVectorIndex([
      chunk('red-sharee', [1, 0], {
        type: 'product',
        category: 'sharee',
        colors: ['red'],
        price: 900
      }),
      chunk('blue-sharee', [1, 0.1], {
        type: 'product',
        category: 'sharee',
        colors: ['blue'],
        price: 800
      }),
      chunk('policy', [1, 0])
    ])
    const hits = await index.search([1, 0], 3, {type: 'product', colors: ['blue']})
    expect(hits.map((h) => h.chunkId)).toEqual(['blue-sharee'])
  })

  it('finds nothing in an empty index', async () => {
    expect(await new LocalVectorIndex([]).search([1, 0], 3)).toEqual([])
  })
})

describe('Retriever', () => {
  it('embeds every phrasing once, searches both ways, and reports the best cosine', async () => {
    const embedded: string[][] = []
    const vectorIndex: VectorIndex = {
      kind: 'local',
      search: async (vector) => [
        hit(vector[0] === 1 ? 'F01#0' : 'F02#0', vector[0] === 1 ? 0.62 : 0.71)
      ]
    }
    const retriever = new Retriever({
      embed: async (texts) => {
        embedded.push(texts)
        return texts.map((_, i) => [i === 0 ? 1 : 0, 1])
      },
      vectorIndex,
      keyword: async (query) => (query.includes('koto') ? [hit('F01#0', 3)] : [])
    })

    const result = await retriever.retrieve(['delivery koto?', 'ডেলিভারি কত?', 'delivery koto?'], 2)

    expect(embedded).toEqual([['delivery koto?', 'ডেলিভারি কত?']])
    expect(result.hits.map((h) => h.docId)).toEqual(['F01', 'F02'])
    expect(result.confidence).toBe(0.71)
  })

  it('passes the filter to both searches', async () => {
    const seen: (SearchFilter | undefined)[] = []
    const retriever = new Retriever({
      embed: async (texts) => texts.map(() => [1, 0]),
      vectorIndex: {
        kind: 'local',
        search: async (_vector, _k, filter) => {
          seen.push(filter)
          return []
        }
      },
      keyword: async (_query, _k, filter) => {
        seen.push(filter)
        return []
      }
    })
    await retriever.retrieve(['lal sharee'], 4, {type: 'product', category: 'sharee'})
    expect(seen).toEqual([
      {type: 'product', category: 'sharee'},
      {type: 'product', category: 'sharee'}
    ])
  })

  it('returns nothing, and no confidence, for an empty question', async () => {
    const retriever = new Retriever({
      embed: async () => [],
      vectorIndex: {kind: 'local', search: async () => []},
      keyword: async () => []
    })
    expect(await retriever.retrieve(['  '], 4)).toEqual({
      hits: [],
      confidence: null,
      embedMs: 0,
      searchMs: 0
    })
  })
})

describe('search helpers', () => {
  it('strips what $text would read as a phrase or a negation', () => {
    expect(toTextSearch('"three-piece" -silk price')).toBe('three-piece silk price')
  })

  it('turns an Atlas vector score back into cosine similarity', () => {
    expect(atlasScoreToCosine(1)).toBe(1)
    expect(atlasScoreToCosine(0.75)).toBe(0.5)
    expect(atlasScoreToCosine(0.5)).toBe(0)
  })
})

describe('search filters', () => {
  const redSharee = {type: 'product' as const, category: 'sharee', colors: ['red'], price: 3000}

  it('turns a filter into a MongoDB query on the chunk filter fields', () => {
    expect(toMongoFilter(undefined)).toEqual({})
    expect(
      toMongoFilter({
        type: 'product',
        category: 'sharee',
        colors: ['red', 'blue'],
        minPrice: 1000,
        maxPrice: 5000
      })
    ).toEqual({
      'filters.type': 'product',
      'filters.category': 'sharee',
      'filters.colors': {$in: ['red', 'blue']},
      'filters.price': {$gte: 1000, $lte: 5000}
    })
  })

  it('applies the same filter in memory', () => {
    expect(matchesFilter(redSharee, undefined)).toBe(true)
    expect(
      matchesFilter(redSharee, {category: 'sharee', colors: ['green', 'red'], maxPrice: 5000})
    ).toBe(true)
    expect(matchesFilter(redSharee, {maxPrice: 2000})).toBe(false)
    expect(matchesFilter(redSharee, {minPrice: 3500})).toBe(false)
    expect(matchesFilter(redSharee, {colors: ['blue']})).toBe(false)
    expect(matchesFilter({type: 'policy'}, {type: 'product'})).toBe(false)
    expect(matchesFilter({type: 'policy'}, {maxPrice: 100})).toBe(false)
  })

  it('declares every filter field in the Atlas vector index', () => {
    const fields = vectorIndexDefinition(2048).fields
    expect(fields[0]).toEqual({
      type: 'vector',
      path: 'embedding',
      numDimensions: 2048,
      similarity: 'cosine'
    })
    expect(fields.slice(1)).toEqual(
      ['filters.type', 'filters.category', 'filters.colors', 'filters.price'].map((path) => ({
        type: 'filter',
        path
      }))
    )
  })

  it('rebuilds the Atlas index when the size or the filter fields changed', () => {
    const wanted = vectorIndexDefinition(2048)
    expect(needsRebuild(wanted, wanted)).toBe(false)
    expect(needsRebuild(vectorIndexDefinition(1024), wanted)).toBe(true)
    expect(needsRebuild({fields: wanted.fields.slice(0, 1)}, wanted)).toBe(true)
    expect(needsRebuild(undefined, wanted)).toBe(true)
  })
})
