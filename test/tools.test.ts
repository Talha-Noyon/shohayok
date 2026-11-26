import {describe, expect, it} from 'vitest'

import {generateShop} from '../src/shop/generate.js'
import {placeOf} from '../src/shop/places.js'
import {
  checkStock,
  deliveryFee,
  listProducts,
  LOOKUP_LIMIT,
  orderStatus,
  requestCallback
} from '../src/tools/tools.js'
import {memoryShop} from '../src/tools/memoryShop.js'

const shop = generateShop()
const data = memoryShop(shop.products, shop.orders)
const demo = {orderId: 'NDI-10299', phone: '01000000002'}

describe('orderStatus', () => {
  it('shows an order to someone with its number and its phone', async () => {
    const result = await orderStatus(demo, data, 0)
    expect(result).toMatchObject({tool: 'order_status', outcome: 'found'})
    expect(result.outcome === 'found' && result.order.id).toBe('NDI-10299')
  })

  it('gives the same answer for a wrong phone and an unknown order', async () => {
    const wrongPhone = await orderStatus({...demo, phone: '01000000003'}, data, 0)
    const unknown = await orderStatus({orderId: 'NDI-99999', phone: demo.phone}, data, 0)
    expect(wrongPhone).toEqual({tool: 'order_status', outcome: 'not_found'})
    expect(unknown).toEqual(wrongPhone)
  })

  it('asks for whatever is missing', async () => {
    expect(await orderStatus({}, data, 0)).toEqual({
      tool: 'order_status',
      outcome: 'missing',
      missing: ['orderId', 'phone']
    })
    expect(await orderStatus({orderId: demo.orderId}, data, 0)).toMatchObject({
      missing: ['phone']
    })
  })

  it('stops looking orders up after too many failed tries', async () => {
    expect(await orderStatus(demo, data, LOOKUP_LIMIT)).toEqual({
      tool: 'order_status',
      outcome: 'locked'
    })
  })
})

describe('deliveryFee', () => {
  it('uses the zone of the place', () => {
    expect(deliveryFee(placeOf('sylhet'))).toMatchObject({zone: 'outside', rate: {fee: 130}})
    expect(deliveryFee(placeOf('mirpur'))).toMatchObject({zone: 'dhaka', rate: {fee: 70}})
    expect(deliveryFee(placeOf('savar'))).toMatchObject({zone: 'outside'})
  })

  it('gives both rates when no place is named', () => {
    expect(deliveryFee(undefined)).toMatchObject({tool: 'delivery_fee', place: undefined})
  })
})

describe('checkStock', () => {
  const product = shop.products.find((item) => item.variants.some((v) => v.stock === 0))
  if (!product) throw new Error('the generated shop has nothing sold out')
  const soldOut = product.variants.find((variant) => variant.stock === 0)

  it('reports a sold-out variant together with what is still available', () => {
    const result = checkStock(product, {color: soldOut?.color, size: soldOut?.size})
    expect(result).toMatchObject({tool: 'check_stock', outcome: 'found', product: {id: product.id}})
    if (result.outcome !== 'found') throw new Error('expected a product')
    expect(result.requested).toEqual([])
    expect(result.available.every((variant) => variant.stock > 0)).toBe(true)
  })

  it('lists every variant in stock when nothing particular is asked', () => {
    const result = checkStock(product, {})
    if (result.outcome !== 'found') throw new Error('expected a product')
    expect(result.available).toHaveLength(product.variants.filter((v) => v.stock > 0).length)
  })

  it('says when it does not know the product', () => {
    expect(checkStock(undefined, {})).toEqual({tool: 'check_stock', outcome: 'no_product'})
  })
})

describe('listProducts', () => {
  it('filters by category, colour and price, cheapest first, and counts every match', async () => {
    const query = {category: 'sharee' as const, colors: ['red'], maxPrice: 3000}
    const result = await listProducts(query, data, 3)
    if (result.outcome !== 'found') throw new Error('expected red sharees under 3000')
    const expected = shop.products.filter(
      (p) => p.category === 'sharee' && p.colors.includes('red') && p.price <= 3000
    )
    expect(result.total).toBe(expected.length)
    expect(result.items).toHaveLength(Math.min(3, expected.length))
    const prices = result.items.map((item) => item.price)
    expect(prices).toEqual([...prices].sort((a, b) => a - b))
  })

  it('says when nothing matches', async () => {
    expect(await listProducts({category: 'shawl', maxPrice: 100}, data, 3)).toMatchObject({
      outcome: 'none'
    })
  })
})

describe('requestCallback', () => {
  it('asks for a phone number first', async () => {
    expect(await requestCallback({question: 'call me'}, data)).toEqual({
      tool: 'request_callback',
      outcome: 'missing'
    })
  })

  it('saves the request and returns a ticket', async () => {
    const result = await requestCallback({phone: '01000000009', question: 'call me'}, data)
    expect(result).toMatchObject({outcome: 'saved', phone: '01000000009'})
    expect(result.outcome === 'saved' && result.ticket).toMatch(/^CB-[A-Z0-9]{6}$/)
  })
})
