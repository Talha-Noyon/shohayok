import {describe, expect, it} from 'vitest'
import {ZodError} from 'zod'

import {loadConfig} from '../src/config.js'

describe('loadConfig', () => {
  it('runs everything on Ollama by default, sized for one 12 GB GPU', () => {
    expect(loadConfig({})).toEqual({
      mongoUri: 'mongodb://127.0.0.1:27017',
      mongoDb: 'shohayok',
      chatProvider: 'ollama',
      embedProvider: 'ollama',
      ollamaUrl: 'http://127.0.0.1:11434',
      openRouterKey: undefined,
      openRouterUrl: 'https://openrouter.ai/api/v1',
      embedModel: 'bge-m3',
      chatModel: 'gemma3:12b',
      rewriteModel: 'gemma3:12b',
      vectorBackend: 'auto',
      handoffThreshold: 0.5,
      topK: 4,
      port: 3000
    })
  })

  it('picks OpenRouter model ids when OpenRouter is the provider', () => {
    const config = loadConfig({LLM_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'sk-or-test'})
    expect(config).toMatchObject({
      chatProvider: 'openrouter',
      embedProvider: 'openrouter',
      openRouterKey: 'sk-or-test',
      embedModel: 'baai/bge-m3',
      chatModel: 'google/gemma-4-31b-it:free',
      rewriteModel: 'google/gemma-4-31b-it:free'
    })
  })

  it('can take answers from OpenRouter and embeddings from Ollama', () => {
    const config = loadConfig({
      LLM_PROVIDER: 'openrouter',
      EMBED_PROVIDER: 'ollama',
      OPENROUTER_API_KEY: 'sk-or-test'
    })
    expect(config).toMatchObject({
      chatProvider: 'openrouter',
      embedProvider: 'ollama',
      embedModel: 'bge-m3',
      chatModel: 'google/gemma-4-31b-it:free'
    })
  })

  it('asks for a key whenever OpenRouter is used', () => {
    expect(() => loadConfig({LLM_PROVIDER: 'openrouter'})).toThrow(ZodError)
    expect(() => loadConfig({EMBED_PROVIDER: 'openrouter'})).toThrow('OPENROUTER_API_KEY')
  })

  it('treats empty values as unset and reads numbers', () => {
    const config = loadConfig({REWRITE_MODEL: '', CHAT_MODEL: 'qwen3:8b', TOP_K: '6'})
    expect(config.rewriteModel).toBe('qwen3:8b')
    expect(config.topK).toBe(6)
  })

  it('rejects an unknown provider or vector backend', () => {
    expect(() => loadConfig({LLM_PROVIDER: 'openai'})).toThrow(ZodError)
    expect(() => loadConfig({VECTOR_BACKEND: 'faiss'})).toThrow(ZodError)
  })
})
