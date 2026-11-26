/**
 * The shapes the API sends, shared by the server and the page. Types only: nothing here runs,
 * so the page can import it without pulling server code into the browser.
 */

export type Lang = 'bn' | 'banglish' | 'en'

export interface LanguageEvidence {
  lang: Lang
  /** Share of letters in Bengali script, from 0 to 1 */
  bengaliShare: number
  /** The Banglish words found, in order */
  banglishWords: string[]
}

export interface Quota {
  /** False for local models: nothing is counted */
  enabled: boolean
  used: number
  limit: number
  visitorUsed: number
  visitorLimit: number
  /** When the free models' daily allowance starts again: midnight UTC */
  resetsAt: string
}

export interface Source {
  docId: string
  /** "English / বাংলা" */
  title: string
}

/** What the rules read in the message. Places are keys, and the phone is masked. */
export interface TraceEntities {
  orderId?: string
  phone?: string
  places: string[]
  colors: string[]
  categories: string[]
  styles: string[]
  collections: string[]
  sizes: string[]
  minPrice?: number
  maxPrice?: number
  reference: boolean
  ordinal?: number
}

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
  entities: TraceEntities
  intents: string[]
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

export type TurnEvent =
  | {type: 'meta'; conversationId: string; lang: Lang; route: Trace['route']; sources: Source[]}
  | {type: 'token'; text: string}
  | {type: 'done'; answer: string; trace: Trace}

export type StreamEvent = TurnEvent | {type: 'error'; message: string}

export interface MessageView {
  role: 'customer' | 'bot'
  text: string
  at: string
  trace?: Trace
}

/** GET /api/conversations/:id */
export interface ConversationView {
  id: string
  messages: MessageView[]
}
