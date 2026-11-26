import {createHash} from 'node:crypto'
import {setServers} from 'node:dns'
import {isIP} from 'node:net'

import {z} from 'zod'

import type {BudgetConfig} from './limits/budget.js'
import type {RateLimits} from './limits/rateLimit.js'
import {OPENROUTER_URL} from './llm/openrouter.js'
import type {ProviderName} from './llm/types.js'

const Provider = z.enum(['ollama', 'openrouter'])

/**
 * Defaults per provider: one 12 GB GPU locally, and only free models on OpenRouter. A paid model
 * on an account with no credit pushes the balance below zero, which blocks the free models too.
 */
export const DEFAULT_MODELS: Record<
  ProviderName,
  {embed: string; chat: string; handoffThreshold: number}
> = {
  // Each embedding model spreads cosine similarity differently, so the threshold goes with it
  ollama: {embed: 'bge-m3', chat: 'gemma3:12b', handoffThreshold: 0.5},
  openrouter: {
    embed: 'nvidia/nemotron-3.5-embed-1b:free',
    chat: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    handoffThreshold: 0.25
  }
}

const EnvSchema = z
  .object({
    MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017'),
    MONGODB_DB: z.string().min(1).default('shohayok'),
    DNS_SERVERS: z.string().optional(),
    LLM_PROVIDER: Provider.default('ollama'),
    EMBED_PROVIDER: Provider.optional(),
    OLLAMA_URL: z.string().min(1).default('http://127.0.0.1:11434'),
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    OPENROUTER_URL: z.string().min(1).default(OPENROUTER_URL),
    EMBED_MODEL: z.string().min(1).optional(),
    CHAT_MODEL: z.string().min(1).optional(),
    REWRITE_MODEL: z.string().min(1).optional(),
    VECTOR_BACKEND: z.enum(['auto', 'atlas', 'local']).default('auto'),
    HANDOFF_THRESHOLD: z.coerce.number().min(-1).max(1).optional(),
    TOP_K: z.coerce.number().int().min(1).max(20).default(4),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    // OpenRouter's free models allow 50 requests a day; keep a few back for the owner
    DAILY_MODEL_BUDGET: z.coerce.number().int().min(0).default(45),
    VISITOR_DAILY_BUDGET: z.coerce.number().int().min(0).default(15),
    RATE_PER_MINUTE: z.coerce.number().int().min(1).default(8),
    RATE_PER_DAY: z.coerce.number().int().min(1).default(100),
    HASH_SECRET: z.string().min(1).optional()
  })
  .superRefine((env, ctx) => {
    for (const server of parseDnsServers(env.DNS_SERVERS)) {
      if (!isIP(server)) {
        ctx.addIssue({
          code: 'custom',
          path: ['DNS_SERVERS'],
          message: `${server} is not an IP address. Use a list like 8.8.8.8,1.1.1.1`
        })
      }
    }
    const usesOpenRouter = env.LLM_PROVIDER === 'openrouter' || env.EMBED_PROVIDER === 'openrouter'
    if (usesOpenRouter && !env.OPENROUTER_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['OPENROUTER_API_KEY'],
        message:
          'needed when LLM_PROVIDER or EMBED_PROVIDER is openrouter. Create a key on openrouter.ai.'
      })
    }
  })

export interface Config {
  /** Counts model requests against the free daily allowance when OpenRouter is in use */
  budget: BudgetConfig
  /** Messages per visitor */
  rate: RateLimits
  /** Key for hashing visitors' addresses */
  hashSecret: string
  mongoUri: string
  mongoDb: string
  /**
   * DNS servers for Node's own resolver, which `mongodb+srv` strings use for their SRV lookup.
   * Empty keeps the system's. Set it when that lookup fails with `querySrv ECONNREFUSED`.
   */
  dnsServers: string[]
  /** Who writes answers and Banglish rewrites */
  chatProvider: ProviderName
  /** Who embeds; defaults to the chat provider */
  embedProvider: ProviderName
  ollamaUrl: string
  openRouterKey: string | undefined
  openRouterUrl: string
  embedModel: string
  chatModel: string
  rewriteModel: string
  vectorBackend: 'auto' | 'atlas' | 'local'
  handoffThreshold: number
  topK: number
  port: number
}

export function parseDnsServers(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean)
}

/** Loads `.env`, reads the settings, and applies the one that changes the whole process: DNS */
export function setup(): Config {
  loadEnvFile()
  const config = loadConfig()
  if (config.dnsServers.length > 0) setServers(config.dnsServers)
  return config
}

/** Loads `.env` when there is one. Variables already set in the environment win. */
export function loadEnvFile(path = '.env'): void {
  try {
    process.loadEnvFile(path)
  } catch {
    // no .env file: defaults and the real environment apply
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // An empty value in .env means "use the default"
  const set = Object.fromEntries(Object.entries(env).filter(([, value]) => value))
  const parsed = EnvSchema.parse(set)
  const chatProvider = parsed.LLM_PROVIDER
  const embedProvider = parsed.EMBED_PROVIDER ?? chatProvider
  const chatModel = parsed.CHAT_MODEL ?? DEFAULT_MODELS[chatProvider].chat
  return {
    mongoUri: parsed.MONGODB_URI,
    mongoDb: parsed.MONGODB_DB,
    dnsServers: parseDnsServers(parsed.DNS_SERVERS),
    chatProvider,
    embedProvider,
    ollamaUrl: parsed.OLLAMA_URL,
    openRouterKey: parsed.OPENROUTER_API_KEY,
    openRouterUrl: parsed.OPENROUTER_URL,
    embedModel: parsed.EMBED_MODEL ?? DEFAULT_MODELS[embedProvider].embed,
    chatModel,
    rewriteModel: parsed.REWRITE_MODEL ?? chatModel,
    vectorBackend: parsed.VECTOR_BACKEND,
    handoffThreshold: parsed.HANDOFF_THRESHOLD ?? DEFAULT_MODELS[embedProvider].handoffThreshold,
    topK: parsed.TOP_K,
    port: parsed.PORT,
    budget: {
      enabled: chatProvider === 'openrouter' || embedProvider === 'openrouter',
      dailyLimit: parsed.DAILY_MODEL_BUDGET,
      visitorLimit: parsed.VISITOR_DAILY_BUDGET
    },
    rate: {perMinute: parsed.RATE_PER_MINUTE, perDay: parsed.RATE_PER_DAY},
    // Without a set secret, one derived from the connection string: secret, and stable
    hashSecret:
      parsed.HASH_SECRET ?? createHash('sha256').update(parsed.MONGODB_URI).digest('base64url')
  }
}
