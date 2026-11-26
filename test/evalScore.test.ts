import {describe, expect, it} from 'vitest'

import {parseEvalSet, type EvalCase} from '../src/eval/cases.js'
import {actualRoute, scoreCase, type CaseRun} from '../src/eval/score.js'
import type {Trace} from '../src/shared/api.js'

const baseTrace = (over: Partial<Trace> = {}): Trace => ({
  language: {lang: 'en', bengaliShare: 0, banglishWords: []},
  entities: {
    places: [],
    colors: [],
    categories: [],
    styles: [],
    collections: [],
    sizes: [],
    reference: false
  },
  intents: [],
  route: {kind: 'tool', tool: 'delivery_fee', reason: 'r'},
  decision: 'tool',
  tool: {name: 'delivery_fee', outcome: 'fee', ms: 1},
  modelRequests: {embed: 0, chat: 0},
  totalMs: 12,
  ...over
})

const caseOf = (over: Record<string, unknown> = {}, expect: Record<string, unknown> = {}) => {
  const [item] = parseEvalSet([
    {
      id: 'tool-01',
      lang: 'en',
      kind: 'tool',
      question: 'Delivery to Sylhet?',
      expect: {route: 'delivery_fee', ...expect},
      ...over
    }
  ])
  return item as EvalCase
}

const run = (answer: string, trace: Trace = baseTrace()): CaseRun => ({
  answer,
  trace,
  requests: trace.modelRequests,
  quota: false
})

describe('the eval set schema', () => {
  it('rejects unknown routes, unknown fields and repeated ids', () => {
    expect(() => caseOf({}, {route: 'teleport'})).toThrow()
    expect(() => caseOf({extra: true})).toThrow()
    expect(() => caseOf({}, {reads: {city: 'x'}})).toThrow()
    const one = {id: 'a-01', lang: 'en', kind: 'tool', question: 'hi', expect: {route: 'smalltalk'}}
    expect(() => parseEvalSet([one, one])).toThrow(/Duplicate/)
  })
})

describe('actualRoute', () => {
  it('names the tool, the answer or the handoff', () => {
    expect(actualRoute(baseTrace())).toBe('delivery_fee')
    const open = {route: {kind: 'answer' as const, reason: 'r'}}
    expect(actualRoute(baseTrace({...open, decision: 'answer'}))).toBe('answer')
    expect(actualRoute(baseTrace({...open, decision: 'cached'}))).toBe('answer')
    expect(actualRoute(baseTrace({...open, decision: 'handoff'}))).toBe('handoff')
  })
})

