import {describe, expect, it} from 'vitest'

import {loadConfig} from '../src/config.js'
import {OllamaClient} from '../src/llm/ollama.js'
import {OpenRouterClient} from '../src/llm/openrouter.js'
import {createProviders} from '../src/llm/providers.js'

describe('createProviders', () => {
  it('shares one client when answers and embeddings use the same provider', () => {
    const {chat, embed} = createProviders(loadConfig({}))
    expect(chat).toBeInstanceOf(OllamaClient)
    expect(embed).toBe(chat)
  })

  it('creates one client per provider when they differ', () => {
    const {chat, embed} = createProviders(
      loadConfig({LLM_PROVIDER: 'openrouter', EMBED_PROVIDER: 'ollama', OPENROUTER_API_KEY: 'k'})
    )
    expect(chat).toBeInstanceOf(OpenRouterClient)
    expect(embed).toBeInstanceOf(OllamaClient)
  })
})
