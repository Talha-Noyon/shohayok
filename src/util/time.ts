/** Milliseconds since `start`, a `performance.now()` reading, to one decimal place */
export function msSince(start: number): number {
  return Math.round((performance.now() - start) * 10) / 10
}