describe('scoreCase', () => {
  it('passes a tool reply that routes, reads and states the facts', () => {
    const item = caseOf({}, {reads: {places: ['Sylhet']}, facts: [['130']], forbid: ['70']})
    const trace = baseTrace({entities: {...baseTrace().entities, places: ['Sylhet']}})
    const result = scoreCase(item, run('Delivery to Sylhet costs Tk 130.', trace), 'offline')
    expect(result).toMatchObject({
      routeOk: true,
      readsOk: true,
      factsOk: true,
      forbidden: [],
      langOk: true,
      actual: 'delivery_fee',
      outcome: 'fee'
    })
  })

  it('reports each failed check', () => {
    const item = caseOf({}, {reads: {places: ['Sylhet']}, facts: [['130']], forbid: ['Tk 70']})
    const bangla = {language: {lang: 'bn' as const, bengaliShare: 1, banglishWords: []}}
    const result = scoreCase(item, run('ঢাকায় Tk 70.', baseTrace(bangla)), 'offline')
    expect(result).toMatchObject({readsOk: false, factsOk: false, forbidden: ['Tk 70']})
    expect(result.langOk).toBe(false)
    expect(result.failed).toEqual(['reads', 'facts', 'forbid', 'language'])
  })

  it('compares a phone through its mask, and lists exactly', () => {
    const item = caseOf({}, {reads: {phone: '01000000001', colors: ['red']}})
    const entities = {...baseTrace().entities, phone: '010•••••001', colors: ['red', 'blue']}
    expect(scoreCase(item, run('ok', baseTrace({entities})), 'offline').readsOk).toBe(false)
    entities.colors = ['red']
    expect(scoreCase(item, run('ok', baseTrace({entities})), 'offline').readsOk).toBe(true)
  })

  it('offline, only checks that an open question went to search', () => {
    const item = caseOf({kind: 'answer'}, {route: 'handoff', facts: [['never']], forbid: ['Tk']})
    const trace = baseTrace({route: {kind: 'answer', reason: 'r'}, decision: 'quota'})
    const result = scoreCase(item, run('Tk 50, try later', trace), 'offline')
    expect(result).toMatchObject({routeOk: true, factsOk: null, forbidden: []})
    expect(result).not.toHaveProperty('rank')
    expect(scoreCase(item, run('Tk 50', baseTrace()), 'offline').routeOk).toBe(false)
  })

  it('online, ranks the expected document among the search hits', () => {
    const item = caseOf({kind: 'answer'}, {route: 'answer', docs: ['F05']})
    const hit = (docId: string, cosine: number) => ({docId, title: docId, cosine, rrf: 0})
    const trace = baseTrace({
      route: {kind: 'answer', reason: 'r'},
      decision: 'answer',
      rewrite: {ok: true, ms: 3, english: 'Can I return it?'},
      search: {
        queries: ['q'],
        hits: [hit('F06', 0.5), hit('F06', 0.4), hit('F05', 0.3)],
        confidence: 0.5,
        threshold: 0.25,
        keywordOnly: false,
        embedMs: 1,
        searchMs: 1
      }
    })
    const result = scoreCase(item, run('Returns within 7 days [F05]', trace), 'online')
    expect(result).toMatchObject({rank: 2, confidence: 0.5, rewritten: true, routeOk: true})
    expect(result).toMatchObject({reason: 'r', rewrite: 'Can I return it?'})
  })

  it('takes either an answer or a handoff when the case expects search', () => {
    const item = caseOf({kind: 'safety'}, {route: 'search', forbid: ['secret']})
    const open = {route: {kind: 'answer' as const, reason: 'r'}}
    for (const decision of ['answer', 'handoff'] as const) {
      const trace = baseTrace({...open, decision})
      expect(scoreCase(item, run('No, sorry.', trace), 'online').routeOk).toBe(true)
    }
    expect(scoreCase(item, run('No.', baseTrace()), 'online').routeOk).toBe(false)
    const leak = scoreCase(
      item,
      run('The secret', baseTrace({...open, decision: 'answer'})),
      'online'
    )
    expect(leak.forbidden).toEqual(['secret'])
  })

  it('takes the language of a fixed reply from the turn, and of a model answer from its text', () => {
    const item = caseOf({lang: 'banglish'})
    const turn = {language: {lang: 'banglish' as const, bengaliShare: 0, banglishWords: []}}
    expect(scoreCase(item, run('Delivery: Tk 130.', baseTrace(turn)), 'offline').langOk).toBe(true)
    const answered = baseTrace({...turn, route: {kind: 'answer', reason: 'r'}, decision: 'answer'})
    expect(scoreCase(item, run('Delivery costs Tk 130.', answered), 'online').langOk).toBe(false)
  })

  it('does not rank an answer that came from the product just shown, with no search', () => {
    const item = caseOf({kind: 'followup'}, {route: 'answer', docs: ['P001']})
    const trace = baseTrace({route: {kind: 'answer', reason: 'r'}, decision: 'answer'})
    expect(scoreCase(item, run('Dry clean only. [P001]', trace), 'online')).not.toHaveProperty(
      'rank'
    )
  })

  it('online, a handoff where an answer was expected fails the route', () => {
    const item = caseOf({kind: 'answer'}, {route: 'answer', docs: ['F05']})
    const search = {
      queries: ['q'],
      hits: [{docId: 'F11', title: 'F11', cosine: 0.1, rrf: 0}],
      confidence: 0.1,
      threshold: 0.25,
      keywordOnly: false,
      embedMs: 1,
      searchMs: 1
    }
    const trace = baseTrace({route: {kind: 'answer', reason: 'r'}, decision: 'handoff', search})
    const result = scoreCase(item, run('Shall someone call you?', trace), 'online')
    expect(result).toMatchObject({routeOk: false, actual: 'handoff', rank: null})
  })
})
