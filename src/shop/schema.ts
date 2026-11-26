import {readFile} from 'node:fs/promises'

import {z} from 'zod'

import {CATEGORY_KEYS} from './vocab.js'

export const DATA_DIR = new URL('../../data/', import.meta.url)

export const BilingualSchema = z.object({en: z.string().min(1), bn: z.string().min(1)})
export type Bilingual = z.infer<typeof BilingualSchema>

export const VariantSchema = z.object({
  sku: z.string().min(1),
  /** A colour key from the vocabulary */
  color: z.string(),
  size: z.string(),
  stock: z.number().int().min(0)
})
export type Variant = z.infer<typeof VariantSchema>

export const ProductSchema = z.object({
  id: z.string().regex(/^P\d{3}$/, 'product ids look like P001'),
  collection: z.string(),
  category: z.enum(CATEGORY_KEYS),
  style: z.string(),
  name: BilingualSchema,
  fabric: BilingualSchema,
  price: z.number().int().positive(),
  colors: z.array(z.string()).min(1),
  sizes: z.array(z.string()).min(1),
  occasions: z.array(z.string()),
  /** A district key, for styles that come from one place */
  origin: z.string().optional(),
  description: BilingualSchema,
  care: BilingualSchema,
  variants: z.array(VariantSchema).min(1)
})
export type Product = z.infer<typeof ProductSchema>

export const ORDER_STATUSES = [
  'placed',
  'confirmed',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'returned'
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const PAYMENTS = ['cod', 'bkash', 'nagad', 'card'] as const
export type Payment = (typeof PAYMENTS)[number]

export const OrderItemSchema = z.object({
  productId: z.string().regex(/^P\d{3}$/),
  sku: z.string(),
  name: BilingualSchema,
  color: z.string(),
  size: z.string(),
  qty: z.number().int().positive(),
  /** Unit price when the order was placed */
  price: z.number().int().positive()
})
export type OrderItem = z.infer<typeof OrderItemSchema>

export const OrderSchema = z.object({
  id: z.string().regex(/^NDI-\d{5}$/, 'order ids look like NDI-10001'),
  phone: z.string().regex(/^010\d{8}$/, 'phone numbers use the unassigned 010 prefix'),
  /** Place keys: the district, and the area inside it when there is one */
  district: z.string(),
  area: z.string().optional(),
  items: z.array(OrderItemSchema).min(1),
  subtotal: z.number().int().positive(),
  deliveryFee: z.number().int().min(0),
  total: z.number().int().positive(),
  payment: z.enum(PAYMENTS),
  status: z.enum(ORDER_STATUSES),
  timeline: z.array(z.object({status: z.enum(ORDER_STATUSES), at: z.iso.datetime()})).min(1),
  courier: z.string().optional(),
  placedAt: z.iso.datetime()
})
export type Order = z.infer<typeof OrderSchema>

async function readJson(name: string, dir: URL): Promise<unknown> {
  return JSON.parse(await readFile(new URL(name, dir), 'utf8'))
}

export async function loadProducts(dir: URL = DATA_DIR): Promise<Product[]> {
  return z.array(ProductSchema).parse(await readJson('products.json', dir))
}

export async function loadOrders(dir: URL = DATA_DIR): Promise<Order[]> {
  return z.array(OrderSchema).parse(await readJson('orders.json', dir))
}
