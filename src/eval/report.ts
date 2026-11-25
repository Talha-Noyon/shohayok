import type {Lang} from '../lang/detect.js'
import {
  bestThreshold,
  hitAt,
  mean,
  percentile,
  reciprocalRank,
  scoreHandoff,
  type HandoffScore
} from './metrics.js'

export interface ItemResult {
  id: string
  /** The labelled language */
  lang: Lang
  detected: Lang
  question: string
  answerable: boolean
  ranked: string[]
  rank: number | null
  /** Banglish only: the rank when the rewrite step is skipped */
  rankWithoutRewrite: number | null
  confidence: number | null
  handoff: boolean
  /** Rewrite, embedding and search together */
  retrievalMs: number
  answer?: string
  /** null when the item lists no facts to check */
  factsOk?: boolean | null
  langOk?: boolean
  firstTokenMs?: number | null
  totalMs?: number
}

export interface RunInfo {
  date: string
  hardware: string
  embedModel: string
  /** Where the embeddings ran, such as "Ollama" */
  embedProvider: string
  chatModel: string
  /** Where the answers ran, such as "OpenRouter" */
  chatProvider: string
  rewriteModel: string
  vectorBackend: string
  topK: number
  threshold: number
  retrievalOnly: boolean
}

export interface LangSummary {
  n: number
  detection: number | null
  hit1: number | null
  hit3: number | null
  mrr: number | null
  facts: number | null
  language: number | null
}

export interface Latency {
  p50: number | null
  p95: number | null
}

export interface Summary {
  info: RunInfo
  byLang: Record<Lang | 'all', LangSummary>
  banglishRewrite: {withRewrite: number | null; withoutRewrite: number | null}
  handoff: HandoffScore
  bestHandoff: HandoffScore | null
  latency: {retrieval: Latency; firstToken: Latency; total: Latency}
}

const share = (flags: boolean[]) => mean(flags.map((flag) => (flag ? 1 : 0)))
const latency = (values: number[]): Latency => ({
  p50: percentile(values, 50),
  p95: percentile(values, 95)
})

function summarizeGroup(items: ItemResult[]): LangSummary {
  const answerable = items.filter((item) => item.answerable)
  const generated = items.filter((item) => item.answer !== undefined)
  const withFacts = generated.filter((item) => item.factsOk !== null && item.factsOk !== undefined)
  return {
    n: items.length,
    detection: share(items.map((item) => item.detected === item.lang)),
    hit1: share(answerable.map((item) => hitAt(item.rank, 1))),
    hit3: share(answerable.map((item) => hitAt(item.rank, 3))),
    mrr: mean(answerable.map((item) => reciprocalRank(item.rank))),
    facts: share(withFacts.map((item) => item.factsOk === true)),
    language: share(generated.map((item) => item.langOk === true))
  }
}

export function summarize(results: ItemResult[], info: RunInfo): Summary {
  const langs: Lang[] = ['en', 'bn', 'banglish']
  const byLang = Object.fromEntries([
    ...langs.map((lang) => [lang, summarizeGroup(results.filter((item) => item.lang === lang))]),
    ['all', summarizeGroup(results)]
  ]) as Record<Lang | 'all', LangSummary>

  const banglish = results.filter((item) => item.lang === 'banglish' && item.answerable)
  const cases = results.map(({confidence, answerable}) => ({confidence, answerable}))
  const generated = results.filter((item) => item.answer !== undefined)

  return {
    info,
    byLang,
    banglishRewrite: {
      withRewrite: share(banglish.map((item) => hitAt(item.rank, 3))),
      withoutRewrite: share(banglish.map((item) => hitAt(item.rankWithoutRewrite, 3)))
    },
    handoff: scoreHandoff(cases, info.threshold),
    bestHandoff: bestThreshold(cases),
    latency: {
      retrieval: latency(results.map((item) => item.retrievalMs)),
      firstToken: latency(
        generated.flatMap((item) =>
          typeof item.firstTokenMs === 'number' ? [item.firstTokenMs] : []
        )
      ),
      total: latency(
        generated.flatMap((item) => (item.totalMs === undefined ? [] : [item.totalMs]))
      )
    }
  }
}

