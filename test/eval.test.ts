import {describe, expect, it} from 'vitest'

import {
  bestThreshold,
  factsFound,
  firstRelevantRank,
  hitAt,
  percentile,
  reciprocalRank,
  scoreHandoff
} from '../src/eval/metrics.js'
import {parseEvalSet, loadEvalSet} from '../src/eval/cases.js'
import {
  renderFailures,
  renderMarkdown,
  replaceResultsSection,
  RESULTS_END,
  RESULTS_START,
  summarize,
  type RunInfo
} from '../src/eval/report.js'
import {offlineDeps, runCase} from '../src/eval/runner.js'
import {scoreCase, type CaseResult} from '../src/eval/score.js'
import {loadPolicies, loadProducts} from '../src/shop/schema.js'

describe('ranking metrics', () => {
  it('finds the first expected document', () => {
    expect(firstRelevantRank(['F02', 'F01', 'P01'], ['F01', 'P01'])).toBe(2)
    expect(firstRelevantRank(['F02'], ['F01'])).toBeNull()
  })

  it('scores hits and reciprocal rank', () => {
    expect(hitAt(2, 3)).toBe(true)
    expect(hitAt(4, 3)).toBe(false)
    expect(hitAt(null, 3)).toBe(false)
    expect(reciprocalRank(2)).toBe(0.5)
    expect(reciprocalRank(null)).toBe(0)
  })
})

describe('factsFound', () => {
  it('matches a price whatever the digits and separators', () => {
    expect(factsFound('দাম ১,৪৫০ টাকা। [P01]', [['1450']])).toBe(true)
    expect(factsFound('It costs Tk 1,450.', [['1450']])).toBe(true)
  })

  it('does not find 7 inside 70', () => {
    expect(factsFound('Delivery is Tk 70.', [['7']])).toBe(false)
    expect(factsFound('Within 7 days.', [['7']])).toBe(true)
  })

  it('needs every group, and any spelling within a group', () => {
    expect(factsFound('Pay with বিকাশ in 3 to 5 days', [['bkash', 'বিকাশ'], ['3'], ['5']])).toBe(
      true
    )
    expect(factsFound('3 days', [['3'], ['5']])).toBe(false)
  })
})

describe('percentile', () => {
  it('uses the nearest rank', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    expect(percentile(values, 50)).toBe(50)
    expect(percentile(values, 95)).toBe(100)
    expect(percentile([], 50)).toBeNull()
  })
})

describe('handoff scoring', () => {
  const cases = [
    {confidence: 0.2, answerable: false},
    {confidence: 0.45, answerable: false},
    {confidence: 0.42, answerable: true},
    {confidence: 0.8, answerable: true},
    {confidence: null, answerable: false}
  ]

  it('treats "no answer in the data" as the positive class', () => {
    expect(scoreHandoff(cases, 0.5)).toMatchObject({precision: 0.75, recall: 1, handedOff: 4})
    expect(scoreHandoff(cases, 0.3)).toMatchObject({precision: 1, recall: 2 / 3, handedOff: 2})
  })

  it('picks the threshold with the best F1', () => {
    // 0.3 gives F1 0.80, 0.44 gives 0.67, 0.5 gives 0.86
    const best = bestThreshold(cases, [0.3, 0.44, 0.5])
    expect(best?.threshold).toBe(0.5)
    expect(best?.f1).toBeCloseTo(6 / 7)
  })
})

const info: RunInfo = {
  mode: 'online',
  dates: '2026-11-27',
  embedModel: 'embed-free',
  chatModel: 'chat-free',
  rewriteModel: 'chat-free',
  vectorBackend: 'Atlas',
  topK: 4,
  threshold: 0.25,
  total: 4,
  warmed: 2,
  warmRequests: 1
}

const result = (over: Partial<CaseResult>): CaseResult => ({
  id: 'x-01',
  lang: 'en',
  kind: 'tool',
  mode: 'online',
  expected: 'delivery_fee',
  actual: 'delivery_fee',
  decision: 'tool',
  routeOk: true,
  readsOk: true,
  factsOk: true,
  forbidden: [],
  langOk: true,
  replyLang: 'en',
  confidence: null,
  rewritten: false,
  reason: 'r',
  requests: {embed: 0, chat: 0},
  conversationRequests: {embed: 0, chat: 0},
  totalMs: 300,
  firstTokenMs: null,
  failed: [],
  answer: 'ok',
  at: '2026-11-27T01:00:00.000Z',
  ...over
})

