import {deliveryFee} from './delivery.js'
import {listWords} from './format.js'
import {PLACES, placeOf, type Zone} from './places.js'
import {createRandom, type Random} from './random.js'
import type {Bilingual, Order, OrderItem, OrderStatus, Payment, Product} from './schema.js'
import {
  categoryOf,
  COLLECTIONS,
  COLORS,
  OCCASIONS,
  SIZE_SYSTEMS,
  STYLES,
  type Category,
  type CategoryKey,
  type Offer,
  type Style,
  type Term
} from './vocab.js'

export const SEED = 2026
export const ORDER_COUNT = 300
/** Every generated timeline ends by this moment. Ingest moves all dates so that it becomes now. */
export const GENERATED_AT = Date.UTC(2026, 10, 26, 6, 0, 0)

export interface Shop {
  products: Product[]
  orders: Order[]
}

export interface DemoOrder {
  id: string
  phone: string
  status: OrderStatus
  place: string
  /** Hours before GENERATED_AT that the order was placed, enough to reach its status */
  placedHoursAgo: number
}

/** Orders the page suggests trying. They are the last three, so they are also the newest. */
export const DEMO_ORDERS: readonly DemoOrder[] = [
  {id: 'NDI-10298', phone: '01000000001', status: 'delivered', place: 'mirpur', placedHoursAgo: 96},
  {id: 'NDI-10299', phone: '01000000002', status: 'shipped', place: 'sylhet', placedHoursAgo: 60},
  {
    id: 'NDI-10300',
    phone: '01000000003',
    status: 'confirmed',
    place: 'chattogram',
    placedHoursAgo: 10
  }
]

export function generateShop(seed = SEED): Shop {
  const random = createRandom(seed)
  const products = makeProducts(random)
  return {products, orders: makeOrders(random, products)}
}

// Products

type Phrase = Bilingual

const SHAREE_MOTIFS: Phrase[] = [
  {en: 'small buti all over', bn: 'সারা জমিনে ছোট ছোট বুটি'},
  {en: 'a wide woven border', bn: 'চওড়া বোনা পাড়'},
  {en: 'a floral anchal', bn: 'ফুলের নকশার আঁচল'},
  {en: 'paisley motifs', bn: 'কলকা নকশা'},
  {en: 'a zari border', bn: 'জরির পাড়'},
  {en: 'fine stripes', bn: 'সরু ডোরা'},
  {en: 'a contrast border', bn: 'কনট্রাস্ট রঙের পাড়'},
  {en: 'geometric patterns', bn: 'জ্যামিতিক নকশা'}
]

const CLOTHING_MOTIFS: Phrase[] = [
  {en: 'floral motifs', bn: 'ফুলের নকশা'},
  {en: 'paisley motifs', bn: 'কলকা নকশা'},
  {en: 'geometric patterns', bn: 'জ্যামিতিক নকশা'},
  {en: 'embroidery on the neckline', bn: 'গলায় এমব্রয়ডারি'},
  {en: 'pintuck detailing on the front', bn: 'সামনে পিনটাক নকশা'},
  {en: 'contrast piping on a plain body', bn: 'সাদামাটা জমিনে কনট্রাস্ট পাইপিং'}
]

const WRAP_MOTIFS: Phrase[] = [
  {en: 'floral motifs', bn: 'ফুলের নকশা'},
  {en: 'paisley motifs', bn: 'কলকা নকশা'},
  {en: 'geometric patterns', bn: 'জ্যামিতিক নকশা'},
  {en: 'tassels on both ends', bn: 'দুই প্রান্তে ঝালর'}
]

const CHECKS: Phrase = {en: 'classic checks', bn: 'ক্লাসিক চেক'}

const MOTIFS_BY_CATEGORY: Record<CategoryKey, Phrase[]> = {
  sharee: SHAREE_MOTIFS,
  panjabi: CLOTHING_MOTIFS,
  'three-piece': CLOTHING_MOTIFS,
  kurti: CLOTHING_MOTIFS,
  fatua: CLOTHING_MOTIFS,
  kids: CLOTHING_MOTIFS,
  lungi: [CHECKS, {en: 'bold stripes', bn: 'মোটা ডোরা'}],
  orna: WRAP_MOTIFS,
  shawl: WRAP_MOTIFS,
  gamcha: [CHECKS, {en: 'a striped border', bn: 'ডোরাকাটা পাড়'}]
}

