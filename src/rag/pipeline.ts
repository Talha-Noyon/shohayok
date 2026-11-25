import {detectLanguage, type Lang} from '../lang/detect.js'
import type {ChatMessage} from '../llm/types.js'
import type {FusedHit} from '../retrieval/fusion.js'
import type {Retrieval} from '../retrieval/retriever.js'
import {msSince} from '../util/time.js'
import {HANDOFF_MESSAGES, shouldHandoff} from './handoff.js'
import {buildAnswerMessages} from './prompt.js'
import type {Rewrite} from './rewrite.js'

export interface Source {
  docId: string
  title: string
}

export interface Timings {
  rewriteMs: number
  embedMs: number
  searchMs: number
  /** From the question arriving to the first word of the answer */
  firstTokenMs: number | null
  totalMs: number
}

export type AnswerEvent =
  | {
      type: 'meta'
      lang: Lang
      rewrite: Rewrite | null
      handoff: boolean
      confidence: number | null
      sources: Source[]
    }
  | {type: 'token'; text: string}
  | {type: 'done'; answer: string; timings: Timings}

export interface PipelineDeps {
  retrieve(queries: string[], topK: number): Promise<Retrieval>
  rewrite(question: string): Promise<Rewrite | null>
  generate(messages: ChatMessage[], signal?: AbortSignal): AsyncIterable<string>
  topK: number
  handoffThreshold: number
  /** Turned off only by the eval, to measure what the rewrite adds */
  useRewrite?: boolean
}

/** Everything decided before the answer is written */
export interface Prepared {
  question: string
  lang: Lang
  rewrite: Rewrite | null
  hits: FusedHit[]
  confidence: number | null
  handoff: boolean
  startedAt: number
  rewriteMs: number
  embedMs: number
  searchMs: number
}

/** Detect, rewrite Banglish, retrieve, and decide whether to hand off */
export async function prepareAnswer(question: string, deps: PipelineDeps): Promise<Prepared> {
  const startedAt = performance.now()
  const lang = detectLanguage(question)

  let rewrite: Rewrite | null = null
  let rewriteMs = 0
  if (lang === 'banglish' && deps.useRewrite !== false) {
    const rewriteStart = performance.now()
    rewrite = await deps.rewrite(question)
    rewriteMs = msSince(rewriteStart)
  }

  const queries = rewrite ? [question, rewrite.bangla, rewrite.english] : [question]
  const {hits, confidence, embedMs, searchMs} = await deps.retrieve(queries, deps.topK)
  return {
    question,
    lang,
    rewrite,
    hits,
    confidence,
    handoff: shouldHandoff(confidence, deps.handoffThreshold),
    startedAt,
    rewriteMs,
    embedMs,
    searchMs
  }
}

export function sourcesOf(hits: FusedHit[]): Source[] {
  const seen = new Map<string, Source>()
  for (const hit of hits) {
    if (!seen.has(hit.docId)) seen.set(hit.docId, {docId: hit.docId, title: hit.title})
  }
  return [...seen.values()]
}

/** Streams the answer: first what was found, then the words, then the timings */
export async function* streamAnswer(
  prepared: Prepared,
  deps: Pick<PipelineDeps, 'generate'>,
  signal?: AbortSignal
): AsyncGenerator<AnswerEvent> {
  const {question, lang, rewrite, handoff, confidence, hits} = prepared
  yield {
    type: 'meta',
    lang,
    rewrite,
    handoff,
    confidence,
    sources: handoff ? [] : sourcesOf(hits)
  }

  let answer = ''
  let firstTokenMs: number | null = null
  if (handoff) {
    answer = HANDOFF_MESSAGES[lang]
    firstTokenMs = msSince(prepared.startedAt)
    yield {type: 'token', text: answer}
  } else {
    for await (const text of deps.generate(buildAnswerMessages(question, lang, hits), signal)) {
      firstTokenMs ??= msSince(prepared.startedAt)
      answer += text
      yield {type: 'token', text}
    }
  }

  yield {
    type: 'done',
    answer,
    timings: {
      rewriteMs: prepared.rewriteMs,
      embedMs: prepared.embedMs,
      searchMs: prepared.searchMs,
      firstTokenMs,
      totalMs: msSince(prepared.startedAt)
    }
  }
}

export async function* answerQuestion(
  question: string,
  deps: PipelineDeps,
  signal?: AbortSignal
): AsyncGenerator<AnswerEvent> {
  yield* streamAnswer(await prepareAnswer(question, deps), deps, signal)
}
