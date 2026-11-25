import {readFile} from 'node:fs/promises'

import {z} from 'zod'

const Bilingual = z.object({en: z.string().min(1), bn: z.string().min(1)})

export const SourceDocSchema = z.object({
  id: z.string().regex(/^[PF]\d{2}$/, 'ids look like P01 for products and F01 for policies'),
  type: z.enum(['product', 'policy']),
  title: Bilingual,
  body: Bilingual,
  price: z.number().int().positive().optional(),
  tags: z.array(z.string()).default([])
})
export type SourceDoc = z.infer<typeof SourceDocSchema>

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

export const DATA_DIR = new URL('../../data/', import.meta.url)

async function readJson(file: URL): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8'))
}

export async function loadDocs(dir: URL = DATA_DIR): Promise<SourceDoc[]> {
  const files = ['catalog.json', 'policies.json']
  const lists = await Promise.all(files.map((file) => readJson(new URL(file, dir))))
  return lists.flatMap((list) => z.array(SourceDocSchema).parse(list))
}

export async function loadEvalSet(dir: URL = DATA_DIR): Promise<EvalItem[]> {
  return z.array(EvalItemSchema).parse(await readJson(new URL('eval.json', dir)))
}
