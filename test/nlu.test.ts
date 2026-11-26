import {describe, expect, it} from 'vitest'

import {extractEntities, type Entities} from '../src/nlu/entities.js'
import {detectIntents, type Intent} from '../src/nlu/intents.js'
import {matchTerms} from '../src/nlu/match.js'
import {normalize, tokenize} from '../src/nlu/normalize.js'
import {PLACES} from '../src/shop/places.js'
import {COLORS, type Term} from '../src/shop/vocab.js'

describe('normalize', () => {
  it('lowercases, turns Bengali digits and punctuation into plain text', () => {
    expect(normalize('আমার অর্ডার ১০০২৪ কোথায়?')).toBe(normalize('আমার অর্ডার 10024 কোথায়'))
    expect(normalize("Cox's Bazar, please!")).toBe('coxs bazar please')
    expect(normalize('three-piece  5,000 taka।')).toBe('three piece 5000 taka')
  })

  it('splits into words', () => {
    expect(tokenize('Lal  sharee ache?')).toEqual(['lal', 'sharee', 'ache'])
  })
})

describe('matchTerms', () => {
  const keys = (text: string, terms: readonly Term[] = PLACES) =>
    matchTerms(tokenize(text), terms).map((term) => term.key)

  it('reads Bengali and Banglish case endings', () => {
    expect(keys('সিলেটে পাঠাবেন')).toEqual(['sylhet'])
    expect(keys('ঢাকার ভিতরে')).toEqual(['inside-dhaka'])
    expect(keys('mirpure ki deliver koren')).toEqual(['mirpur'])
    expect(keys('dhakay thaki')).toEqual(['dhaka'])
  })

  it('prefers the longest phrase', () => {
    expect(keys('dhakar baire koto din')).toEqual(['outside-dhaka'])
    expect(keys('navy blue', COLORS)).toEqual(['navy'])
    expect(keys('sky blue', COLORS)).toEqual(['sky-blue'])
  })

  it('does not find a word inside a longer one', () => {
    expect(keys('লালবাগে', COLORS)).toEqual([])
    expect(keys('lalmonirhat', COLORS)).toEqual([])
  })
})

