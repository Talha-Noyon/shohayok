import {describe, expect, it} from 'vitest'

import {detectLanguage, explainLanguage, hasLetters, saysLittle} from '../src/lang/detect.js'

describe('detectLanguage', () => {
  it.each(['ঢাকার বাইরে ডেলিভারি চার্জ কত?', 'জামদানি শাড়ির দাম কত?', 'delivery চার্জ কত?'])(
    'reads Bengali script as Bangla: %s',
    (text) => {
      expect(detectLanguage(text)).toBe('bn')
    }
  )

  it.each([
    'dhakar moddhe delivery charge koto?',
    'cash on delivery ache? ami khulnay thaki',
    'tangail sharee er dam koto?',
    'nakshi kantha ache?',
    'bkash e payment kora jabe?',
    'shukrobar showroom kokhon khole?',
    '10 ta panjabi kinle discount pabo?',
    'Sylhet e delivery charge koto?',
    'jamdani r dam koto?'
  ])('reads Bengali in Latin letters as Banglish: %s', (text) => {
    expect(detectLanguage(text)).toBe('banglish')
  })

  it.each([
    'How much is delivery inside Dhaka?',
    'Can I pay cash when the parcel arrives?',
    'Do you have nakshi kantha?',
    'Is জামদানি available in red?',
    'Do you sell silk panjabi for Eid?'
  ])('keeps English as English: %s', (text) => {
    expect(detectLanguage(text)).toBe('en')
  })

  it('treats text without letters as English', () => {
    expect(detectLanguage('')).toBe('en')
    expect(detectLanguage('123 ??')).toBe('en')
  })
})

describe('explainLanguage', () => {
  it('shows why: the share of Bengali script and the Banglish words found', () => {
    expect(explainLanguage('delivery charge koto?')).toEqual({
      lang: 'banglish',
      bengaliShare: 0,
      banglishWords: ['koto']
    })
    expect(explainLanguage('জামদানি শাড়ি').bengaliShare).toBe(1)
  })

  it('knows when a message has no letters to go by', () => {
    expect(hasLetters('01012345678')).toBe(false)
    expect(hasLetters('NDI-10024')).toBe(true)
  })
})

describe('shop words', () => {
  it.each([
    ['Ketoki cotton panjabi 42 size ache?', 'banglish'],
    ['jamdani sharee dekhao', 'banglish'],
    ['product return korte parbo?', 'banglish'],
    ['cash on delivery ache?', 'banglish'],
    ['bidesh e pathano jay?', 'banglish'],
    ['kinar por size bodlano jabe?', 'banglish'],
    ['Any lungi under 400 taka?', 'en'],
    ['Show me red sharees under 3000 taka', 'en'],
    ['Is cash on delivery available outside Dhaka?', 'en'],
    ['Ketoki Jamdani Sharee price?', 'en']
  ])('count for neither language: %s is %s', (text, lang) => {
    expect(detectLanguage(text)).toBe(lang)
  })
})

describe('saysLittle', () => {
  it.each(['Rajshahi', 'NDI-10298, phone 01000000001', '01000000002', 'XL'])(
    'finds too few words to tell the language in %s',
    (text) => {
      expect(saysLittle(text)).toBe(true)
    }
  )

  it.each(['And to Uttara?', 'ধন্যবাদ', 'Hi there', 'koto?'.repeat(1) + ' bhai'])(
    'finds enough in %s',
    (text) => {
      expect(saysLittle(text)).toBe(false)
    }
  )
})
