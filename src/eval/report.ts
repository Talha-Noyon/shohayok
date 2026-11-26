import type {Lang} from '../lang/detect.js'
import {KINDS, SEARCH_ROUTES, type EvalCase} from './cases.js'
import {
  bestThreshold,
  hitAt,
  mean,
  percentile,
  reciprocalRank,
  type HandoffScore
} from './metrics.js'
import type {CaseResult, Check, Mode} from './score.js'

export interface RunInfo {
  mode: Mode
  /** "2026-11-27", or a range when a run was resumed on later days */
  dates: string
  embedModel: string
  chatModel: string
  rewriteModel: string
  vectorBackend: string
  topK: number
  threshold: number
  /** Cases in the set; a resumed run may have scored fewer so far */
  total: number
  /** Questions embedded ahead of the run, several to a request */
  warmed: number
  warmRequests: number
}

export interface Group {
  n: number
  route: number | null
  reads: number | null
  facts: number | null
  language: number | null
}

export interface Latency {
  p50: number | null
  p95: number | null
}

export interface Summary {
  info: RunInfo
  byLang: Record<Lang | 'all', Group>
  byKind: Record<EvalCase['kind'], {n: number; route: number | null}>
  /** Cases with forbidden strings, and the ones whose reply contained any */
  safety: {checked: number; leaks: {id: string; found: string[]}[]}
  search: {n: number; hit1: number | null; hit3: number | null; mrr: number | null} | null
  /** Handoff as a classifier whose positive class is "the data has no answer" */
  handoff: {precision: number | null; recall: number | null; n: number} | null
  bestHandoff: HandoffScore | null
  cost: {
    fixed: {n: number; mean: number | null}
    model: {n: number; mean: number | null; max: number | null}
    total: number
  }
  latency: {fixed: Latency; answered: Latency; firstToken: Latency}
  failures: {id: string; failed: Check[]; expected: string; actual: string}[]
}

const share = (flags: boolean[]) => mean(flags.map((flag) => (flag ? 1 : 0)))
const latency = (values: number[]): Latency => ({
  p50: percentile(values, 50),
  p95: percentile(values, 95)
})
const requestsOf = (result: CaseResult) => result.requests.embed + result.requests.chat
const definite = (values: (boolean | null)[]) => values.filter((v): v is boolean => v !== null)

function group(results: CaseResult[]): Group {
  return {
    n: results.length,
    route: share(results.map((r) => r.routeOk)),
    reads: share(definite(results.map((r) => r.readsOk))),
    facts: share(definite(results.map((r) => r.factsOk))),
    language: share(results.map((r) => r.langOk))
  }
}

export function summarize(results: CaseResult[], info: RunInfo, cases: EvalCase[]): Summary {
  const langs: Lang[] = ['en', 'bn', 'banglish']
  const byLang = Object.fromEntries([
    ...langs.map((lang) => [lang, group(results.filter((r) => r.lang === lang))]),
    ['all', group(results)]
  ]) as Summary['byLang']
  const byKind = Object.fromEntries(
    KINDS.map((kind) => {
      const of = results.filter((r) => r.kind === kind)
      return [kind, {n: of.length, route: share(of.map((r) => r.routeOk))}]
    })
  ) as Summary['byKind']

  const forbids = new Map(cases.map((item) => [item.id, item.expect.forbid.length > 0]))
  // Offline, an open question's reply is the budget notice, so only tool replies are checked
  const checked = results.filter(
    (r) => forbids.get(r.id) && (r.mode === 'online' || !SEARCH_ROUTES.includes(r.expected))
  )
  const leaks = results.flatMap((r) =>
    r.forbidden.length > 0 ? [{id: r.id, found: r.forbidden}] : []
  )

  const online = info.mode === 'online'
  const ranked = results.filter((r) => r.rank !== undefined)
  const search = online
    ? {
        n: ranked.length,
        hit1: share(ranked.map((r) => hitAt(r.rank ?? null, 1))),
        hit3: share(ranked.map((r) => hitAt(r.rank ?? null, 3))),
        mrr: mean(ranked.map((r) => reciprocalRank(r.rank ?? null)))
      }
    : null

  // Open questions with one right answer: the model's, or a callback offer
  const decided = results.filter((r) => r.expected === 'answer' || r.expected === 'handoff')
  let handoff: Summary['handoff'] = null
  if (online && decided.length > 0) {
    const handed = decided.filter((r) => r.actual === 'handoff')
    const unanswerable = decided.filter((r) => r.expected === 'handoff')
    const right = handed.filter((r) => r.expected === 'handoff').length
    handoff = {
      precision: handed.length > 0 ? right / handed.length : null,
      recall: unanswerable.length > 0 ? right / unanswerable.length : null,
      n: decided.length
    }
  }
  const bestHandoff = online
    ? bestThreshold(
        decided
          .filter((r) => !r.rewritten && r.confidence !== null)
          .map((r) => ({confidence: r.confidence, answerable: r.expected === 'answer'}))
      )
    : null

  const fixed = results.filter((r) => r.decision === 'tool')
  const modelled = results.filter((r) => r.decision !== 'tool' && r.decision !== 'quota')
  const answered = results.filter((r) => r.decision === 'answer')

  return {
    info,
    byLang,
    byKind,
    safety: {checked: checked.length, leaks},
    search,
    handoff,
    bestHandoff,
    cost: {
      fixed: {n: fixed.length, mean: mean(fixed.map(requestsOf))},
      model: {
        n: modelled.length,
        mean: mean(modelled.map(requestsOf)),
        max: modelled.length > 0 ? Math.max(...modelled.map(requestsOf)) : null
      },
      total: results.reduce(
        (sum, r) => sum + r.conversationRequests.embed + r.conversationRequests.chat,
        0
      )
    },
    latency: {
      fixed: latency(fixed.map((r) => r.totalMs)),
      answered: latency(answered.map((r) => r.totalMs)),
      firstToken: latency(
        answered.flatMap((r) => (r.firstTokenMs === null ? [] : [r.firstTokenMs]))
      )
    },
    failures: results
      .filter((r) => r.failed.length > 0)
      .map(({id, failed, expected, actual}) => ({id, failed, expected, actual}))
  }
}

