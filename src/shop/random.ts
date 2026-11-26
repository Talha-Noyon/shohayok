export interface Random {
  /** A number in [0, 1) */
  next(): number
  /** An integer from `min` to `max`, both included */
  int(min: number, max: number): number
  pick<T>(list: readonly T[]): T
  chance(probability: number): boolean
  shuffle<T>(list: readonly T[]): T[]
}

/** Mulberry32: tiny, fast and seeded, so the generated shop is the same on every machine */
export function createRandom(seed: number): Random {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1))
  return {
    next,
    int,
    pick: <T>(list: readonly T[]): T => {
      if (list.length === 0) throw new Error('Cannot pick from an empty list')
      return list[int(0, list.length - 1)] as T
    },
    chance: (probability) => next() < probability,
    shuffle: <T>(list: readonly T[]): T[] => {
      const copy = [...list]
      for (let i = copy.length - 1; i > 0; i--) {
        const j = int(0, i)
        ;[copy[i], copy[j]] = [copy[j] as T, copy[i] as T]
      }
      return copy
    }
  }
}
