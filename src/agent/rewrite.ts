import type {ChatMessage} from '../llm/types.js'
import {HISTORY_TURNS, type HistoryTurn} from './prompt.js'

export interface Rewrite {
  bangla: string
  english: string
}

/** Structured outputs hold the model to this shape, where the provider supports them */
export const REWRITE_SCHEMA = {
  type: 'object',
  properties: {bangla: {type: 'string'}, english: {type: 'string'}},
  required: ['bangla', 'english'],
  additionalProperties: false
}

const transcript = (history: HistoryTurn[]) =>
  history
    .slice(-HISTORY_TURNS)
    .map((turn) => `${turn.role === 'customer' ? 'Customer' : 'Shohayok'}: ${turn.text}`)
    .join('\n')

const ask = (question: string, history: HistoryTurn[]) =>
  history.length > 0
    ? `Conversation so far:\n${transcript(history)}\n\nLast message: ${question}`
    : `Last message: ${question}`

const EXAMPLES: [string, HistoryTurn[], Rewrite][] = [
  [
    'delivery charge koto?',
    [],
    {bangla: 'ডেলিভারি চার্জ কত?', english: 'How much is the delivery charge?'}
  ],
  [
    'oitar ki XL ache?',
    [
      {role: 'customer', text: 'kodom silk panjabi dekhan'},
      {role: 'bot', text: 'Kodom Silk Panjabi er dam 5,900 taka. [P241]'}
    ],
    {
      bangla: 'কদম সিল্ক পাঞ্জাবি কি XL সাইজে আছে?',
      english: 'Is the Kodom Silk Panjabi available in size XL?'
    }
  ]
]

/**
 * Rewrites the last message as one standalone question, in Bengali script and in English. The
 * conversation resolves "it" and "the second one", and Banglish becomes searchable text.
 */
export function rewriteMessages(question: string, history: HistoryTurn[]): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        "Rewrite the customer's last message as one standalone question that makes sense " +
        'without the conversation, once in Bengali script and once in English. Use the ' +
        'conversation to resolve words like "it", "oita" or "the second one". Keep product names, ' +
        'sizes, numbers and order numbers as they are. Answer with JSON only.'
    },
    ...EXAMPLES.flatMap(([example, exampleHistory, rewrite]): ChatMessage[] => [
      {role: 'user', content: ask(example, exampleHistory)},
      {role: 'assistant', content: JSON.stringify(rewrite)}
    ]),
    {role: 'user', content: ask(question, history)}
  ]
}

export function parseRewrite(value: unknown): Rewrite | null {
  if (typeof value !== 'object' || value === null) return null
  const {bangla, english} = value as Record<string, unknown>
  if (typeof bangla !== 'string' || typeof english !== 'string') return null
  if (!bangla.trim() || !english.trim()) return null
  return {bangla: bangla.trim(), english: english.trim()}
}

export type ChatJson = (model: string, messages: ChatMessage[], schema: object) => Promise<unknown>

/** Never throws: a failed rewrite only means the search runs on the customer's own words */
export async function rewriteQuestion(
  chatJson: ChatJson,
  model: string,
  question: string,
  history: HistoryTurn[],
  onError: (error: unknown) => void = () => undefined
): Promise<Rewrite | null> {
  try {
    const rewrite = parseRewrite(
      await chatJson(model, rewriteMessages(question, history), REWRITE_SCHEMA)
    )
    if (!rewrite) onError(new Error('The rewrite came back without both fields'))
    return rewrite
  } catch (error) {
    onError(error)
    return null
  }
}
