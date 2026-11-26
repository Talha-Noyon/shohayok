import type {Entities} from '../nlu/entities.js'
import type {Intent} from '../nlu/intents.js'
import type {Place} from '../shop/places.js'
import type {CategoryKey} from '../shop/vocab.js'
import type {ProductQuery} from '../tools/types.js'
import type {ConversationState} from './state.js'

/** A product named in the message, or one the conversation showed earlier */
export type ProductRef =
  | {by: 'id'; id: string}
  | {by: 'name'; collection: string; styles: string[]; category?: CategoryKey}

type ToolRoute =
  | {tool: 'smalltalk'; smalltalk: 'greeting' | 'thanks'}
  | {tool: 'clarify'}
  | {tool: 'order_status'; orderId?: string; phone?: string}
  | {tool: 'delivery_fee'; place?: Place}
  | {tool: 'check_stock'; product: ProductRef; color?: string; size?: string}
  | {tool: 'product_info'; product: ProductRef}
  | {tool: 'list_products'; query: ProductQuery}
  | {tool: 'request_callback'; phone?: string; question: string}

/** Where a message goes, and which rule sent it there, for the inspector */
export type Route =
  | ({kind: 'tool'; reason: string} & ToolRoute)
  | {kind: 'answer'; reason: string; product?: ProductRef}

const tool = (reason: string, route: ToolRoute): Route => ({kind: 'tool', reason, ...route})

const nonEmpty = <T>(list: T[]): T[] | undefined => (list.length > 0 ? list : undefined)

/** The product "it" or "the second one" points at, if the conversation showed one */
function referredProduct(
  entities: Entities,
  state: ConversationState
): {ref?: ProductRef; ambiguous: boolean} {
  const shown = state.lastProducts
  if (!entities.reference || shown.length === 0) return {ambiguous: false}
  if (entities.ordinal !== undefined) {
    const id = entities.ordinal === -1 ? shown.at(-1) : shown[entities.ordinal - 1]
    return id ? {ref: {by: 'id', id}, ambiguous: false} : {ambiguous: true}
  }
  const only = shown.length === 1 ? shown[0] : undefined
  return only ? {ref: {by: 'id', id: only}, ambiguous: false} : {ambiguous: true}
}

/**
 * Decides, without a model, what answers a message. Rules run in priority order; the first that
 * fits wins. Anything they do not cover becomes an open question for search and the model.
 */
export function route(
  message: string,
  entities: Entities,
  intents: Set<Intent>,
  state: ConversationState
): Route {
  const pending = state.pending
  const mentionsProduct =
    entities.categories.length > 0 || entities.styles.length > 0 || entities.collections.length > 0

  if (intents.has('human')) {
    return tool('asked for a person', {
      tool: 'request_callback',
      phone: entities.phone,
      question: message
    })
  }

  const pendingOrder = pending?.tool === 'order_status' ? pending : undefined
  if (entities.orderId || intents.has('order_status')) {
    return tool('order number or a question about an order', {
      tool: 'order_status',
      orderId: entities.orderId ?? pendingOrder?.orderId,
      phone: entities.phone ?? pendingOrder?.phone
    })
  }
  if (pendingOrder && entities.phone) {
    return tool('the phone number the order lookup asked for', {
      tool: 'order_status',
      orderId: pendingOrder.orderId,
      phone: entities.phone
    })
  }
  if (pending?.tool === 'request_callback' && entities.phone) {
    return tool('the phone number the callback asked for', {
      tool: 'request_callback',
      phone: entities.phone,
      question: pending.question
    })
  }

  if (intents.has('delivery')) {
    return tool('a delivery question', {tool: 'delivery_fee', place: entities.places[0]})
  }
  if (state.lastTool === 'delivery_fee' && entities.places.length > 0 && !mentionsProduct) {
    return tool('another place for the last delivery question', {
      tool: 'delivery_fee',
      place: entities.places[0]
    })
  }

  const asksStock = intents.has('stock') || entities.sizes.length > 0 || entities.colors.length > 0
  const productTool = (reason: string, product: ProductRef): Route =>
    asksStock
      ? tool(reason, {
          tool: 'check_stock',
          product,
          color: entities.colors[0],
          size: entities.sizes[0]
        })
      : tool(reason, {tool: 'product_info', product})

  const collection = entities.collections[0]
  if (collection) {
    const product: ProductRef = {
      by: 'name',
      collection,
      styles: entities.styles,
      category: entities.categories[0]
    }
    if (intents.has('browse') && !intents.has('stock')) {
      return tool('a collection to browse', {
        tool: 'list_products',
        query: {collection, styles: nonEmpty(entities.styles), category: entities.categories[0]}
      })
    }
    return productTool('names a product', product)
  }

  const referred = referredProduct(entities, state)
  if (referred.ambiguous) return tool('unclear which product it means', {tool: 'clarify'})
  if (referred.ref) {
    if (asksStock || intents.has('price')) {
      return productTool('points at a product shown before', referred.ref)
    }
    return {
      kind: 'answer',
      reason: 'a question about a product shown before',
      product: referred.ref
    }
  }

  const hasPrice = entities.minPrice !== undefined || entities.maxPrice !== undefined
  const filtered = mentionsProduct || entities.colors.length > 0 || hasPrice
  if (
    filtered &&
    (intents.has('browse') || intents.has('price') || intents.has('stock') || hasPrice)
  ) {
    return tool('browsing with filters', {
      tool: 'list_products',
      query: {
        category: entities.categories[0],
        styles: nonEmpty(entities.styles),
        colors: nonEmpty(entities.colors),
        minPrice: entities.minPrice,
        maxPrice: entities.maxPrice,
        size: entities.sizes[0]
      }
    })
  }

  const onlySmallTalk =
    (intents.has('greeting') || intents.has('thanks')) &&
    intents.size === 1 &&
    !mentionsProduct &&
    entities.places.length === 0
  if (onlySmallTalk) {
    return tool(intents.has('thanks') ? 'thanks' : 'a greeting', {
      tool: 'smalltalk',
      smalltalk: intents.has('thanks') ? 'thanks' : 'greeting'
    })
  }

  return {kind: 'answer', reason: 'an open question'}
}
