import type {ChatMessage} from '../llm/types.js'

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

const EXAMPLES: [string, Rewrite][] = [
  [
    'delivery charge koto?',
    {bangla: 'ডেলিভারি চার্জ কত?', english: 'How much is the delivery charge?'}
  ],
  [
    'lal sharee ache? size L lagbe',
    {bangla: 'লাল শাড়ি আছে? সাইজ L লাগবে', english: 'Do you have a red saree? I need size L.'}
  ]
]

export function rewriteMessages(question: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'The customer wrote in Banglish: Bengali written in English letters. Rewrite the message ' +
        'in Bengali script, and translate it into English. Keep product names, sizes, numbers ' +
        'and brand names as they are. Answer with JSON only.'
    },
    ...EXAMPLES.flatMap(([banglish, rewrite]): ChatMessage[] => [
      {role: 'user', content: banglish},
      {role: 'assistant', content: JSON.stringify(rewrite)}
    ]),
    {role: 'user', content: question}
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

/**
 * Rewrites a Banglish question into Bangla script and English. Never throws: a failed rewrite
 * only means the search runs on the customer's own words.
 */
export async function rewriteBanglish(
  chatJson: ChatJson,
  model: string,
  question: string,
  onError: (error: unknown) => void = () => undefined
): Promise<Rewrite | null> {
  try {
    const rewrite = parseRewrite(await chatJson(model, rewriteMessages(question), REWRITE_SCHEMA))
    if (!rewrite) onError(new Error('The rewrite came back without both fields'))
    return rewrite
  } catch (error) {
    onError(error)
    return null
  }
}
