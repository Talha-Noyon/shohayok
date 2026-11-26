import type {Lang, Quota, Trace} from '../../src/shared/api.js'

export const LANG_NAMES: Record<Lang, string> = {bn: 'Bangla', banglish: 'Banglish', en: 'English'}

/** For the lang attribute: Banglish is Bengali written in Latin script */
export const LANG_TAGS: Record<Lang, string> = {bn: 'bn', banglish: 'bn-Latn', en: 'en'}

/** Chunks store "English / বাংলা" */
export const englishTitle = (title: string) => title.split(' / ')[0] ?? title

export const duration = (ms: number) =>
  ms < 1 ? 'under 1 ms' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`

export const words = (key: string) => key.replace(/-/g, ' ')

export const TOOL_NAMES: Record<string, string> = {
  order_status: 'Order status, from the orders database',
  delivery_fee: 'Delivery fee, from the delivery rates',
  check_stock: 'Stock, from each size and colour',
  list_products: 'A product list, from the catalogue',
  product_info: 'Product details, from the catalogue',
  request_callback: 'A callback request for the team',
  smalltalk: 'A fixed greeting',
  clarify: 'A question back to the customer'
}

export const INTENT_NAMES: Record<string, string> = {
  greeting: 'a greeting',
  thanks: 'thanks',
  order_status: 'an order',
  delivery: 'delivery',
  stock: 'stock',
  browse: 'browsing',
  price: 'a price',
  human: 'a person'
}

export const DECISIONS: Record<Trace['decision'], string> = {
  tool: 'A fixed reply, filled in from shop data. No model was asked.',
  answer: 'Written by the model, from the pages it found.',
  cached: 'Asked before, so the saved answer was sent again.',
  handoff:
    'Nothing it found was close enough to answer from, so it offered a callback instead of guessing.',
  quota: "Today's free model requests were used up, so it listed what keyword search found."
}

/** What produced a reply, in a few words under it */
export function madeBy(trace: Trace): string {
  switch (trace.decision) {
    case 'tool':
      return 'From shop data'
    case 'answer':
      return 'Written by the model'
    case 'cached':
      return 'Saved answer'
    case 'handoff':
      return 'Not sure, so no guess'
    case 'quota':
      return 'Search results only'
  }
}

export const requestCount = (trace: Trace) => trace.modelRequests.embed + trace.modelRequests.chat

export function requestsText(count: number): string {
  return count === 0
    ? 'no model requests'
    : count === 1
      ? '1 model request'
      : `${count} model requests`
}

export function quotaLeft(quota: Quota): {day: number; visitor: number} {
  return {
    day: Math.max(0, quota.limit - quota.used),
    visitor: Math.max(0, quota.visitorLimit - quota.visitorUsed)
  }
}
