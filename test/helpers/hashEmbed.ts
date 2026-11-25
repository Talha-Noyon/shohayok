/**
 * A deterministic stand-in for an embedding model: character trigrams hashed into a fixed number
 * of buckets. Texts that share spelling get similar vectors, which is enough to test the wiring
 * of retrieval without Ollama.
 */
export function hashEmbed(text: string, dimensions = 256): number[] {
  const vector = new Array<number>(dimensions).fill(0)
  const padded = ` ${text.toLowerCase()} `
  for (let i = 0; i + 3 <= padded.length; i++) {
    let hash = 2166136261
    for (const char of padded.slice(i, i + 3)) {
      hash ^= char.codePointAt(0) ?? 0
      hash = Math.imul(hash, 16777619)
    }
    const bucket = (hash >>> 0) % dimensions
    vector[bucket] = (vector[bucket] ?? 0) + 1
  }
  return vector
}
