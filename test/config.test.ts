import {describe, expect, it} from 'vitest'
import {ZodError} from 'zod'

import {loadConfig} from '../src/config.js'

describe('loadConfig', () => {
  it('runs everything on Ollama by default, sized for one 12 GB GPU', () => {
    expect(loadConfig({})).toEqual({
      mongoUri: 'mongodb://127.0.0.1:27017',
      mongoDb: 'shohayok',
      dnsServers: [],
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
      embedModel: 'nvidia/nemotron-3.5-embed-1b:free',
      chatModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      rewriteModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      handoffThreshold: 0.25
    })
  })

  it('keeps a handoff threshold that was set, whatever the embedding model', () => {
    const config = loadConfig({
      LLM_PROVIDER: 'openrouter',
      OPENROUTER_API_KEY: 'sk-or-test',
      HANDOFF_THRESHOLD: '0.4'
    })
    expect(config.handoffThreshold).toBe(0.4)
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
      chatModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      handoffThreshold: 0.5
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

  it('reads a list of DNS servers and rejects anything that is not an IP address', () => {
    expect(loadConfig({DNS_SERVERS: ' 8.8.8.8, 1.1.1.1 ,'}).dnsServers).toEqual([
      '8.8.8.8',
      '1.1.1.1'
    ])
    expect(loadConfig({DNS_SERVERS: '2001:4860:4860::8888'}).dnsServers).toEqual([
      '2001:4860:4860::8888'
    ])
    expect(() => loadConfig({DNS_SERVERS: 'dns.google'})).toThrow('not an IP address')
  })

  it('rejects an unknown provider or vector backend', () => {
    expect(() => loadConfig({LLM_PROVIDER: 'openai'})).toThrow(ZodError)
    expect(() => loadConfig({VECTOR_BACKEND: 'faiss'})).toThrow(ZodError)
  })
})
