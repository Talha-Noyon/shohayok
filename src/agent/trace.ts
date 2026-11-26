import type {Lang, LanguageEvidence} from '../lang/detect.js'
import type {Quota} from '../limits/budget.js'
import type {Entities} from '../nlu/entities.js'
import type {Intent} from '../nlu/intents.js'
import {maskPhone} from '../shop/format.js'

export interface SearchTrace {
  /** The phrasings searched: the message, and the rewrite's two when there was one */
  queries: string[]
  hits: {docId: string; title: string; cosine: number | null; rrf: number}[]
  /** The best cosine similarity, compared against the threshold */
  confidence: number | null
  threshold: number
  /** True when today's quota was spent and only keyword search ran */
  keywordOnly: boolean
  embedMs: number
  searchMs: number
}

/**
 * Everything decided while answering one message, kept with the reply. It is what the inspector
 * shows, and it holds no phone number in full.
 */
export interface Trace {
  language: LanguageEvidence
  entities: Omit<Entities, 'places' | 'phone'> & {places: string[]; phone?: string}
  intents: Intent[]
  route: {kind: 'tool' | 'answer'; tool?: string; reason: string}
  /** What finally produced the reply */
  decision: 'tool' | 'answer' | 'cached' | 'handoff' | 'quota'
  tool?: {name: string; outcome?: string; ms: number}
  rewrite?: {bangla?: string; english?: string; ok: boolean; ms: number; model?: string}
  search?: SearchTrace
  answer?: {model?: string; firstTokenMs: number | null; replyLang: Lang}
  modelRequests: {embed: number; chat: number}
  quota?: Quota
  totalMs: number
}

export function traceEntities(entities: Entities): Trace['entities'] {
  const {places, phone, ...rest} = entities
  return {
    ...rest,
    places: places.map((place) => place.key),
    ...(phone && {phone: maskPhone(phone)})
  }
}
