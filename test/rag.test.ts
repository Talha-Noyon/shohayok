import {describe, expect, it, vi} from 'vitest'

import {detectLanguage} from '../src/lang/detect.js'
import type {ChatMessage} from '../src/llm/types.js'
import type {FusedHit} from '../src/retrieval/fusion.js'
import {HANDOFF_MESSAGES, shouldHandoff} from '../src/rag/handoff.js'
import {answerQuestion, type AnswerEvent, type PipelineDeps} from '../src/rag/pipeline.js'
import {buildAnswerMessages, LANGUAGE_INSTRUCTIONS} from '../src/rag/prompt.js'
import {parseRewrite, rewriteBanglish, rewriteMessages} from '../src/rag/rewrite.js'

const fused = (docId: string, cosine: number): FusedHit => ({
  chunkId: `${docId}#0`,
  docId,
  title: `Title of ${docId}`,
  text: `Text of ${docId}`,
  textEn: `Text of ${docId}`,
  textBn: `Text of ${docId}`,
  rrf: 0.03,
  cosine
})

function deps(overrides: Partial<PipelineDeps> = {}) {
  const generated: ChatMessage[][] = []
  const base: PipelineDeps = {
    retrieve: vi.fn(async () => ({
      hits: [fused('F01', 0.82), fused('F01', 0.6), fused('P01', 0.55)],
      confidence: 0.82,
      embedMs: 12,
      searchMs: 4
    })),
    rewrite: vi.fn(async () => ({bangla: 'ডেলিভারি চার্জ কত?', english: 'How much is delivery?'})),
    generate: async function* (messages) {
      generated.push(messages)
      yield 'Delivery costs '
      yield 'Tk 70. [F01]'
    },
    topK: 4,
    handoffThreshold: 0.5,
    ...overrides
  }
  return {deps: base, generated}
}

async function collect(stream: AsyncIterable<AnswerEvent>) {
  const events: AnswerEvent[] = []
  for await (const event of stream) events.push(event)
  return events
}

describe('answerQuestion', () => {
  it('answers an English question from the retrieved context', async () => {
    const {deps: d, generated} = deps()
    const events = await collect(answerQuestion('How much is delivery inside Dhaka?', d))

    expect(events[0]).toMatchObject({
      type: 'meta',
      lang: 'en',
      rewrite: null,
      handoff: false,
      sources: [
        {docId: 'F01', title: 'Title of F01'},
        {docId: 'P01', title: 'Title of P01'}
      ]
    })
    expect(events.filter((e) => e.type === 'token').map((e) => e.text)).toEqual([
      'Delivery costs ',
      'Tk 70. [F01]'
    ])
    const done = events.at(-1)
    expect(done?.type === 'done' && done.answer).toBe('Delivery costs Tk 70. [F01]')
    expect(done?.type === 'done' && done.timings.firstTokenMs).toBeGreaterThanOrEqual(0)
    expect(d.rewrite).not.toHaveBeenCalled()
    expect(generated[0]?.[0]?.content).toContain(LANGUAGE_INSTRUCTIONS.en)
  })

  it('searches with the Banglish words and both rewrites', async () => {
    const {deps: d} = deps()
    const events = await collect(answerQuestion('delivery charge koto?', d))

    expect(d.rewrite).toHaveBeenCalledWith('delivery charge koto?')
    expect(d.retrieve).toHaveBeenCalledWith(
      ['delivery charge koto?', 'ডেলিভারি চার্জ কত?', 'How much is delivery?'],
      4
    )
    expect(events[0]).toMatchObject({type: 'meta', lang: 'banglish'})
  })

  it('can skip the rewrite, for the eval comparison', async () => {
    const {deps: d} = deps({useRewrite: false})
    await collect(answerQuestion('delivery charge koto?', d))
    expect(d.rewrite).not.toHaveBeenCalled()
    expect(d.retrieve).toHaveBeenCalledWith(['delivery charge koto?'], 4)
  })

  it('hands off in the customer language without calling the model', async () => {
    const generate = vi.fn()
    const {deps: d} = deps({
      generate,
      retrieve: async () => ({hits: [fused('P09', 0.2)], confidence: 0.2, embedMs: 1, searchMs: 1})
    })
    const events = await collect(answerQuestion('আপনারা কি ল্যাপটপ বিক্রি করেন?', d))

    expect(events[0]).toMatchObject({type: 'meta', lang: 'bn', handoff: true, sources: []})
    expect(events.at(-1)).toMatchObject({type: 'done', answer: HANDOFF_MESSAGES.bn})
    expect(generate).not.toHaveBeenCalled()
  })
})

describe('handoff', () => {
  it('hands off below the threshold and when nothing was found', () => {
    expect(shouldHandoff(0.49, 0.5)).toBe(true)
    expect(shouldHandoff(0.5, 0.5)).toBe(false)
    expect(shouldHandoff(null, 0.5)).toBe(true)
  })

  it('writes each handoff message in the language it is for', () => {
    for (const [lang, message] of Object.entries(HANDOFF_MESSAGES)) {
      expect(detectLanguage(message)).toBe(lang)
    }
  })
})

describe('buildAnswerMessages', () => {
  it('labels every context entry with its document id and sets the reply language', () => {
    const [system, user] = buildAnswerMessages('tangail sharee er dam koto?', 'banglish', [
      {docId: 'P01', text: 'Tangail cotton saree, Tk 1450'}
    ])
    expect(system?.content).toContain('[P01] Tangail cotton saree, Tk 1450')
    expect(system?.content).toContain(LANGUAGE_INSTRUCTIONS.banglish)
    expect(user).toEqual({role: 'user', content: 'tangail sharee er dam koto?'})
  })
})

describe('rewrite', () => {
  it('ends the prompt with the question, after worked examples', () => {
    const messages = rewriteMessages('kurti er dam koto?')
    expect(messages.at(-1)).toEqual({role: 'user', content: 'kurti er dam koto?'})
    expect(messages.filter((m) => m.role === 'assistant').length).toBeGreaterThan(0)
  })

  it('accepts only both fields, trimmed', () => {
    expect(parseRewrite({bangla: ' কুর্তির দাম কত? ', english: 'Kurti price?'})).toEqual({
      bangla: 'কুর্তির দাম কত?',
      english: 'Kurti price?'
    })
    expect(parseRewrite({bangla: 'কুর্তির দাম কত?'})).toBeNull()
    expect(parseRewrite('not json')).toBeNull()
  })

  it('falls back to no rewrite when the model fails, and reports why', async () => {
    const errors: unknown[] = []
    const failing = async () => {
      throw new Error('model not found')
    }
    expect(await rewriteBanglish(failing, 'm', 'dam koto?', (e) => errors.push(e))).toBeNull()
    expect(errors).toHaveLength(1)
  })
})