const MOTIFS_BY_STYLE: Record<string, Phrase[]> = {
  'block-print': [
    {en: 'block-printed leaves', bn: 'ব্লক প্রিন্টের পাতার নকশা'},
    {en: 'block-printed flowers', bn: 'ব্লক প্রিন্টের ফুলের নকশা'}
  ],
  batik: [{en: 'batik waves', bn: 'বাটিকের ঢেউ নকশা'}],
  checked: [CHECKS],
  embroidered: [
    {en: 'hand embroidery on the front', bn: 'সামনে হাতের এমব্রয়ডারি'},
    {en: 'embroidered sleeves and neckline', bn: 'হাতা ও গলায় এমব্রয়ডারি'}
  ],
  printed: [{en: 'an all-over print', bn: 'সারা গায়ে প্রিন্ট'}],
  frock: [{en: 'a gathered skirt and puff sleeves', bn: 'কুঁচি দেওয়া ঘের আর ফোলা হাতা'}]
}

const DETAILS: Record<CategoryKey, Phrase[]> = {
  sharee: [
    {en: '6 yards long, with a matching blouse piece.', bn: '৬ গজ লম্বা, সাথে ম্যাচিং ব্লাউজ পিস।'},
    {en: '6 yards long, without a blouse piece.', bn: '৬ গজ লম্বা, ব্লাউজ পিস নেই।'}
  ],
  panjabi: [
    {en: 'Regular fit with wooden buttons.', bn: 'রেগুলার ফিট, কাঠের বোতাম।'},
    {en: 'Regular fit with metal buttons.', bn: 'রেগুলার ফিট, ধাতব বোতাম।'},
    {en: 'Slim fit with fabric-covered buttons.', bn: 'স্লিম ফিট, কাপড়ে মোড়া বোতাম।'}
  ],
  'three-piece': [
    {
      en: 'Kameez, salwar and orna, stitched and ready to wear.',
      bn: 'কামিজ, সালোয়ার ও ওড়না, সেলাই করা, পরার জন্য তৈরি।'
    }
  ],
  kurti: [
    {en: 'Knee length with three-quarter sleeves.', bn: 'হাঁটু পর্যন্ত লম্বা, থ্রি-কোয়ার্টার হাতা।'},
    {en: 'Hip length with full sleeves.', bn: 'কোমরের নিচ পর্যন্ত লম্বা, ফুল হাতা।'}
  ],
  fatua: [{en: 'Short and loose, with two side pockets.', bn: 'ছোট ও ঢিলেঢালা, দুই পাশে পকেট।'}],
  kids: [
    {
      en: 'Soft on the skin, for children aged 2 to 11.',
      bn: 'ত্বকে নরম, ২ থেকে ১১ বছরের বাচ্চাদের জন্য।'
    }
  ],
  lungi: [
    {
      en: 'Sewn and ready to wear, 2.25 yards long.',
      bn: 'সেলাই করা, পরার জন্য তৈরি, সোয়া দুই গজ লম্বা।'
    }
  ],
  orna: [{en: '2.5 yards long.', bn: 'আড়াই গজ লম্বা।'}],
  shawl: [{en: 'Warm and light, 40 by 80 inches.', bn: 'গরম ও হালকা, ৪০ বাই ৮০ ইঞ্চি।'}],
  gamcha: [{en: 'Soft and quick-drying, 1.5 yards long.', bn: 'নরম ও তাড়াতাড়ি শুকায়, দেড় গজ লম্বা।'}]
}

const ORIGIN_LINES: Record<string, Phrase> = {
  jamdani: {
    en: 'Hand-woven in Rupganj, Narayanganj, the home of jamdani.',
    bn: 'জামদানির আদি ঘর নারায়ণগঞ্জের রূপগঞ্জে হাতে বোনা।'
  },
  tangail: {en: 'Woven on handlooms in Tangail.', bn: 'টাঙ্গাইলের তাঁতে বোনা।'},
  katan: {
    en: 'Woven in the Benarasi Palli of Mirpur, Dhaka.',
    bn: 'ঢাকার মিরপুরের বেনারসি পল্লীতে বোনা।'
  },
  'rajshahi-silk': {en: 'Made from Rajshahi silk.', bn: 'রাজশাহীর রেশমে তৈরি।'},
  muslin: {
    en: 'A revival of Dhakai muslin, woven in Narayanganj.',
    bn: 'নারায়ণগঞ্জে বোনা ঢাকাই মসলিনের নতুন রূপ।'
  },
  tant: {en: 'Woven on the handlooms of Pabna.', bn: 'পাবনার তাঁতে বোনা।'},
  khadi: {en: 'Hand-spun khadi from Cumilla.', bn: 'কুমিল্লার হাতে কাটা সুতার খাদি।'},
  checked: {en: 'Woven in Belkuchi, Sirajganj.', bn: 'সিরাজগঞ্জের বেলকুচিতে বোনা।'}
}

