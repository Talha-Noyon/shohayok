import {randomBytes} from 'node:crypto'

import type {Order, Product} from '../shop/schema.js'
import type {CallbackRequest, ProductQuery, ShopData} from './types.js'

/** Does a product match a query? MongoDB runs the same rules in `MongoShopData`. */
export function matchesQuery(product: Product, query: ProductQuery): boolean {
  if (query.category && product.category !== query.category) return false
  if (query.collection && product.collection !== query.collection) return false
  if (query.styles?.length && !query.styles.includes(product.style)) return false
  if (query.colors?.length && !query.colors.some((color) => product.colors.includes(color))) {
    return false
  }
  if (query.minPrice !== undefined && product.price < query.minPrice) return false
  if (query.maxPrice !== undefined && product.price > query.maxPrice) return false
  if (query.size && !product.sizes.includes(query.size)) return false
  return true
}

/** Callback tickets: "CB-" and six letters or digits that are easy to read out on the phone */
export function newTicket(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(6)
  return `CB-${[...bytes].map((byte) => alphabet[byte % alphabet.length]).join('')}`
}

/** Shop data held in memory, for tests */
export function memoryShop(
  products: Product[],
  orders: Order[]
): ShopData & {callbacks: (CallbackRequest & {ticket: string})[]} {
  const callbacks: (CallbackRequest & {ticket: string})[] = []
  return {
    callbacks,
    findOrder: async (orderId) => orders.find((order) => order.id === orderId) ?? null,
    findProducts: async (query, limit) => {
      const matches = products
        .filter((product) => matchesQuery(product, query))
        .sort((a, b) => a.price - b.price || a.id.localeCompare(b.id))
      return {items: matches.slice(0, limit), total: matches.length}
    },
    getProducts: async (ids) =>
      ids.flatMap((id) => products.find((product) => product.id === id) ?? []),
    saveCallback: async (request) => {
      const ticket = newTicket()
      callbacks.push({...request, ticket})
      return ticket
    }
  }
}
