import {describe, expect, it} from 'vitest'

import {deliveryFee} from '../src/shop/delivery.js'
import {DEMO_ORDERS, generateShop} from '../src/shop/generate.js'
import {placeOf} from '../src/shop/places.js'
import {loadOrders, loadProducts, OrderSchema, ProductSchema} from '../src/shop/schema.js'
import {styleOf} from '../src/shop/vocab.js'

const shop = generateShop()

const unique = (values: string[]) => new Set(values).size === values.length

describe('generateShop: products', () => {
  it('gives the same shop for the same seed, and another for another seed', () => {
    expect(JSON.stringify(generateShop())).toBe(JSON.stringify(shop))
    expect(JSON.stringify(generateShop(1))).not.toBe(JSON.stringify(shop))
  })

  it('makes 500 valid products with unique ids, names and skus', () => {
    expect(shop.products).toHaveLength(500)
    for (const product of shop.products) ProductSchema.parse(product)
    expect(unique(shop.products.map((product) => product.id))).toBe(true)
    expect(unique(shop.products.map((product) => product.name.en))).toBe(true)
    expect(unique(shop.products.map((product) => product.name.bn))).toBe(true)
    expect(unique(shop.products.flatMap((product) => product.variants.map((v) => v.sku)))).toBe(
      true
    )
  })

  it("prices every product within its style's range, in steps of 50", () => {
    for (const product of shop.products) {
      const offer = styleOf(product.style).offers[product.category]
      expect(offer, product.id).toBeDefined()
      expect(product.price).toBeGreaterThanOrEqual(offer?.price[0] ?? 0)
      expect(product.price).toBeLessThanOrEqual(offer?.price[1] ?? 0)
      expect(product.price % 50).toBe(0)
    }
  })

  it('has one variant per colour and size, and some of them sold out', () => {
    let variants = 0
    let soldOut = 0
    for (const product of shop.products) {
      expect(product.variants).toHaveLength(product.colors.length * product.sizes.length)
      variants += product.variants.length
      soldOut += product.variants.filter((variant) => variant.stock === 0).length
    }
    expect(soldOut / variants).toBeGreaterThan(0.08)
    expect(soldOut / variants).toBeLessThan(0.25)
  })

  it('writes descriptions in both languages without leaving a slot unfilled', () => {
    for (const product of shop.products) {
      expect(product.description.bn).toMatch(/[ঀ-৿]/)
      expect(`${product.description.en} ${product.description.bn}`).not.toMatch(/undefined|\{/)
    }
  })
})

describe('generateShop: orders', () => {
  it('makes 300 valid orders with unique ids and phones on the unassigned 010 prefix', () => {
    expect(shop.orders).toHaveLength(300)
    for (const order of shop.orders) OrderSchema.parse(order)
    expect(unique(shop.orders.map((order) => order.id))).toBe(true)
    expect(unique(shop.orders.map((order) => order.phone))).toBe(true)
  })

  it('bills each order for its items plus the delivery fee of its zone', () => {
    for (const order of shop.orders) {
      const subtotal = order.items.reduce((sum, item) => sum + item.price * item.qty, 0)
      expect(order.subtotal).toBe(subtotal)
      const zone = placeOf(order.area ?? order.district).zone
      expect(order.deliveryFee).toBe(deliveryFee(zone, subtotal))
      expect(order.total).toBe(subtotal + order.deliveryFee)
    }
  })

  it('only orders variants that exist', () => {
    const skus = new Set(shop.products.flatMap((product) => product.variants.map((v) => v.sku)))
    for (const order of shop.orders) {
      for (const item of order.items) expect(skus.has(item.sku), item.sku).toBe(true)
    }
  })

  it('keeps every timeline in time order, ending with the order status', () => {
    for (const order of shop.orders) {
      const times = order.timeline.map((step) => Date.parse(step.at))
      expect([...times].sort((a, b) => a - b)).toEqual(times)
      expect(order.timeline.at(-1)?.status).toBe(order.status)
      expect(order.timeline[0]?.at).toBe(order.placedAt)
    }
  })

  it('includes the demo orders the page suggests', () => {
    for (const demo of DEMO_ORDERS) {
      const order = shop.orders.find((item) => item.id === demo.id)
      expect(order?.phone).toBe(demo.phone)
      expect(order?.status).toBe(demo.status)
    }
  })
})

describe('data files', () => {
  it('hold exactly what the generator makes, so a changed generator needs npm run generate', async () => {
    expect(await loadProducts()).toEqual(shop.products)
    expect(await loadOrders()).toEqual(shop.orders)
  })
})
