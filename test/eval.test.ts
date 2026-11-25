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
import {
  renderMarkdown,
  replaceResultsSection,
  RESULTS_END,
  RESULTS_START,
  summarize,
  type ItemResult,
  type RunInfo
} from '../src/eval/report.js'

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
  date: '2026-11-25',
  hardware: 'Test GPU',
  embedModel: 'bge-m3',
  embedProvider: 'Ollama',
  chatModel: 'gemma3:12b',
  chatProvider: 'Ollama',
  rewriteModel: 'gemma3:12b',
  vectorBackend: 'in-app cosine',
  topK: 4,
  threshold: 0.5,
  retrievalOnly: false
}

const result = (overrides: Partial<ItemResult>): ItemResult => ({
  id: 'X',
  lang: 'en',
  detected: 'en',
  question: 'q',
  answerable: true,
  ranked: ['F01'],
  rank: 1,
  rankWithoutRewrite: null,
  confidence: 0.8,
  handoff: false,
  retrievalMs: 100,
  answer: 'a',
  factsOk: true,
  langOk: true,
  firstTokenMs: 500,
  totalMs: 1500,
  ...overrides
})

describe('summarize and renderMarkdown', () => {
  const results = [
    result({id: 'E1'}),
    result({id: 'E2', rank: 3, factsOk: false}),
    result({id: 'N1', lang: 'banglish', detected: 'banglish', rank: 1, rankWithoutRewrite: null}),
    result({id: 'N2', lang: 'banglish', detected: 'en', rank: 2, rankWithoutRewrite: 2}),
    result({
      id: 'N3',
      lang: 'banglish',
      detected: 'banglish',
      answerable: false,
      rank: null,
      confidence: 0.3,
      handoff: true,
      factsOk: null
    })
  ]
  const summary = summarize(results, info)

  it('scores each language and the whole set', () => {
    expect(summary.byLang.en).toMatchObject({
      n: 2,
      hit1: 0.5,
      hit3: 1,
      mrr: (1 + 1 / 3) / 2,
      facts: 0.5
    })
    expect(summary.byLang.banglish).toMatchObject({n: 3, detection: 2 / 3, hit3: 1})
    expect(summary.byLang.bn.n).toBe(0)
    expect(summary.byLang.all.n).toBe(5)
  })

  it('compares Banglish retrieval with and without the rewrite', () => {
    expect(summary.banglishRewrite).toEqual({withRewrite: 1, withoutRewrite: 0.5})
  })

  it('renders a readable report', () => {
    const markdown = renderMarkdown(summary)
    expect(markdown).toContain('Measured 2026-11-25 on Test GPU')
    expect(markdown).toContain('| Right document in the top 3 | 100% | – | 100% | 100% |')
    expect(markdown).toContain('100% with the rewrite step, 50% without it')
    expect(markdown).toContain('| Full answer | 1.5 s | 1.5 s |')
    expect(markdown).toContain('via Ollama')
    expect(markdown).not.toContain('Cloud models were used')
  })

  it('warns that cloud latency includes the network', () => {
    const cloud = summarize(results, {...info, chatProvider: 'OpenRouter'})
    const markdown = renderMarkdown(cloud)
    expect(markdown).toContain('answers `gemma3:12b` via OpenRouter')
    expect(markdown).toContain('Cloud models were used, so latency includes the network')
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
