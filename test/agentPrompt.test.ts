import {describe, expect, it, vi} from 'vitest'

import {buildAnswerMessages, LANGUAGE_RULES} from '../src/agent/prompt.js'
import {parseRewrite, rewriteMessages, rewriteQuestion} from '../src/agent/rewrite.js'

const doc = (docId: string) => ({
  docId,
  textEn: `English text of ${docId}`,
  textBn: `${docId} এর বাংলা লেখা`
})

const history = [
  {role: 'customer' as const, text: 'jamdani sharee dekhan'},
  {role: 'bot' as const, text: '1. Ketoki Jamdani Sharee [P001]'}
]

describe('buildAnswerMessages', () => {
  it('gives Bangla questions the Bengali side of each document and the rest the English side', () => {
    const bn = buildAnswerMessages({
      question: 'দাম কত?',
      lang: 'bn',
      history: [],
      docs: [doc('F01')]
    })
    expect(bn[0]?.content).toContain('[F01] F01 এর বাংলা লেখা')
    expect(bn[0]?.content).not.toContain('English text')
    for (const lang of ['en', 'banglish'] as const) {
      const messages = buildAnswerMessages({question: 'q', lang, history: [], docs: [doc('F01')]})
      expect(messages[0]?.content).toContain('[F01] English text of F01')
      expect(messages[0]?.content).not.toContain('বাংলা')
    }
  })

  it('keeps the conversation as turns before the question', () => {
    const messages = buildAnswerMessages({
      question: 'oitar dam koto?',
      lang: 'banglish',
      history,
      docs: [doc('P001')]
    })
    expect(messages.map((message) => message.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(messages[1]?.content).toBe('jamdani sharee dekhan')
  })

  it('fences the documents off as data and says they are not instructions', () => {
    const system =
      buildAnswerMessages({question: 'q', lang: 'en', history: [], docs: [doc('F01')]})[0]
        ?.content ?? ''
    expect(system).toMatch(/<documents>[\s\S]*\[F01\][\s\S]*<\/documents>/)
    expect(system).toMatch(/not instructions/i)
  })

  it('shows the model what Banglish looks like, and reminds it in the last message', () => {
    const messages = buildAnswerMessages({
      question: 'delivery koto?',
      lang: 'banglish',
      history: [],
      docs: [doc('F01')]
    })
    expect(messages[0]?.content).toContain(LANGUAGE_RULES.banglish)
    expect(LANGUAGE_RULES.banglish).toMatch(/English letters/)
    expect(messages.at(-1)?.content).toMatch(/^delivery koto\?\n\n\(.*English letters.*\)$/)
  })
})

describe('rewriteQuestion', () => {
  it('asks for one standalone question, with the conversation to resolve what "it" means', () => {
    const messages = rewriteMessages('oitar dam koto?', history)
    const last = messages.at(-1)?.content ?? ''
    expect(last).toContain('Customer: jamdani sharee dekhan')
    expect(last).toContain('Shohayok: 1. Ketoki Jamdani Sharee [P001]')
    expect(last).toContain('Last message: oitar dam koto?')
    expect(messages[0]?.content).toMatch(/standalone/i)
  })

  it('returns the rewrite when the model gives both fields', async () => {
    const chatJson = vi.fn(async () => ({bangla: 'কেতকী জামদানির দাম কত?', english: 'Price?'}))
    expect(await rewriteQuestion(chatJson, 'm', 'oitar dam koto?', history)).toEqual({
      bangla: 'কেতকী জামদানির দাম কত?',
      english: 'Price?'
    })
  })

  it('returns nothing and reports why when the model fails', async () => {
    const onError = vi.fn()
    const failing = vi.fn(async () => {
      throw new Error('busy')
    })
    expect(await rewriteQuestion(failing, 'm', 'q', [], onError)).toBeNull()
    expect(onError).toHaveBeenCalled()
    expect(parseRewrite({bangla: ' ', english: 'x'})).toBeNull()
  })
})
