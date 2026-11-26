import {colorName, money, sizeLabel} from '../shop/format.js'
import type {Policy, Product} from '../shop/schema.js'
import {
  CATEGORIES,
  categoryOf,
  COLLECTIONS,
  COLORS,
  styleOf,
  termOf,
  type Term
} from '../shop/vocab.js'

/** What vector and keyword search can narrow a search by */
export interface ChunkFilters {
  type: 'product' | 'policy'
  category?: string
  colors?: string[]
  price?: number
}

export interface Chunk {
  /** `<docId>#<n>` */
  id: string
  docId: string
  type: ChunkFilters['type']
  /** Both names, for display */
  title: string
  /** What gets embedded and keyword-indexed: both languages and the spellings customers type */
  text: string
  /** What the answer prompt sees for English and Banglish questions */
  textEn: string
  /** What the answer prompt sees for Bangla questions */
  textBn: string
  filters: ChunkFilters
}

/** Every product and policy fits in one chunk of this size; a test checks the data */
export const MAX_CHUNK_CHARS = 1500

const LATIN = /^[a-z0-9 -]+$/

/** Latin spellings of the product's words, so keyword search finds "jamdhani sharee" too */
function spellingsOf(terms: Term[]): string[] {
  const all = terms.flatMap((term) => term.spellings).filter((spelling) => LATIN.test(spelling))
  return [...new Set(all)]
}

/**
 * One product, one chunk. Stock is left out on purpose: it changes every day, the text is
 * embedded once, and the stock tool reads it live.
 */
export function productChunk(product: Product): Chunk {
  const category = categoryOf(product.category)
  const style = styleOf(product.style)
  // A kids' panjabi is found by the words for panjabi
  const styleTerm =
    style.matchable === false ? (CATEGORIES.find((item) => item.en === style.en) ?? style) : style
  const colors = product.colors.map((key) => termOf(COLORS, key))

  const textEn = [
    product.name.en,
    `${category.en} · ${style.en}`,
    `Price: ${money(product.price, 'en')}`,
    `Colours: ${product.colors.map((key) => colorName(key, 'en')).join(', ')}`,
    `Sizes: ${product.sizes.map((size) => sizeLabel(size, 'en')).join(', ')}`,
    `Fabric: ${product.fabric.en}`,
    product.description.en,
    `Care: ${product.care.en}`
  ].join('\n')

  const textBn = [
    product.name.bn,
    `${category.bn} · ${style.bn}`,
    `দাম: ${money(product.price, 'bn')}`,
    `রং: ${product.colors.map((key) => colorName(key, 'bn')).join(', ')}`,
    `সাইজ: ${product.sizes.map((size) => sizeLabel(size, 'bn')).join(', ')}`,
    `কাপড়: ${product.fabric.bn}`,
    product.description.bn,
    `যত্ন: ${product.care.bn}`
  ].join('\n')

  const spellings = spellingsOf([
    termOf(COLLECTIONS, product.collection),
    styleTerm,
    category,
    ...colors
  ])

  return {
    id: `${product.id}#0`,
    docId: product.id,
    type: 'product',
    title: `${product.name.en} / ${product.name.bn}`,
    text: [textEn, textBn, `Also written: ${spellings.join(', ')}`].join('\n'),
    textEn,
    textBn,
    filters: {
      type: 'product',
      category: product.category,
      colors: product.colors,
      price: product.price
    }
  }
}

export function policyChunk(policy: Policy): Chunk {
  const textEn = `${policy.title.en}\n${policy.body.en}`
  const textBn = `${policy.title.bn}\n${policy.body.bn}`
  const tags = policy.tags.length > 0 ? [`Tags: ${policy.tags.join(', ')}`] : []
  return {
    id: `${policy.id}#0`,
    docId: policy.id,
    type: 'policy',
    title: `${policy.title.en} / ${policy.title.bn}`,
    text: [textEn, textBn, ...tags].join('\n'),
    textEn,
    textBn,
    filters: {type: 'policy'}
  }
}
