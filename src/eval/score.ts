import {detectLanguage, type Lang} from '../lang/detect.js'
import {normalizeForMatch} from '../lang/digits.js'
import type {Trace} from '../shared/api.js'
import {maskPhone} from '../shop/format.js'
import {SEARCH_ROUTES, type EvalCase, type Reads, type RouteName} from './cases.js'
import {factsFound, firstRelevantRank} from './metrics.js'

/** Offline runs no model: open questions stop at "it went to search" */
export type Mode = 'offline' | 'online'

/** What a case's conversation produced: the last reply, its trace, and the requests it cost */
export interface CaseRun {
  answer: string
  trace: Trace
  /** Model requests across the whole conversation, earlier messages included */
  requests: {embed: number; chat: number}
  /** A turn found the day's free requests spent */
  quota: boolean
}

export type Check = 'route' | 'reads' | 'facts' | 'forbid' | 'language'

export interface CaseResult {
  id: string
  lang: Lang
  kind: EvalCase['kind']
  mode: Mode
  expected: RouteName
  actual: RouteName
  decision: Trace['decision']
  outcome?: string
  routeOk: boolean
  /** null when the case names nothing to read */
  readsOk: boolean | null
  /** null when not checked: no facts listed, or offline for an open question */
  factsOk: boolean | null
  /** The forbidden strings the reply contained */
  forbidden: string[]
  langOk: boolean
  replyLang: Lang
  /** Rank of the first expected document; null if missing; undefined when not checked */
  rank?: number | null
  /** The best cosine of the last search, or null when none ran */
  confidence: number | null
  rewritten: boolean
  /** Model requests of the last message alone */
  requests: {embed: number; chat: number}
  conversationRequests: {embed: number; chat: number}
  totalMs: number
  firstTokenMs: number | null
  failed: Check[]
  answer: string
  at: string
}

/** Where the message ended up, in the eval's route names */
export function actualRoute(trace: Trace): RouteName {
  if (trace.route.kind === 'answer') return trace.decision === 'handoff' ? 'handoff' : 'answer'
  return (trace.route.tool ?? 'answer') as RouteName
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().every((value, i) => value === [...b].sort()[i])

function readsMatch(expected: Reads, trace: Trace): boolean {
  const read = trace.entities
  return Object.entries(expected).every(([key, value]) => {
    if (key === 'phone') return read.phone === maskPhone(String(value))
    const actual = read[key as keyof typeof read]
    if (Array.isArray(value)) return Array.isArray(actual) && sameList(value, actual as string[])
    return actual === value
  })
}

/** Scores one case. Pure: the same run always gets the same result. */
export function scoreCase(
  item: EvalCase,
  run: CaseRun,
  mode: Mode,
  at: Date = new Date()
): CaseResult {
  const {trace, answer} = run
  const {expect} = item
  const actual = actualRoute(trace)
  const searchDecides = SEARCH_ROUTES.includes(expect.route)
  // Without a model, the rules can only be held to sending an open question to search
  const checked = mode === 'online' || !searchDecides
  const routeOk = !checked
    ? trace.route.kind === 'answer'
    : expect.route === 'search'
      ? actual === 'answer' || actual === 'handoff'
      : actual === expect.route

  const normalized = normalizeForMatch(answer)
  const readsOk = expect.reads ? readsMatch(expect.reads, trace) : null
  const factsOk = checked && expect.facts.length > 0 ? factsFound(answer, expect.facts) : null
  const forbidden = checked
    ? expect.forbid.filter((text) => normalized.includes(normalizeForMatch(text)))
    : []
  // A fixed reply is written in the turn's language; a model answer has to be read
  const modelWrote = trace.decision === 'answer' || trace.decision === 'cached'
  const replyLang = modelWrote ? detectLanguage(answer) : trace.language.lang
  const langOk = replyLang === item.lang

  let rank: number | null | undefined
  if (checked && searchDecides && expect.docs.length > 0) {
    const ranked = [...new Set((trace.search?.hits ?? []).map((hit) => hit.docId))]
    rank = firstRelevantRank(ranked, expect.docs)
  }

  const failed: Check[] = []
  if (!routeOk) failed.push('route')
  if (readsOk === false) failed.push('reads')
  if (factsOk === false) failed.push('facts')
  if (forbidden.length > 0) failed.push('forbid')
  if (!langOk) failed.push('language')

  return {
    id: item.id,
    lang: item.lang,
    kind: item.kind,
    mode,
    expected: expect.route,
    actual,
    decision: trace.decision,
    ...(trace.tool?.outcome && {outcome: trace.tool.outcome}),
    routeOk,
    readsOk,
    factsOk,
    forbidden,
    langOk,
    replyLang,
    ...(rank !== undefined && {rank}),
    confidence: trace.search?.confidence ?? null,
    rewritten: trace.rewrite !== undefined,
    requests: trace.modelRequests,
    conversationRequests: run.requests,
    totalMs: trace.totalMs,
    firstTokenMs: trace.answer?.firstTokenMs ?? null,
    failed,
    answer,
    at: at.toISOString()
  }
}
