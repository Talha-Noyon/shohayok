import {describe, expect, it, vi} from 'vitest'

import {Budget} from '../src/limits/budget.js'
import {MemoryCounter} from '../src/limits/counter.js'
import {budgeted, QuotaExhaustedError} from '../src/llm/budgeted.js'
import {OpenRouterError} from '../src/llm/openrouter.js'
import type {LlmProvider} from '../src/llm/types.js'

function fakeProvider(overrides: Partial<LlmProvider> = {}): LlmProvider {
  return {
    name: 'openrouter',
    listModels: async () => [],
    embed: vi.fn(async (_model: string, input: string[]) => input.map(() => [1])),
    chatJson: vi.fn(async () => ({ok: true})),
    chatStream: vi.fn(async function* () {
      yield 'hi'
    }),
    ...overrides
  }
}

const budget = (dailyLimit: number) =>
  new Budget(new MemoryCounter(), {dailyLimit, visitorLimit: dailyLimit, enabled: true})

async function drain(stream: AsyncIterable<string>): Promise<string[]> {
  const pieces: string[] = []
  for await (const piece of stream) pieces.push(piece)
  return pieces
}

describe('budgeted', () => {
  it('takes one unit before each request and refuses once the budget is spent', async () => {
    const inner = fakeProvider()
    const requests: string[] = []
    const provider = budgeted(inner, budget(2), 'visitor', (kind) => requests.push(kind))
    await provider.embed('m', ['a'])
    await provider.chatJson('m', [], {})
    await expect(drain(provider.chatStream('m', []))).rejects.toBeInstanceOf(QuotaExhaustedError)
    expect(inner.chatStream).not.toHaveBeenCalled()
    expect(requests).toEqual(['embed', 'chat'])
  })

  it('does not charge for embedding nothing', async () => {
    const day = budget(1)
    await budgeted(fakeProvider(), day, 'visitor').embed('m', [])
    expect((await day.status()).used).toBe(0)
  })

  it('ends the day when the provider says its daily limit is reached', async () => {
    const day = budget(10)
    const provider = budgeted(
      fakeProvider({
        chatJson: async () => {
          throw new OpenRouterError('Rate limit exceeded: free-models-per-day', 429)
        }
      }),
      day,
      'visitor'
    )
    await expect(provider.chatJson('m', [], {})).rejects.toBeInstanceOf(QuotaExhaustedError)
    expect((await day.status()).used).toBe(10)
  })

  it('passes other errors through unchanged', async () => {
    const provider = budgeted(
      fakeProvider({
        embed: async () => {
          throw new Error('network down')
        }
      }),
      budget(5),
      'visitor'
    )
    await expect(provider.embed('m', ['a'])).rejects.toThrow('network down')
  })
})