const CARE = {
  dryClean: {en: 'Dry clean only.', bn: 'শুধু ড্রাই ক্লিন করুন।'},
  wool: {
    en: 'Dry clean, or hand wash gently in cold water.',
    bn: 'ড্রাই ক্লিন করুন, অথবা ঠান্ডা পানিতে আলতো করে হাতে ধুয়ে নিন।'
  },
  gentle: {en: 'Hand wash gently in cold water.', bn: 'ঠান্ডা পানিতে আলতো করে হাতে ধুয়ে নিন।'},
  cotton: {
    en: 'Hand wash in cold water and dry in the shade.',
    bn: 'ঠান্ডা পানিতে হাতে ধুয়ে ছায়ায় শুকান।'
  }
} satisfies Record<string, Phrase>

function careFor(style: Style): Phrase {
  if (['jamdani', 'katan', 'rajshahi-silk', 'muslin', 'silk'].includes(style.key)) {
    return CARE.dryClean
  }
  if (['woollen', 'pashmina', 'kashmiri'].includes(style.key)) return CARE.wool
  if (['georgette', 'chiffon'].includes(style.key)) return CARE.gentle
  return CARE.cotton
}

const OCCASIONS_BY_CATEGORY: Record<CategoryKey, string[]> = {
  sharee: ['eid', 'boishakh', 'office'],
  panjabi: ['eid', 'daily'],
  'three-piece': ['eid', 'daily', 'office'],
  kurti: ['daily', 'office'],
  fatua: ['daily', 'boishakh'],
  kids: ['eid', 'boishakh'],
  lungi: ['daily'],
  orna: ['daily', 'eid'],
  shawl: ['winter'],
  gamcha: ['daily']
}

const FESTIVE = ['wedding', 'eid', 'puja']
const OCCASIONS_BY_STYLE: Record<string, string[]> = {
  jamdani: FESTIVE,
  katan: FESTIVE,
  'rajshahi-silk': FESTIVE,
  muslin: FESTIVE,
  silk: ['eid', 'wedding'],
  embroidered: ['eid', 'wedding']
}

function makeProducts(random: Random): Product[] {
  const products: Product[] = []
  for (const style of STYLES) {
    for (const [key, offer] of Object.entries(style.offers) as [CategoryKey, Offer][]) {
      const category = categoryOf(key)
      for (const collection of random.shuffle(COLLECTIONS).slice(0, offer.count)) {
        const id = `P${String(products.length + 1).padStart(3, '0')}`
        products.push(makeProduct(random, id, collection, category, style, offer))
      }
    }
  }
  return products
}

function makeProduct(
  random: Random,
  id: string,
  collection: Term,
  category: Category,
  style: Style,
  offer: Offer
): Product {
  const [min, max] = offer.price
  const price = Math.min(max, Math.max(min, Math.round(random.int(min, max) / 50) * 50))
  const colors = random
    .shuffle(COLORS)
    .slice(0, random.int(1, 3))
    .map((color) => color.key)
  const sizes = [...SIZE_SYSTEMS[category.sizes]]
  const variants = colors.flatMap((color) =>
    sizes.map((size) => ({
      sku: `${id}-${color}-${size.toLowerCase().replace(/\s+/g, '-')}`,
      color,
      size,
      stock: random.chance(0.15) ? 0 : random.int(1, 20)
    }))
  )

  const choices = OCCASIONS_BY_STYLE[style.key] ?? OCCASIONS_BY_CATEGORY[category.key]
  const occasions = choices.slice(0, random.int(1, Math.min(2, choices.length)))
  const motif = random.pick(MOTIFS_BY_STYLE[style.key] ?? MOTIFS_BY_CATEGORY[category.key])
  const detail = random.pick(DETAILS[category.key])
  const origin = ORIGIN_LINES[style.key]

  const sentences = (lang: 'en' | 'bn') =>
    [
      lang === 'en'
        ? `${capitalize(style.fabric.en)} with ${motif.en}.`
        : `${genitive(style.fabric.bn)} কাপড়ে ${motif.bn}।`,
      origin?.[lang],
      detail[lang],
      occasionLine(category.key, occasions)[lang]
    ]
      .filter(Boolean)
      .join(' ')

  return {
    id,
    collection: collection.key,
    category: category.key,
    style: style.key,
    name: productName(collection, category, style),
    fabric: {...style.fabric},
    price,
    colors,
    sizes,
    occasions,
    origin: style.origin,
    description: {en: sentences('en'), bn: sentences('bn')},
    care: {...careFor(style)},
    variants
  }
}

