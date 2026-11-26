import {normalizeForMatch} from '../lang/digits.js'

/** 1-based rank of the first expected document, or null when none was retrieved */
export function firstRelevantRank(ranked: string[], expected: string[]): number | null {
  const index = ranked.findIndex((docId) => expected.includes(docId))
  return index < 0 ? null : index + 1
}

export function hitAt(rank: number | null, k: number): boolean {
  return rank !== null && rank <= k
}

export function reciprocalRank(rank: number | null): number {
  return rank === null ? 0 : 1 / rank
}

/** A number must match whole: "7" is not found in "70" */
function contains(normalizedAnswer: string, fact: string): boolean {
  const needle = normalizeForMatch(fact)
  if (/^\d+$/.test(needle)) return new RegExp(`(?<!\\d)${needle}(?!\\d)`).test(normalizedAnswer)
  return normalizedAnswer.includes(needle)
}

/** Every group must appear in the answer; any spelling within a group counts */
export function factsFound(answer: string, groups: string[][]): boolean {
  const normalized = normalizeForMatch(answer)
  return groups.every((group) => group.some((fact) => contains(normalized, fact)))
}

export function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
}

/** Nearest-rank percentile */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(Math.max(Math.ceil((p / 100) * sorted.length) - 1, 0), sorted.length - 1)
  return sorted[index] ?? null
}

export interface HandoffCase {
  confidence: number | null
  answerable: boolean
}

export interface HandoffScore {
  threshold: number
  /** Of the questions handed off, the share that really had no answer */
  precision: number | null
  /** Of the questions without an answer, the share that was handed off */
  recall: number | null
  f1: number | null
  handedOff: number
}

/** Scores handoff as a classifier whose positive class is "no answer in the data" */
export function scoreHandoff(cases: HandoffCase[], threshold: number): HandoffScore {
  let truePositive = 0
  let falsePositive = 0
  let falseNegative = 0
  for (const {confidence, answerable} of cases) {
    const handedOff = confidence === null || confidence < threshold
    if (handedOff && !answerable) truePositive += 1
    else if (handedOff && answerable) falsePositive += 1
    else if (!handedOff && !answerable) falseNegative += 1
  }
  const precision =
    truePositive + falsePositive > 0 ? truePositive / (truePositive + falsePositive) : null
  const recall =
    truePositive + falseNegative > 0 ? truePositive / (truePositive + falseNegative) : null
  const f1 =
    precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null
  return {threshold, precision, recall, f1, handedOff: truePositive + falsePositive}
}

/** Cosine thresholds to try. The free embedding model scores good matches about 0.3 to 0.6. */
export const SWEEP = [0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5]

/** The threshold with the best F1, preferring higher precision on a tie */
export function bestThreshold(cases: HandoffCase[], thresholds = SWEEP): HandoffScore | null {
  let best: HandoffScore | null = null
  for (const threshold of thresholds) {
    const score = scoreHandoff(cases, threshold)
    if (score.f1 === null) continue
    if (
      !best ||
      score.f1 > (best.f1 ?? 0) ||
      (score.f1 === best.f1 && (score.precision ?? 0) > (best.precision ?? 0))
    ) {
      best = score
    }
  }
  return best
}
