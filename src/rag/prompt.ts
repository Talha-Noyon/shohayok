import type {Lang} from '../lang/detect.js'
import type {ChatMessage} from '../llm/types.js'

export const SHOP = 'Nodi, a fictional online clothing shop in Bangladesh'

/** Small models follow an explicit language instruction better than "reply in my language" */
export const LANGUAGE_INSTRUCTIONS: Record<Lang, string> = {
  bn: 'Reply in Bangla, written in Bengali script.',
  banglish:
    'Reply in Banglish: the Bengali language written in English letters, the way the customer ' +
    'wrote. Do not reply in English.',
  en: 'Reply in English.'
}

export interface ContextEntry {
  docId: string
  text: string
}

export function buildAnswerMessages(
  question: string,
  lang: Lang,
  context: ContextEntry[]
): ChatMessage[] {
  const system = [
    `You are Shohayok, the customer support assistant of ${SHOP}.`,
    'Answer using only the context below.',
    '- If the context does not answer the question, say you are not sure and offer to connect ' +
      'the customer with a human agent. Never invent prices, dates or policies.',
    '- Keep it short: at most three sentences.',
    '- Write prices in Taka.',
    '- End with the ids of the context entries you used, in square brackets, like [F01].',
    `- ${LANGUAGE_INSTRUCTIONS[lang]}`,
    '',
    'Context:',
    context.map((entry) => `[${entry.docId}] ${entry.text}`).join('\n\n')
  ].join('\n')
  return [
    {role: 'system', content: system},
    {role: 'user', content: question}
  ]
}