function productName(collection: Term, category: Category, style: Style): Bilingual {
  if (category.key === 'kids') {
    return {en: `${collection.en} Kids ${style.en}`, bn: `${collection.bn} বাচ্চাদের ${style.bn}`}
  }
  return {
    en: `${collection.en} ${style.en} ${category.en}`,
    bn: `${collection.bn} ${style.bn} ${category.bn}`
  }
}

function occasionLine(category: CategoryKey, keys: string[]): Phrase {
  if (category === 'gamcha') return {en: 'For everyday use.', bn: 'প্রতিদিনের ব্যবহারের জন্য।'}
  const occasions = keys.map((key) => OCCASIONS.find((occasion) => occasion.key === key))
  const en = listWords(
    occasions.map((occasion) => occasion?.en ?? ''),
    'en'
  )
  if (category === 'shawl') return {en: `Made for ${en}.`, bn: 'শীতে গায়ে জড়ানোর মতো।'}
  const bn = listWords(
    occasions.map((occasion) => occasion?.bnAt ?? ''),
    'bn'
  )
  return {en: `Made for ${en}.`, bn: `${bn} পরার মতো।`}
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Bengali vowels, and the vowel signs that follow a consonant */
function endsInVowel(word: string): boolean {
  const code = word.codePointAt(word.length - 1) ?? 0
  return (code >= 0x0985 && code <= 0x0994) || (code >= 0x09be && code <= 0x09cc)
}

/** "সুতি" becomes "সুতির", "সিল্ক" becomes "সিল্কের" */
export function genitive(word: string): string {
  return endsInVowel(word) ? `${word}র` : `${word}ের`
}

// Orders

const HOUR = 3_600_000
const DAY = 24 * HOUR
const ORDER_SPAN_DAYS = 45

const CITY_AREAS = PLACES.filter((place) => place.kind === 'area' && place.zone === 'dhaka')
const OUTSKIRTS = PLACES.filter((place) => place.kind === 'area' && place.zone === 'outside')
const OTHER_DISTRICTS = PLACES.filter((place) => place.kind === 'district' && place.key !== 'dhaka')

const PAYMENT_WEIGHTS: [Payment, number][] = [
  ['cod', 50],
  ['bkash', 25],
  ['nagad', 15],
  ['card', 10]
]

const OUTSIDE_COURIERS = ['Dhrubo Express', 'Padma Courier']

function makeOrders(random: Random, products: Product[]): Order[] {
  const phones = new Set(DEMO_ORDERS.map((demo) => demo.phone))
  const regular = ORDER_COUNT - DEMO_ORDERS.length
  const placedTimes = Array.from(
    {length: regular},
    () => GENERATED_AT - 3 * HOUR - random.next() * ORDER_SPAN_DAYS * DAY
  ).sort((a, b) => a - b)

  const orders: Order[] = []
  for (let i = 0; i < ORDER_COUNT; i++) {
    const id = `NDI-${10001 + i}`
    const demo = DEMO_ORDERS.find((item) => item.id === id)
    const place = demo ? placeKeys(demo.place) : pickPlace(random)
    const zone = placeOf(place.area ?? place.district).zone
    const placedAt = demo
      ? GENERATED_AT - demo.placedHoursAgo * HOUR
      : (placedTimes[i] ?? GENERATED_AT)
    const timeline = demo
      ? makeTimeline(random, placedAt, zone, 'complete', demo.status)
      : makeTimeline(random, placedAt, zone, pickOutcome(random))
    const status = timeline.at(-1)?.status ?? 'placed'

    const items = pickItems(random, products)
    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0)
    const fee = deliveryFee(zone, subtotal)
    const shipped = timeline.some((step) => step.status === 'shipped')
    orders.push({
      id,
      phone: demo?.phone ?? newPhone(random, phones),
      district: place.district,
      area: place.area,
      items,
      subtotal,
      deliveryFee: fee,
      total: subtotal + fee,
      payment: weighted(random, PAYMENT_WEIGHTS),
      status,
      timeline: timeline.map((step) => ({
        status: step.status,
        at: new Date(step.at).toISOString()
      })),
      courier: shipped
        ? zone === 'dhaka'
          ? 'Nodi Rider'
          : random.pick(OUTSIDE_COURIERS)
        : undefined,
      placedAt: new Date(placedAt).toISOString()
    })
  }
  return orders
}

