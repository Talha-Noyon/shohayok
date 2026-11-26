import type {DeliveryRate} from '../shop/delivery.js'
import type {Place, Zone} from '../shop/places.js'
import type {Order, Product, Variant} from '../shop/schema.js'
import type {CategoryKey} from '../shop/vocab.js'

export interface ProductQuery {
  category?: CategoryKey
  /** Any of these styles */
  styles?: string[]
  /** Any of these colours */
  colors?: string[]
  collection?: string
  minPrice?: number
  maxPrice?: number
  size?: string
}

export interface CallbackRequest {
  phone: string
  question: string
  conversationId?: string
}

/** What the tools read and write. MongoDB in the app, memory in tests. */
export interface ShopData {
  findOrder(orderId: string): Promise<Order | null>
  /** Matches, cheapest first, and how many match in all */
  findProducts(query: ProductQuery, limit: number): Promise<{items: Product[]; total: number}>
  getProducts(ids: string[]): Promise<Product[]>
  /** Stores the request and returns its ticket number */
  saveCallback(request: CallbackRequest): Promise<string>
}

export type ToolName =
  | 'order_status'
  | 'delivery_fee'
  | 'check_stock'
  | 'list_products'
  | 'product_info'
  | 'request_callback'
  | 'smalltalk'
  | 'clarify'

export type ToolResult =
  | {tool: 'order_status'; outcome: 'found'; order: Order}
  | {tool: 'order_status'; outcome: 'missing'; missing: ('orderId' | 'phone')[]}
  | {tool: 'order_status'; outcome: 'not_found'}
  | {tool: 'order_status'; outcome: 'locked'}
  | {tool: 'delivery_fee'; place?: Place; zone?: Zone; rate?: DeliveryRate}
  | {
      tool: 'check_stock'
      outcome: 'found'
      product: Product
      color?: string
      size?: string
      /** In-stock variants that match what was asked */
      requested: Variant[]
      /** Every variant in stock */
      available: Variant[]
    }
  | {tool: 'check_stock'; outcome: 'no_product'}
  | {tool: 'list_products'; outcome: 'found'; items: Product[]; total: number; query: ProductQuery}
  | {tool: 'list_products'; outcome: 'none'; query: ProductQuery}
  | {tool: 'product_info'; product: Product}
  | {tool: 'request_callback'; outcome: 'saved'; ticket: string; phone: string}
  | {tool: 'request_callback'; outcome: 'missing'}
  | {tool: 'smalltalk'; kind: 'greeting' | 'thanks'}
  | {tool: 'clarify'}