const results: CaseResult[] = [
  result({id: 'deliv-01'}),
  result({id: 'order-01', lang: 'banglish', readsOk: false, failed: ['reads']}),
  result({
    id: 'policy-01',
    kind: 'answer',
    expected: 'answer',
    actual: 'answer',
    decision: 'answer',
    rank: 1,
    confidence: 0.5,
    requests: {embed: 0, chat: 1},
    conversationRequests: {embed: 0, chat: 1},
    totalMs: 4000,
    firstTokenMs: 2000
  }),
  result({
    id: 'off-01',
    lang: 'bn',
    kind: 'handoff',
    expected: 'handoff',
    actual: 'handoff',
    decision: 'handoff',
    readsOk: null,
    factsOk: null,
    confidence: 0.1,
    requests: {embed: 1, chat: 0},
    conversationRequests: {embed: 1, chat: 0}
  })
]
const cases = parseEvalSet(
  results.map((r) => ({
    id: r.id,
    lang: r.lang,
    kind: r.kind,
    question: 'q',
    expect: {route: r.expected, ...(r.id === 'order-01' && {forbid: ['Mirpur']})}
  }))
)

describe('summarize', () => {
  const summary = summarize(results, info, cases)

  it('scores each language and the whole set', () => {
    expect(summary.byLang.all).toMatchObject({n: 4, route: 1, reads: 2 / 3, facts: 1, language: 1})
    expect(summary.byLang.banglish).toMatchObject({n: 1, reads: 0})
    expect(summary.byKind.answer).toEqual({n: 1, route: 1})
  })

  it('scores search, handoff, cost and speed', () => {
    expect(summary.search).toMatchObject({n: 1, hit1: 1, mrr: 1})
    expect(summary.handoff).toEqual({precision: 1, recall: 1, n: 2})
    expect(summary.cost.fixed).toEqual({n: 2, mean: 0})
    expect(summary.cost.model).toEqual({n: 2, mean: 1, max: 1})
    expect(summary.cost.total).toBe(2)
    expect(summary.latency.answered.p50).toBe(4000)
    expect(summary.safety).toEqual({checked: 1, leaks: []})
    expect(summary.failures).toEqual([
      {id: 'order-01', failed: ['reads'], expected: 'delivery_fee', actual: 'delivery_fee'}
    ])
  })

  it('renders the tables and says what the numbers include', () => {
    const markdown = renderMarkdown(summary)
    expect(markdown).toContain('| Went to the right place | 100% | 100% | 100% | 100% |')
    expect(markdown).toContain('`embed-free`')
    expect(markdown).toContain('The run spent 3 free model requests in all.')
    expect(markdown).toContain('Safety: none of the 1 replies')
    expect(renderFailures(summary)).toContain('| order-01 | reads | delivery_fee | delivery_fee |')
  })

  it('offline, leaves out what only the models can measure', () => {
    const offline = summarize(results, {...info, mode: 'offline'}, cases)
    expect(offline.search).toBeNull()
    expect(offline.handoff).toBeNull()
    expect(renderMarkdown(offline)).not.toContain('Cost and speed')
  })
})

describe('the eval set', () => {
  it('covers every language and kind, with documents that exist', async () => {
    const set = await loadEvalSet()
    expect(set.length).toBeGreaterThanOrEqual(100)
    for (const lang of ['en', 'bn', 'banglish']) {
      expect(set.filter((item) => item.lang === lang).length).toBeGreaterThanOrEqual(25)
    }
    const ids = new Set([
      ...(await loadProducts()).map((p) => p.id),
      ...(await loadPolicies()).map((p) => p.id)
    ])
    for (const item of set) for (const doc of item.expect.docs) expect(ids).toContain(doc)
  })

  it('offline, routes and answers from data without a leak', async () => {
    const set = await loadEvalSet()
    const deps = await offlineDeps()
    const scored = []
    for (const item of set)
      scored.push(scoreCase(item, await runCase(item, deps, 'eval'), 'offline'))
    expect(scored.flatMap((r) => r.forbidden)).toEqual([])
    expect(scored.filter((r) => r.routeOk).length / scored.length).toBeGreaterThanOrEqual(0.95)
  })
})

describe('replaceResultsSection', () => {
  it('replaces only what sits between the markers', () => {
    const readme = `# Title\n\n${RESULTS_START}\nold\n${RESULTS_END}\n\nMore text`
    expect(replaceResultsSection(readme, 'new')).toBe(
      `# Title\n\n${RESULTS_START}\nnew\n${RESULTS_END}\n\nMore text`
    )
  })

  it('refuses a README without markers', () => {
    expect(() => replaceResultsSection('# Title', 'new')).toThrow('no results markers')
  })
})
