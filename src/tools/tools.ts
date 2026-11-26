import {DELIVERY} from '../shop/delivery.js'
import type {Place} from '../shop/places.js'
import type {Product} from '../shop/schema.js'
import type {ProductQuery, ShopData, ToolResult} from './types.js'

/** Failed order lookups allowed in one conversation before lookups stop */
export const LOOKUP_LIMIT = 5

type Result<T extends ToolResult['tool']> = Extract<ToolResult, {tool: T}>

/**
 * An order is shown only to someone who has both its number and the phone number on it. A
 * wrong phone and an unknown number get the same answer, so neither can be guessed one at a time.
 */
export async function orderStatus(
  args: {orderId?: string; phone?: string},
  data: ShopData,
  failedLookups: number
): Promise<Result<'order_status'>> {
  const missing = [
    ...(args.orderId ? [] : ['orderId' as const]),
    ...(args.phone ? [] : ['phone' as const])
  ]
  if (missing.length > 0) return {tool: 'order_status', outcome: 'missing', missing}
  if (failedLookups >= LOOKUP_LIMIT) return {tool: 'order_status', outcome: 'locked'}
  const order = await data.findOrder(args.orderId ?? '')
  if (!order || order.phone !== args.phone) return {tool: 'order_status', outcome: 'not_found'}
  return {tool: 'order_status', outcome: 'found', order}
}

export function deliveryFee(place: Place | undefined): Result<'delivery_fee'> {
  if (!place) return {tool: 'delivery_fee', place: undefined}
  return {tool: 'delivery_fee', place, zone: place.zone, rate: DELIVERY[place.zone]}
}

export function checkStock(
  product: Product | undefined,
  wanted: {color?: string; size?: string}
): Result<'check_stock'> {
  if (!product) return {tool: 'check_stock', outcome: 'no_product'}
  const available = product.variants.filter((variant) => variant.stock > 0)
  const requested = available.filter(
    (variant) =>
      (!wanted.color || variant.color === wanted.color) &&
      (!wanted.size || variant.size === wanted.size)
  )
  return {
    tool: 'check_stock',
    outcome: 'found',
    product,
    color: wanted.color,
    size: wanted.size,
    requested,
    available
  }
}

export async function listProducts(
  query: ProductQuery,
  data: ShopData,
  limit: number
): Promise<Result<'list_products'>> {
  const {items, total} = await data.findProducts(query, limit)
  if (total === 0) return {tool: 'list_products', outcome: 'none', query}
  return {tool: 'list_products', outcome: 'found', items, total, query}
}

export async function requestCallback(
  args: {phone?: string; question: string; conversationId?: string},
  data: ShopData
): Promise<Result<'request_callback'>> {
  if (!args.phone) return {tool: 'request_callback', outcome: 'missing'}
  const ticket = await data.saveCallback({
    phone: args.phone,
    question: args.question,
    conversationId: args.conversationId
  })
  return {tool: 'request_callback', outcome: 'saved', ticket, phone: args.phone}
}
