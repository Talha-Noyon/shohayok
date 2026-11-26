import {readFile} from 'node:fs/promises'

import {z} from 'zod'

import {DATA_DIR} from '../shop/schema.js'

/**
 * Where a message should end up: one of the tools, the model's answer, or a callback offer.
 * "search" takes either of the last two: for a trick question, any reply that leaks nothing.
 */
export const ROUTES = [
  'smalltalk',
  'clarify',
  'order_status',
  'delivery_fee',
  'check_stock',
  'product_info',
  'list_products',
  'request_callback',
  'answer',
  'handoff',
  'search'
] as const
export type RouteName = (typeof ROUTES)[number]

/** Routes that search and the model decide. Without a model, only "it went to search" is known. */
export const SEARCH_ROUTES: readonly RouteName[] = ['answer', 'handoff', 'search']

export const KINDS = ['tool', 'answer', 'handoff', 'followup', 'safety'] as const

/** What the rules should read in the message. Lists must match exactly; places are English names. */
const ReadsSchema = z
  .object({
    orderId: z.string(),
    phone: z.string(),
    places: z.array(z.string()),
    colors: z.array(z.string()),
    categories: z.array(z.string()),
    styles: z.array(z.string()),
    collections: z.array(z.string()),
    sizes: z.array(z.string()),
    minPrice: z.number(),
    maxPrice: z.number()
  })
  .partial()
  .strict()
export type Reads = z.infer<typeof ReadsSchema>

export const EvalCaseSchema = z
  .object({
    id: z.string().regex(/^[a-z]+-\d{2}$/),
    lang: z.enum(['bn', 'banglish', 'en']),
    kind: z.enum(KINDS),
    /** Earlier customer messages, sent first in the same conversation */
    history: z.array(z.string().min(1)).default([]),
    question: z.string().min(1).max(500),
    expect: z
      .object({
        route: z.enum(ROUTES),
        /** The tool's outcome, such as "need_phone" */
        outcome: z.string().optional(),
        reads: ReadsSchema.optional(),
        /** Any of these documents counts as a correct search */
        docs: z.array(z.string()).default([]),
        /** Every group must appear in the reply; any spelling inside a group counts */
        facts: z.array(z.array(z.string().min(1)).min(1)).default([]),
        /** None of these may appear in the reply */
        forbid: z.array(z.string().min(1)).default([])
      })
      .strict()
  })
  .strict()
export type EvalCase = z.infer<typeof EvalCaseSchema>

export function parseEvalSet(value: unknown): EvalCase[] {
  const cases = z.array(EvalCaseSchema).parse(value)
  const seen = new Set<string>()
  for (const item of cases) {
    if (seen.has(item.id)) throw new Error(`Duplicate eval case id ${item.id}`)
    seen.add(item.id)
  }
  return cases
}

export async function loadEvalSet(dir: URL = DATA_DIR): Promise<EvalCase[]> {
  return parseEvalSet(JSON.parse(await readFile(new URL('eval.json', dir), 'utf8')))
}
