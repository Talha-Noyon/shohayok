import {describe, expect, it} from 'vitest'

import {cachedEmbedder, cacheKey, MemoryCache} from '../src/cache/cache.js'

describe('MemoryCache', () => {
  it('returns what was stored until it expires', async () => {
    let now = 0
    const cache = new MemoryCache<string>(() => now)
    await cache.set('k', 'v', 10)
    expect(await cache.get('k')).toBe('v')
    now = 11_000
    expect(await cache.get('k')).toBeUndefined()
  })
})

describe('cacheKey', () => {
  it('is stable, keeps its prefix readable and hides the text', () => {
    const key = cacheKey('answer', 'en', 'how much is delivery')
    expect(key).toBe(cacheKey('answer', 'en', 'how much is delivery'))
    expect(key).not.toBe(cacheKey('answer', 'bn', 'how much is delivery'))
    expect(key.startsWith('answer:')).toBe(true)
    expect(key).not.toContain('delivery')
  })
})

describe('cachedEmbedder', () => {
  it('embeds only the texts it has not seen, in one request, and keeps the order', async () => {
    const requests: string[][] = []
    const embed = cachedEmbedder(
      async (texts) => {
        requests.push(texts)
        return texts.map((text) => [text.length])
      },
      new MemoryCache<number[]>(),
      'model-a'
    )
    expect(await embed(['aa', 'b'])).toEqual({vectors: [[2], [1]], requested: 2})
    expect(await embed(['ccc', 'aa', 'b'])).toEqual({vectors: [[3], [2], [1]], requested: 1})
    expect(await embed(['aa'])).toEqual({vectors: [[2]], requested: 0})
    expect(requests).toEqual([['aa', 'b'], ['ccc']])
  })

  it('keeps vectors of different models apart', async () => {
    const cache = new MemoryCache<number[]>()
    await cachedEmbedder(async (texts) => texts.map(() => [1]), cache, 'model-a')(['x'])
    const other = await cachedEmbedder(
      async (texts) => texts.map(() => [2]),
      cache,
      'model-b'
    )(['x'])
    expect(other.vectors).toEqual([[2]])
  })
})
