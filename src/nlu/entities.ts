import {PLACES, type Place} from '../shop/places.js'
import {
  CATEGORIES,
  COLLECTIONS,
  COLORS,
  STYLES,
  type CategoryKey,
  type Term
} from '../shop/vocab.js'
import {matchTerms, phrases} from './match.js'
import {normalize} from './normalize.js'

/** What a message says about orders, places and products, read without a model */
export interface Entities {
  /** "NDI-10024" */
  orderId?: string
  /** Eleven digits, "01012345678" */
  phone?: string
  places: Place[]
  colors: string[]
  categories: CategoryKey[]
  styles: string[]
  collections: string[]
  /** Canonical sizes: "XL", "42", "4-5Y" */
  sizes: string[]
  minPrice?: number
  maxPrice?: number
  /** The message points back at something: "oitar dam koto?", "is it in red?" */
  reference: boolean
  /** "the second one" is 2, "the last one" is -1 */
  ordinal?: number
}

const MATCHABLE_STYLES = STYLES.filter((style) => style.matchable !== false)

/** Word boundaries that work for Bengali too, on normalized text where only spaces separate */
const word = (pattern: string) => new RegExp(`(?<=^|\\s)(?:${pattern})(?=\\s|$)`)

const ORDER_ID = word('ndi\\s?(\\d{5})')
const ORDER_WORD_ID = word(
  '(?:order|orders|odar|ordar|অর্ডার|অর্ডারের|অর্ডারটা)(?:\\s(?:no|number|nombor|nong|id|নম্বর|নং))?\\s(1\\d{4})'
)
const PHONE = word('(?:88\\s?)?(01\\d(?:\\s?\\d){8})')

const THOUSANDS = /(?<=^|\s)(\d+)\s?(?:k|hajar|hazar|হাজার)(?=\s|$)/g

const NUM = '(\\d{3,6})'
const CURRENCY = '(?:\\s(?:tk|taka|takar|bdt|টাকা|টাকার))?'
const OF = '(?:er\\s|এর\\s)?'
const BELOW_BEFORE = '(?:under|below|less than|within|upto|up to|max|maximum|at most)'
const BELOW_AFTER =
  '(?:niche|nicher|nice|moddhe|modhe|vitore|bhitore|kom|kome|or less|or below|নিচে|নিচের|মধ্যে|ভিতরে|কম|কমে)'
const ABOVE_BEFORE = '(?:over|above|more than|at least|min|minimum)'
const ABOVE_AFTER = '(?:upore|opore|uporer|beshi|besi|or more|plus|উপরে|উপরের|বেশি)'

const RANGE = word(`(?:between\\s)?${NUM}${CURRENCY}\\s(?:to|and|theke|থেকে)\\s${NUM}${CURRENCY}`)
const MAX_BEFORE = word(`${BELOW_BEFORE}\\s(?:tk\\s|taka\\s)?${NUM}`)
const MAX_AFTER = word(`${NUM}${CURRENCY}\\s${OF}${BELOW_AFTER}`)
const MIN_BEFORE = word(`${ABOVE_BEFORE}\\s(?:tk\\s|taka\\s)?${NUM}`)
const MIN_AFTER = word(`${NUM}${CURRENCY}\\s${OF}${ABOVE_AFTER}`)

const SIZE_WORD = '(?:size|saiz|sise|sz|সাইজ|সাইজের)'
const SIZE_VALUE = '(xxl|2xl|xl|l|m|s|38|40|42|44|46)'
const SIZE_AFTER_WORD = word(`${SIZE_WORD}\\s${SIZE_VALUE}`)
const SIZE_BEFORE_WORD = word(`${SIZE_VALUE}\\s${SIZE_WORD}`)
const BIG_SIZE = word('(xxl|2xl|xl)')
const AGE = word(
  '(\\d{1,2})(?:\\s(?:to|theke|থেকে)\\s\\d{1,2})?\\s(?:y|yr|yrs|year|years|bochor|bochorer|bosor|bosorer|বছর|বছরের)'
)
const AGE_SIZES = ['2-3Y', '4-5Y', '6-7Y', '8-9Y', '10-11Y']