describe('extractEntities', () => {
  const cases: [string, Partial<Entities>][] = [
    ['NDI-10024 er status ki?', {orderId: 'NDI-10024'}],
    ['amar order ndi 10024, phone 01012345678', {orderId: 'NDI-10024', phone: '01012345678'}],
    ['আমার অর্ডার ১০০২৪ কোথায়? ফোন ০১০১২৩৪৫৬৭৮', {orderId: 'NDI-10024', phone: '01012345678'}],
    ['my number is +88 010-1234-5678', {phone: '01012345678'}],
    [
      'lal jamdani sharee 5000 er niche',
      {colors: ['red'], styles: ['jamdani'], categories: ['sharee'], maxPrice: 5000}
    ],
    ['নীল পাঞ্জাবি ৩০০০ টাকার মধ্যে', {colors: ['blue'], categories: ['panjabi'], maxPrice: 3000}],
    [
      'silk panjabi between 3000 and 6000',
      {styles: ['silk'], categories: ['panjabi'], minPrice: 3000, maxPrice: 6000}
    ],
    ['kurti over 1,500 taka', {categories: ['kurti'], minPrice: 1500}],
    ['sharee 5k er moddhe', {categories: ['sharee'], maxPrice: 5000}],
    ['২ হাজার টাকার নিচে কুর্তি', {categories: ['kurti'], maxPrice: 2000}],
    ['ketoki jamdani XL e ache?', {collections: ['ketoki'], styles: ['jamdani'], sizes: ['XL']}],
    ['size 42 er panjabi', {categories: ['panjabi'], sizes: ['42']}],
    ['5 bochorer bacchar frock', {categories: ['kids'], styles: ['frock'], sizes: ['4-5Y']}],
    ['navy blue three-piece', {colors: ['navy'], categories: ['three-piece']}],
    ['off-white panjabi', {colors: ['off-white'], categories: ['panjabi']}],
    ['oitar dam koto?', {reference: true}],
    ['2nd tar dam koto?', {reference: true, ordinal: 2}],
    ['দ্বিতীয়টার দাম কত?', {reference: true, ordinal: 2}],
    ['the last one in red', {reference: true, ordinal: -1, colors: ['red']}],
    ['Is it available in sky blue?', {reference: true, colors: ['sky-blue']}]
  ]

  it.each(cases)('reads %s', (text, expected) => {
    expect(extractEntities(text)).toMatchObject(expected)
  })

  it('finds places in every script and spelling', () => {
    const places = (text: string) => extractEntities(text).places.map((place) => place.key)
    expect(places('Sylhet e delivery charge koto?')).toEqual(['sylhet'])
    expect(places("Cox's Bazar e pathaben?")).toEqual(['coxs-bazar'])
    expect(places('ctg te koto din')).toEqual(['chattogram'])
    expect(places('লালবাগে ডেলিভারি')).toEqual(['lalbagh'])
  })

  it('tells Tangail the district from Tangail the sharee', () => {
    expect(extractEntities('tangail sharee er dam koto?')).toMatchObject({
      places: [],
      styles: ['tangail']
    })
    const district = extractEntities('Tangail e delivery charge koto?')
    expect(district.places.map((place) => place.key)).toEqual(['tangail'])
    expect(district.styles).toEqual([])
    expect(extractEntities('rajshahi silk sharee')).toMatchObject({
      places: [],
      styles: ['rajshahi-silk']
    })
  })

  it('reads nothing into a plain question', () => {
    expect(extractEntities('What is your return policy?')).toEqual({
      places: [],
      colors: [],
      categories: [],
      styles: [],
      collections: [],
      sizes: [],
      reference: false
    })
  })

  it('does not read an order number as a phone number', () => {
    expect(extractEntities('NDI-10024 01012345678')).toMatchObject({
      orderId: 'NDI-10024',
      phone: '01012345678'
    })
    expect(extractEntities('NDI-10024').phone).toBeUndefined()
  })

  it('does not read a price as a size or a size as a price', () => {
    const entities = extractEntities('size 40 panjabi 3000 takar moddhe')
    expect(entities).toMatchObject({sizes: ['40'], maxPrice: 3000})
  })
})

describe('detectIntents', () => {
  const cases: [string, Intent[]][] = [
    ['Sylhet e delivery charge koto?', ['delivery']],
    ['How long does delivery to Chittagong take?', ['delivery']],
    ['koto din lage khulnay?', ['delivery']],
    ['সিলেটে ডেলিভারি চার্জ কত?', ['delivery']],
    ['Is delivery free over 3000?', ['delivery']],
    ['amar order kothay?', ['order_status']],
    ['parcel ekhono pai ni', ['order_status']],
    ['NDI-10024', ['order_status']],
    ['অর্ডারটা কোথায় আছে?', ['order_status']],
    ['manusher sathe kotha bolte chai', ['human']],
    ['মানুষের সাথে কথা বলতে চাই', ['human']],
    ['call me please', ['human']],
    ['assalamu alaikum', ['greeting']],
    ['dhonnobad', ['thanks']],
    ['lal jamdani dekhan', ['browse']],
    ['জামদানি শাড়ি দেখান', ['browse']],
    ['ketoki jamdani er dam koto?', ['price']],
    ['XL size stock e ache?', ['stock']]
  ]

  it.each(cases)('finds the intent in %s', (text, intents) => {
    const found = detectIntents(text, extractEntities(text))
    for (const intent of intents) expect([...found]).toContain(intent)
  })

  it('does not take cash on delivery for a delivery question', () => {
    const text = 'Can I pay cash on delivery?'
    expect([...detectIntents(text, extractEntities(text))]).not.toContain('delivery')
  })

  it('does not take placing an order for asking where one is', () => {
    const text = 'How do I place an order?'
    expect([...detectIntents(text, extractEntities(text))]).not.toContain('order_status')
  })
})
