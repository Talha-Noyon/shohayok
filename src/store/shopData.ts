import type {Filter} from 'mongodb'

import type {Order, Product} from '../shop/schema.js'
import {newTicket} from '../tools/memoryShop.js'
import type {CallbackRequest, ProductQuery, ShopData} from '../tools/types.js'
import type {Store} from './mongo.js'
import type {ProductDoc} from './types.js'

export interface CallbackDoc extends CallbackRequest {
  /** The ticket number */
  _id: string
  status: 'open'
  createdAt: Date
}

/** The same rules as `matchesQuery`, as a MongoDB filter */
export function toProductFilter(query: ProductQuery): Filter<ProductDoc> {
  const filter: Filter<ProductDoc> = {}
  if (query.category) filter.category = query.category
  if (query.styles?.length) filter.style = {$in: query.styles}
  if (query.colors?.length) filter.colors = {$in: query.colors}
  if (query.collection) filter.collection = query.collection
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filter.price = {
      ...(query.minPrice !== undefined && {$gte: query.minPrice}),
      ...(query.maxPrice !== undefined && {$lte: query.maxPrice})
    }
  }
  if (query.size) filter.sizes = query.size
  return filter
}

const WITHOUT_ID = {projection: {_id: 0}} as const

/** Orders, products and callback requests in MongoDB */
export class MongoShopData implements ShopData {
  private readonly store: Store

  constructor(store: Store) {
    this.store = store
  }

  async findOrder(orderId: string): Promise<Order | null> {
    return this.store.orders.findOne({_id: orderId}, WITHOUT_ID)
  }

  async findProducts(query: ProductQuery, limit: number) {
    const filter = toProductFilter(query)
    const [items, total] = await Promise.all([
      this.store.products.find(filter, WITHOUT_ID).sort({price: 1, _id: 1}).limit(limit).toArray(),
      this.store.products.countDocuments(filter)
    ])
    return {items: items as Product[], total}
  }

  async getProducts(ids: string[]): Promise<Product[]> {
    const found = await this.store.products.find({_id: {$in: ids}}, WITHOUT_ID).toArray()
    return ids.flatMap((id) => (found as Product[]).find((product) => product.id === id) ?? [])
  }

  async saveCallback(request: CallbackRequest): Promise<string> {
    const ticket = newTicket()
    await this.store.db.collection<CallbackDoc>('callbacks').insertOne({
      _id: ticket,
      ...request,
      status: 'open',
      createdAt: new Date()
    })
    return ticket
  }
}
