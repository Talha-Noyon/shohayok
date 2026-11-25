import {describe, expect, it} from 'vitest'

import {atlasScoreToCosine} from '../src/retrieval/atlasIndex.js'
import {fuse, RRF_K} from '../src/retrieval/fusion.js'
import {toTextSearch} from '../src/retrieval/keyword.js'
import {LocalVectorIndex, type IndexedChunk} from '../src/retrieval/localIndex.js'
import {Retriever} from '../src/retrieval/retriever.js'
import type {Hit, VectorIndex} from '../src/retrieval/types.js'

const hit = (chunkId: string, score: number): Hit => ({
  chunkId,
  docId: chunkId.split('#')[0] ?? chunkId,
  title: chunkId,
  text: chunkId,
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
  const chunk = (chunkId: string, embedding: number[]): IndexedChunk => ({
    chunkId,
    docId: chunkId,
    title: chunkId,
    text: chunkId,
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