function placeKeys(key: string): {district: string; area?: string} {
  const place = placeOf(key)
  return place.kind === 'area'
    ? {district: place.district ?? 'dhaka', area: place.key}
    : {district: key}
}

function pickPlace(random: Random): {district: string; area?: string} {
  const roll = random.next()
  if (roll < 0.4) return placeKeys(random.pick(CITY_AREAS).key)
  if (roll < 0.48) return placeKeys(random.pick(OUTSKIRTS).key)
  return {district: random.pick(OTHER_DISTRICTS).key}
}

type Outcome = 'complete' | 'cancelled' | 'returned'

function pickOutcome(random: Random): Outcome {
  const roll = random.next()
  if (roll < 0.08) return 'cancelled'
  if (roll < 0.14) return 'returned'
  return 'complete'
}

interface Step {
  status: OrderStatus
  at: number
}

/** The usual path of a parcel, with how many hours each step takes */
function happyPath(zone: Zone): [OrderStatus, [number, number]][] {
  return [
    ['confirmed', [1, 6]],
    ['packed', [4, 20]],
    ['shipped', [6, 24]],
    ['out_for_delivery', zone === 'dhaka' ? [6, 20] : [40, 90]],
    ['delivered', [2, 8]]
  ]
}

/** Builds the steps up to the outcome, then drops any step after GENERATED_AT */
function makeTimeline(
  random: Random,
  placedAt: number,
  zone: Zone,
  outcome: Outcome,
  stopAt?: OrderStatus
): Step[] {
  const after = (at: number, [min, max]: [number, number]) =>
    at + (min + random.next() * (max - min)) * HOUR
  const steps: Step[] = [{status: 'placed', at: placedAt}]
  let at = placedAt

  if (outcome === 'cancelled') {
    if (random.chance(0.5)) {
      at = after(at, [1, 6])
      steps.push({status: 'confirmed', at})
    }
    steps.push({status: 'cancelled', at: after(at, [2, 20])})
  } else {
    for (const [status, hours] of happyPath(zone)) {
      at = after(at, hours)
      steps.push({status, at})
      if (status === stopAt) break
    }
    if (outcome === 'returned') steps.push({status: 'returned', at: after(at, [48, 120])})
  }
  return steps.filter((step) => step.at <= GENERATED_AT)
}

function pickItems(random: Random, products: Product[]): OrderItem[] {
  const roll = random.next()
  const count = roll < 0.6 ? 1 : roll < 0.9 ? 2 : 3
  return random
    .shuffle(products)
    .slice(0, count)
    .map((product) => {
      const variant = random.pick(product.variants)
      return {
        productId: product.id,
        sku: variant.sku,
        name: {...product.name},
        color: variant.color,
        size: variant.size,
        qty: random.chance(0.15) ? 2 : 1,
        price: product.price
      }
    })
}

function newPhone(random: Random, used: Set<string>): string {
  for (;;) {
    const phone = `010${String(random.int(0, 99_999_999)).padStart(8, '0')}`
    if (!used.has(phone)) {
      used.add(phone)
      return phone
    }
  }
}

function weighted<T>(random: Random, options: [T, number][]): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = random.next() * total
  for (const [value, weight] of options) {
    roll -= weight
    if (roll < 0) return value
  }
  return options[options.length - 1]?.[0] as T
}