export const pct = (value: number | null) => (value === null ? '–' : `${Math.round(value * 100)}%`)
export const ms = (value: number | null) =>
  value === null
    ? '–'
    : value >= 1000
      ? `${(value / 1000).toFixed(1)} s`
      : `${Math.round(value)} ms`
const decimal = (value: number | null) => (value === null ? '–' : value.toFixed(2))

export function renderMarkdown(summary: Summary): string {
  const {info, byLang} = summary
  const columns: (Lang | 'all')[] = ['en', 'bn', 'banglish', 'all']
  const row = (label: string, value: (s: LangSummary) => string) =>
    `| ${label} | ${columns.map((column) => value(byLang[column])).join(' | ')} |`

  const lines = [
    `Measured ${info.date} on ${info.hardware}. Embeddings \`${info.embedModel}\` via ` +
      `${info.embedProvider}, answers \`${info.chatModel}\` via ${info.chatProvider}, ` +
      `${info.vectorBackend} vector search, top ${info.topK} chunks, ${byLang.all.n} questions.`,
    '',
    '| | English | Bangla | Banglish | All |',
    '|---|---|---|---|---|',
    row('Questions', (s) => String(s.n)),
    row('Language detected correctly', (s) => pct(s.detection)),
    row('Right document ranked first', (s) => pct(s.hit1)),
    row('Right document in the top 3', (s) => pct(s.hit3)),
    row('Mean reciprocal rank', (s) => decimal(s.mrr)),
    row('Answer states the expected fact', (s) => pct(s.facts)),
    row("Answer in the customer's language", (s) => pct(s.language)),
    '',
    `Banglish questions with the right document in the top 3: ` +
      `${pct(summary.banglishRewrite.withRewrite)} with the rewrite step, ` +
      `${pct(summary.banglishRewrite.withoutRewrite)} without it.`,
    '',
    `Handoff at threshold ${info.threshold}: precision ${pct(summary.handoff.precision)}, ` +
      `recall ${pct(summary.handoff.recall)}.` +
      (summary.bestHandoff
        ? ` Best threshold on this set: ${summary.bestHandoff.threshold} ` +
          `(precision ${pct(summary.bestHandoff.precision)}, recall ${pct(summary.bestHandoff.recall)}).`
        : ''),
    '',
    '| Latency | p50 | p95 |',
    '|---|---|---|',
    `| Retrieval: rewrite, embed and search | ${ms(summary.latency.retrieval.p50)} | ${ms(summary.latency.retrieval.p95)} |`,
    `| First word of the answer | ${ms(summary.latency.firstToken.p50)} | ${ms(summary.latency.firstToken.p95)} |`,
    `| Full answer | ${ms(summary.latency.total.p50)} | ${ms(summary.latency.total.p95)} |`
  ]
  if (info.retrievalOnly) lines.push('', 'Retrieval only: answers were not generated in this run.')
  if (info.chatProvider !== 'Ollama' || info.embedProvider !== 'Ollama') {
    lines.push(
      '',
      'Cloud models were used, so latency includes the network and the provider queue.'
    )
  }
  return lines.join('\n')
}

export const RESULTS_START = '<!-- results:start -->'
export const RESULTS_END = '<!-- results:end -->'

/** Replaces the text between the results markers, keeping the markers */
export function replaceResultsSection(readme: string, markdown: string): string {
  const start = readme.indexOf(RESULTS_START)
  const end = readme.indexOf(RESULTS_END)
  if (start < 0 || end < start) throw new Error('README.md has no results markers')
  return `${readme.slice(0, start + RESULTS_START.length)}\n${markdown}\n${readme.slice(end)}`
}
