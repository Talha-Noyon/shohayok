import type {Config} from '../config.js'
import {OllamaClient} from './ollama.js'
import {OpenRouterClient} from './openrouter.js'
import type {LlmProvider, ProviderName} from './types.js'

export const PROVIDER_LABEL: Record<ProviderName, string> = {
  ollama: 'Ollama',
  openrouter: 'OpenRouter'
}

/** Ollama lists `bge-m3` as `bge-m3:latest` */
export function hasModel(available: string[], model: string): boolean {
  return available.some((name) => name === model || name === `${model}:latest`)
}

export function createProvider(name: ProviderName, config: Config): LlmProvider {
  if (name === 'ollama') return new OllamaClient({baseUrl: config.ollamaUrl})
  if (!config.openRouterKey) throw new Error('OPENROUTER_API_KEY is not set')
  return new OpenRouterClient({apiKey: config.openRouterKey, baseUrl: config.openRouterUrl})
}

/** One client per provider, shared when answers and embeddings come from the same one */
export function createProviders(config: Config): {chat: LlmProvider; embed: LlmProvider} {
  const chat = createProvider(config.chatProvider, config)
  const embed =
    config.embedProvider === config.chatProvider
      ? chat
      : createProvider(config.embedProvider, config)
  return {chat, embed}
}
