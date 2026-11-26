import {describe, expect, it} from 'vitest'

import {MAX_CHUNK_CHARS, policyChunk, productChunk} from '../src/ingest/chunk.js'
import {loadPolicies, loadProducts, type Policy, type Product} from '../src/shop/schema.js'

const product: Product = {
  id: 'P001',
  collection: 'shiuli',
  category: 'sharee',
  style: 'jamdani',
  name: {en: 'Shiuli Jamdani Sharee', bn: 'শিউলি জামদানি শাড়ি'},
  fabric: {en: 'fine cotton', bn: 'মিহি সুতি'},
  price: 12500,
  colors: ['red', 'sky-blue'],
  sizes: ['Free size'],
  occasions: ['wedding'],
  origin: 'narayanganj',
  description: {
    en: 'Fine cotton with small buti all over.',
    bn: 'মিহি সুতির কাপড়ে সারা জমিনে ছোট ছোট বুটি।'
  },
  care: {en: 'Dry clean only.', bn: 'শুধু ড্রাই ক্লিন করুন।'},
  variants: [
    {sku: 'P001-red-free-size', color: 'red', size: 'Free size', stock: 7},
    {sku: 'P001-sky-blue-free-size', color: 'sky-blue', size: 'Free size', stock: 0}
  ]
}

const policy: Policy = {
  id: 'F01',
  type: 'policy',
  title: {en: 'Delivery inside Dhaka', bn: 'ঢাকার ভিতরে ডেলিভারি'},
  body: {en: 'Delivery inside Dhaka costs Tk 70.', bn: 'ঢাকার ভিতরে ডেলিভারি চার্জ ৭০ টাকা।'},
  tags: ['delivery', 'dhaka']
}

const BENGALI = /[ঀ-৿]/

describe('productChunk', () => {
  const chunk = productChunk(product)

  it('keeps a product in one chunk, with what search can filter on', () => {
    expect(chunk).toMatchObject({
      id: 'P001#0',
      docId: 'P001',
      type: 'product',
      title: 'Shiuli Jamdani Sharee / শিউলি জামদানি শাড়ি',
      filters: {type: 'product', category: 'sharee', colors: ['red', 'sky-blue'], price: 12500}
    })
  })

  it('writes the price in both kinds of digits', () => {
    expect(chunk.textEn).toContain('Tk 12,500')
    expect(chunk.textBn).toContain('১২,৫০০ টাকা')
  })

  it('names colours and sizes in both languages', () => {
    expect(chunk.textEn).toContain('Red, Sky Blue')
    expect(chunk.textBn).toContain('লাল, আকাশি')
    expect(chunk.textBn).toContain('ফ্রি সাইজ')
  })

  it('keeps each language on its own side for the answer prompt', () => {
    expect(chunk.textEn).toContain('Fine cotton with small buti all over.')
    expect(chunk.textEn).not.toMatch(BENGALI)
    expect(chunk.textBn).toContain('মিহি সুতির কাপড়ে')
    expect(chunk.textBn).not.toContain('Fine cotton')
  })

  it('searches both languages and the spellings customers type', () => {
    expect(chunk.text).toContain(chunk.textEn)
    expect(chunk.text).toContain(chunk.textBn)
    for (const spelling of ['jamdhani', 'saree', 'shewli', 'lal', 'akashi']) {
      expect(chunk.text).toMatch(new RegExp(`Also written: .*\\b${spelling}\\b`))
    }
  })

  it('leaves stock out, because stock changes and the text is embedded once', () => {
    const restocked = {
      ...product,
      variants: product.variants.map((variant) => ({...variant, stock: 99}))
    }
    expect(productChunk(restocked)).toEqual(chunk)
  })

  it("finds a kids' panjabi by the spellings of panjabi", () => {
    const kids = productChunk({
      ...product,
      category: 'kids',
      style: 'kids-panjabi',
      sizes: ['2-3Y']
    })
    expect(kids.text).toMatch(/Also written: .*\bpunjabi\b/)
    expect(kids.textBn).toContain('২–৩ বছর')
  })
})

describe('policyChunk', () => {
  const chunk = policyChunk(policy)

  it('searches both languages and keeps one each for the prompt', () => {
    expect(chunk).toMatchObject({
      id: 'F01#0',
      docId: 'F01',
      type: 'policy',
      filters: {type: 'policy'}
    })
    expect(chunk.textEn).toBe('Delivery inside Dhaka\nDelivery inside Dhaka costs Tk 70.')
    expect(chunk.textBn).toBe('ঢাকার ভিতরে ডেলিভারি\nঢাকার ভিতরে ডেলিভারি চার্জ ৭০ টাকা।')
    expect(chunk.text).toContain('Tags: delivery, dhaka')
  })
})

const products = await loadProducts()
const policies = await loadPolicies()

describe('the shop data', () => {
  it('has 15 policies with unique ids', () => {
    expect(policies).toHaveLength(15)
    expect(new Set(policies.map((item) => item.id)).size).toBe(15)
  })

  it('fits every product and policy into one chunk', () => {
    for (const chunk of [...products.map(productChunk), ...policies.map(policyChunk)]) {
      expect(chunk.text.length, chunk.id).toBeLessThanOrEqual(MAX_CHUNK_CHARS)
    }
  })
})
