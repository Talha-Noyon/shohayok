import {describe, expect, it} from 'vitest'

import type {Lang} from '../src/lang/detect.js'
import {renderReply} from '../src/reply/templates.js'
import {generateShop} from '../src/shop/generate.js'
import {placeOf} from '../src/shop/places.js'
import {memoryShop} from '../src/tools/memoryShop.js'
import {checkStock, deliveryFee, listProducts, orderStatus} from '../src/tools/tools.js'
import type {ToolResult} from '../src/tools/types.js'

const LANGS: Lang[] = ['en', 'bn', 'banglish']
/** Replies are NFC; Bengali typed in a test may be composed differently */
const nfc = (text: string) => text.normalize('NFC')
const shop = generateShop()
const data = memoryShop(shop.products, shop.orders)

const found = await orderStatus({orderId: 'NDI-10299', phone: '01000000002'}, data, 0)
const list = await listProducts({category: 'panjabi', maxPrice: 2000}, data, 3)
const product = shop.products[0]
if (!product || list.outcome !== 'found') throw new Error('unexpected shop data')

const ALL: ToolResult[] = [
  found,
  {tool: 'order_status', outcome: 'missing', missing: ['orderId', 'phone']},
  {tool: 'order_status', outcome: 'missing', missing: ['phone']},
  {tool: 'order_status', outcome: 'missing', missing: ['orderId']},
  {tool: 'order_status', outcome: 'not_found'},
  {tool: 'order_status', outcome: 'locked'},
  ...shop.orders
    .slice(0, 40)
    .map((order): ToolResult => ({tool: 'order_status', outcome: 'found', order})),
  deliveryFee(placeOf('sylhet')),
  deliveryFee(placeOf('mirpur')),
  deliveryFee(placeOf('savar')),
  deliveryFee(placeOf('naogaon')),
  deliveryFee(placeOf('outside-dhaka')),
  deliveryFee(undefined),
  checkStock(product, {}),
  checkStock(product, {color: product.colors[0], size: product.sizes[0]}),
  checkStock({...product, variants: product.variants.map((v) => ({...v, stock: 0}))}, {}),
  checkStock(undefined, {}),
  list,
  {tool: 'list_products', outcome: 'none', query: {category: 'shawl', maxPrice: 100}},
  {tool: 'product_info', product},
  {tool: 'request_callback', outcome: 'saved', ticket: 'CB-ABC234', phone: '01000000009'},
  {tool: 'request_callback', outcome: 'missing'},
  {tool: 'handoff'},
  {tool: 'quota', hits: [], resetsAt: '2026-11-27T00:00:00.000Z'},
  {
    tool: 'quota',
    hits: [{docId: 'F05', title: 'Returns and refunds / রিটার্ন ও রিফান্ড'}],
    resetsAt: '2026-11-27T00:00:00.000Z'
  },
  {tool: 'clarify'},
  {tool: 'smalltalk', kind: 'greeting'},
  {tool: 'smalltalk', kind: 'thanks'}
]

const bengaliShare = (text: string) => {
  const bengali = text.match(/[ঀ-৿]/g)?.length ?? 0
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0
  return bengali / Math.max(1, bengali + latin)
}

describe('renderReply', () => {
  it('writes the delivery fee for a place in each language', () => {
    const result = deliveryFee(placeOf('sylhet'))
    expect(renderReply(result, 'en').text).toContain(
      'Delivery to Sylhet costs Tk 130 and takes 3 to 5 working days'
    )
    expect(renderReply(result, 'bn').text).toContain(nfc('সিলেটে ডেলিভারি চার্জ ১৩০ টাকা'))
    expect(renderReply(result, 'banglish').text).toContain('Sylhet e delivery charge 130 taka')
    expect(renderReply(result, 'en').sources).toEqual(['F02'])
  })

  it('puts Bengali place names in the locative case', () => {
    expect(renderReply(deliveryFee(placeOf('dhaka')), 'bn').text).toContain(nfc('ঢাকায়'))
    expect(renderReply(deliveryFee(placeOf('rajshahi')), 'bn').text).toContain(nfc('রাজশাহীতে'))
    expect(renderReply(deliveryFee(placeOf('naogaon')), 'bn').text).toContain(nfc('নওগাঁয়'))
  })

  it('says when a town in Dhaka district pays the outside-Dhaka rate', () => {
    expect(renderReply(deliveryFee(placeOf('savar')), 'en').text).toContain('outside Dhaka city')
  })

  it('gives both rates when no place is named', () => {
    const reply = renderReply(deliveryFee(undefined), 'en')
    expect(reply.text).toContain('Tk 70')
    expect(reply.text).toContain('Tk 130')
    expect(reply.sources).toEqual(['F01', 'F02'])
  })

  it('tells customers where their order is without repeating their phone number', () => {
    for (const lang of LANGS) {
      const text = renderReply(found, lang).text
      expect(text).toContain('NDI-10299')
      expect(text).not.toContain('01000000002')
    }
    expect(renderReply(found, 'en').text).toMatch(/left our warehouse on \d{1,2} [A-Z][a-z]{2}/)
    expect(renderReply(found, 'bn').text).toMatch(/[০-৯]/)
    expect(renderReply(found, 'en').sources).toEqual([])
  })

  it('asks for exactly what is missing', () => {
    const ask = (missing: ('orderId' | 'phone')[]) =>
      renderReply({tool: 'order_status', outcome: 'missing', missing}, 'en').text
    expect(ask(['orderId', 'phone'])).toMatch(/order number.*phone number/)
    expect(ask(['phone'])).not.toMatch(/order number \(/)
    expect(ask(['orderId'])).toContain('NDI-10024')
  })

  it('lists products with numbers, prices and ids', () => {
    const reply = renderReply(list, 'bn')
    expect(reply.text).toContain(nfc('১.'))
    expect(reply.text).toContain(`[${list.items[0]?.id}]`)
    expect(reply.sources).toEqual(list.items.map((item) => item.id))
  })

  it('masks the phone number when it confirms a callback', () => {
    const reply = renderReply(
      {tool: 'request_callback', outcome: 'saved', ticket: 'CB-ABC234', phone: '01000000009'},
      'en'
    )
    expect(reply.text).toContain('CB-ABC234')
    expect(reply.text).toContain('010•••••009')
  })

  it('fills every slot of every reply in every language', () => {
    for (const result of ALL) {
      for (const lang of LANGS) {
        const {text} = renderReply(result, lang)
        expect(text, `${result.tool} ${lang}`).not.toMatch(/undefined|NaN|null|\{|\}/)
        expect(text.length).toBeGreaterThan(10)
      }
    }
  })

  it('writes Bangla replies in Bengali script and Banglish ones in Latin letters', () => {
    for (const result of ALL) {
      expect(bengaliShare(renderReply(result, 'bn').text), result.tool).toBeGreaterThan(0.5)
      expect(bengaliShare(renderReply(result, 'banglish').text), result.tool).toBe(0)
      expect(bengaliShare(renderReply(result, 'en').text), result.tool).toBe(0)
    }
  })
})