const REFERENCES: Term[] = [
  phrases('reference', [
    'it',
    'its',
    'this',
    'that',
    'this one',
    'that one',
    'these',
    'those',
    'them',
    'the same',
    'oita',
    'eita',
    'eta',
    'ota',
    'sheta',
    'seta',
    'oi ta',
    'ei ta',
    'oigula',
    'eigula',
    'egula',
    'ogula',
    'এটা',
    'ওটা',
    'সেটা',
    'ঐটা',
    'এইটা',
    'ওইটা',
    'এগুলো',
    'ওগুলো',
    'সেগুলো'
  ])
]

const ORDINALS: Term[] = [
  phrases('1', ['first', '1st', 'prothom', 'প্রথম']),
  phrases('2', ['second', '2nd', 'ditiyo', 'dwitiyo', 'ditio', 'দ্বিতীয়']),
  phrases('3', ['third', '3rd', 'tritiyo', 'তৃতীয়']),
  phrases('4', ['fourth', '4th', 'choturtho', 'চতুর্থ']),
  phrases('5', ['fifth', '5th', 'ponchom', 'পঞ্চম']),
  phrases('-1', ['last', 'shesh', 'শেষ', 'শেষের'])
]
const ORDINAL_NUMBER = word('(\\d)\\s(?:no|number|nombor|নম্বর)')

function readSizes(text: string): string[] {
  const sizes = new Set<string>()
  for (const pattern of [SIZE_AFTER_WORD, SIZE_BEFORE_WORD, BIG_SIZE]) {
    const value = pattern.exec(text)?.[1]
    if (value) sizes.add(value === '2xl' ? 'XXL' : value.toUpperCase())
  }
  const age = AGE.exec(text)?.[1]
  if (age) {
    const years = Number(age)
    const index = Math.max(0, Math.floor(years / 2) - 1)
    if (years >= 1 && years <= 11) sizes.add(AGE_SIZES[Math.min(index, 4)] ?? '2-3Y')
  }
  return [...sizes]
}

function readPrices(text: string): {minPrice?: number; maxPrice?: number} {
  const range = RANGE.exec(text)
  if (range) return {minPrice: Number(range[1]), maxPrice: Number(range[2])}
  const max = MAX_BEFORE.exec(text)?.[1] ?? MAX_AFTER.exec(text)?.[1]
  const min = MIN_BEFORE.exec(text)?.[1] ?? MIN_AFTER.exec(text)?.[1]
  return {
    ...(min !== undefined && {minPrice: Number(min)}),
    ...(max !== undefined && {maxPrice: Number(max)})
  }
}

export function extractEntities(text: string): Entities {
  let normal = normalize(text)
  const entities: Entities = {
    places: [],
    colors: [],
    categories: [],
    styles: [],
    collections: [],
    sizes: [],
    reference: false
  }

  // Order numbers and phones first, and out of the text, so their digits are not read as prices
  const order = ORDER_ID.exec(normal) ?? ORDER_WORD_ID.exec(normal)
  if (order?.[1]) {
    entities.orderId = `NDI-${order[1]}`
    normal = normal.replace(order[0], ' ')
  }
  const phone = PHONE.exec(normal)
  if (phone?.[1]) {
    entities.phone = phone[1].replace(/\s/g, '')
    normal = normal.replace(phone[0], ' ')
  }
  normal = normal
    .replace(THOUSANDS, (_, amount: string) => String(Number(amount) * 1000))
    .replace(/\s+/g, ' ')
    .trim()
  const tokens = normal ? normal.split(' ') : []

  entities.places = matchTerms(tokens, PLACES)
  entities.colors = matchTerms(tokens, COLORS).map((term) => term.key)
  entities.categories = matchTerms(tokens, CATEGORIES).map((term) => term.key)
  entities.styles = matchTerms(tokens, MATCHABLE_STYLES).map((term) => term.key)
  entities.collections = matchTerms(tokens, COLLECTIONS).map((term) => term.key)
  entities.sizes = readSizes(normal)
  Object.assign(entities, readPrices(normal))

  const ordinal = matchTerms(tokens, ORDINALS)[0]?.key ?? ORDINAL_NUMBER.exec(normal)?.[1]
  if (ordinal !== undefined) entities.ordinal = Number(ordinal)
  entities.reference = entities.ordinal !== undefined || matchTerms(tokens, REFERENCES).length > 0
  return entities
}
