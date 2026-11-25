/** A unit-length copy, so cosine similarity becomes a plain dot product */
export function normalize(vector: ArrayLike<number>): Float32Array {
  let sum = 0
  for (let i = 0; i < vector.length; i++) sum += (vector[i] ?? 0) ** 2
  const norm = Math.sqrt(sum) || 1
  const out = new Float32Array(vector.length)
  for (let i = 0; i < vector.length; i++) out[i] = (vector[i] ?? 0) / norm
  return out
}

export function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += (a[i] ?? 0) * (b[i] ?? 0)
  return sum
}
