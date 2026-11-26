import type {Budget} from '../limits/budget.js'
import {isDailyLimit} from './openrouter.js'
import type {LlmProvider} from './types.js'

/** The demo's free model requests for today are spent */
export class QuotaExhaustedError extends Error {
  constructor(options?: ErrorOptions) {
    super("Today's free model requests are used up", options)
    this.name = 'QuotaExhaustedError'
  }
}

export type RequestKind = 'embed' | 'chat'

/**
 * A provider that asks the budget before every request, for one visitor. A request the budget
 * refuses is never sent. When the provider itself reports its daily limit, the budget is closed
 * for the day, so the next visitors are told at once instead of after another failed request.
 */
export function budgeted(
  provider: LlmProvider,
  budget: Budget,
  visitor: string,
  onRequest: (kind: RequestKind) => void = () => undefined
): LlmProvider {
  const open = async (kind: RequestKind) => {
    if (!(await budget.take(visitor))) throw new QuotaExhaustedError()
    onRequest(kind)
  }
  const closeOnDailyLimit = async (error: unknown): Promise<never> => {
    if (isDailyLimit(error)) {
      await budget.exhaust()
      throw new QuotaExhaustedError({cause: error})
    }
    throw error
  }

  return {
    name: provider.name,
    listModels: () => provider.listModels(),
    async embed(model, input) {
      if (input.length === 0) return []
      await open('embed')
      return provider.embed(model, input).catch(closeOnDailyLimit)
    },
    async chatJson(model, messages, schema, info) {
      await open('chat')
      return provider.chatJson(model, messages, schema, info).catch(closeOnDailyLimit)
    },
    async *chatStream(model, messages, signal, info) {
      await open('chat')
      try {
        yield* provider.chatStream(model, messages, signal, info)
      } catch (error) {
        await closeOnDailyLimit(error)
      }
    }
  }
}