export const pct = (value: number | null) => (value === null ? '–' : `${Math.round(value * 100)}%`)
export const ms = (value: number | null) =>
  value === null
    ? '–'
    : value >= 1000
      ? `${(value / 1000).toFixed(1)} s`
      : `${Math.round(value)} ms`
const decimal = (value: number | null, digits = 2) => (value === null ? '–' : value.toFixed(digits))

export function renderMarkdown(summary: Summary): string {
  const {info, byLang, byKind} = summary
  const online = info.mode === 'online'
  const columns: (Lang | 'all')[] = ['en', 'bn', 'banglish', 'all']
  const row = (label: string, value: (g: Group) => string) =>
    `| ${label} | ${columns.map((column) => value(byLang[column])).join(' | ')} |`
  const scored = byLang.all.n

  const lines = [
    online
      ? `Measured ${info.dates} against MongoDB Atlas (${info.vectorBackend} vector search, ` +
        `top ${info.topK}), embeddings \`${info.embedModel}\` and answers \`${info.chatModel}\`, ` +
        `both free on OpenRouter. ${scored} of ${info.total} cases.`
      : `Offline, ${info.dates}: no model, the shop in memory, and the day's model budget at ` +
        `zero, so open questions are only checked to reach search. ${scored} of ${info.total} cases.`,
    '',
    '| | English | Bangla | Banglish | All |',
    '|---|---|---|---|---|',
    row('Cases', (g) => String(g.n)),
    row('Went to the right place', (g) => pct(g.route)),
    row('Read the right order, place, product and filters', (g) => pct(g.reads)),
    row('Reply states the expected facts', (g) => pct(g.facts)),
    row("Reply in the customer's language", (g) => pct(g.language)),
    '',
    'Routing by kind of case: ' +
      KINDS.filter((kind) => byKind[kind].n > 0)
        .map((kind) => `${kind} ${pct(byKind[kind].route)} of ${byKind[kind].n}`)
        .join(', ') +
      '.',
    '',
    summary.safety.leaks.length === 0
      ? `Safety: none of the ${summary.safety.checked} replies checked for leaks showed another ` +
        "customer's order, a phone number or the prompt."
      : `Safety: ${summary.safety.leaks.length} replies showed something they must not: ` +
        summary.safety.leaks.map((leak) => `${leak.id} (${leak.found.join(', ')})`).join('; ') +
        '.'
  ]

  if (online && summary.search) {
    lines.push(
      '',
      `Search, over ${summary.search.n} open questions with a known document: right document ` +
        `first ${pct(summary.search.hit1)}, in the top 3 ${pct(summary.search.hit3)}, ` +
        `mean reciprocal rank ${decimal(summary.search.mrr)}.`
    )
  }
  if (summary.handoff) {
    lines.push(
      '',
      `Handoff at cosine ${info.threshold}: precision ${pct(summary.handoff.precision)}, ` +
        `recall ${pct(summary.handoff.recall)}, over ${summary.handoff.n} open questions.` +
        (summary.bestHandoff
          ? ` The best threshold on this set would be ${summary.bestHandoff.threshold} ` +
            `(precision ${pct(summary.bestHandoff.precision)}, ` +
            `recall ${pct(summary.bestHandoff.recall)}).`
          : '')
    )
  }
  if (online) {
    const {cost, latency: l} = summary
    lines.push(
      '',
      '| Cost and speed | Replies from shop data | Model answers |',
      '|---|---|---|',
      `| Turns | ${cost.fixed.n} | ${cost.model.n} |`,
      `| Model requests per turn | ${decimal(cost.fixed.mean, 1)} | ` +
        `${decimal(cost.model.mean, 1)} on average, ${cost.model.max ?? '–'} at most |`,
      `| Reply time, p50 | ${ms(l.fixed.p50)} | ${ms(l.answered.p50)} |`,
      `| Reply time, p95 | ${ms(l.fixed.p95)} | ${ms(l.answered.p95)} |`,
      `| First word, p50 | – | ${ms(l.firstToken.p50)} |`,
      '',
      `The run spent ${cost.total + info.warmRequests} free model requests in all.` +
        (info.warmed > 0
          ? ` The ${info.warmed} open questions were embedded ahead in ${info.warmRequests} ` +
            'request(s), so ' +
            'their turns show no embedding request and their reply times leave out one ' +
            'embedding call.'
          : '') +
        ' Times include the network and the free providers’ queues.'
    )
  }
  return lines.join('\n')
}

/** The cases that failed a check, for results/latest.md */
export function renderFailures(summary: Summary): string {
  if (summary.failures.length === 0) return 'Every case passed every check.'
  return [
    '| Case | Failed | Expected | Got |',
    '|---|---|---|---|',
    ...summary.failures.map(
      (f) => `| ${f.id} | ${f.failed.join(', ')} | ${f.expected} | ${f.actual} |`
    )
  ].join('\n')
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
