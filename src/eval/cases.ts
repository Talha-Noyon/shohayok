import {readFile} from 'node:fs/promises'

import {z} from 'zod'

import {DATA_DIR} from '../shop/schema.js'

export const EvalItemSchema = z.object({
  id: z.string(),
  lang: z.enum(['bn', 'banglish', 'en']),
  question: z.string().min(1),
  answerable: z.boolean(),
  /** Any of these documents counts as a correct retrieval */
  expectDocs: z.array(z.string()).default([]),
  /** Every group must appear in the answer; any spelling inside a group counts */
  expectFacts: z.array(z.array(z.string()).min(1)).default([])
})
export type EvalItem = z.infer<typeof EvalItemSchema>

export async function loadEvalSet(dir: URL = DATA_DIR): Promise<EvalItem[]> {
  const text = await readFile(new URL('eval.json', dir), 'utf8')
  return z.array(EvalItemSchema).parse(JSON.parse(text))
}
