import type {Lang, LanguageEvidence} from '../shared/api.js'
import {PLACES} from '../shop/places.js'
import {CATEGORIES, COLLECTIONS, COLORS, STYLES} from '../shop/vocab.js'

export type {Lang, LanguageEvidence}

const BENGALI_CHAR = /[ঀ-৿]/g
const LATIN_CHAR = /[A-Za-z]/g

// Common Bengali words as people type them in Latin letters. Product names are left out on
// purpose, because "nakshi kantha" or "panjabi" also appear in English questions. Words that are
// also everyday English ("age", "tin", "char", "pore") are left out too. Particles such as "e"
// (in, to) and "r" (of) are in: "Sylhet e delivery koto?" is Banglish.
const BANGLISH_WORDS = new Set(
  (
    'ami amar amake amra amader apni apnar apnake apnara apnader tumi tomar tomake tomra tader ' +
    'e te ar na ta tar r ' +
    'ki keno kemon koto kotodin koyta kobe kothay kokhon kivabe kibhabe ke kar ' +
    'ache achhe ase nai nei hobe hoy hoye hoyeche hocche hoise ' +
    'korbo korte kore koren korun kora korechi korsi chai chacchi lagbe lage ' +
    'dite diben deben debo dibo dao pabo pai paben pete jabe jete jaben ' +
    'theke porjonto jonno shathe sathe moddhe er ' +
    'dam daam kinte kinbo kinle kena ferot ferat bodlate bodol rong kapor jama ' +
    'baire bhitore vitore pathan pathaben pathabo bhai vai apu valo bhalo kintu tahole jodi ' +
    'kono kichu ekta duita din ghonta bochor aj kal ajke kalke ekhon onek beshi kom choto boro ' +
    'notun dekhte dekhan bolun bolen janaben janan jante dorkar lagche nibo niben neya deya ' +
    'asbe asche khule khole bondho shukrobar shonibar robibar thaki thake bujhbo bujhte malik ' +
    'dokan shob sob gula gulo dekhao parbo parben pari jay jabena bidesh bideshe pathano ' +
    'kinar kenar por pore bodlano bodle diye je jeta korechen korechi setao eto'
  ).split(' ')
)

// Words of the shop and its trade, which Bangla speakers write in English letters too:
// "Ketoki cotton panjabi 42 size ache?" is Banglish, and only "ache" can say so.
const LOANWORDS =
  'order orders delivery charge phone number mobile size product return exchange cash details ' +
  'payment discount showroom parcel courier taka tk free design color colour stock price online ' +
  'bkash nagad card ndi'
const NEUTRAL = new Set(
  [
    LOANWORDS,
    ...[CATEGORIES, STYLES, COLORS, COLLECTIONS, PLACES]
      .flat()
      .flatMap((term) => [term.en, ...term.spellings])
  ]
    .flatMap((text) => text.toLowerCase().match(/[a-z]+/g) ?? [])
    .filter((word) => !BANGLISH_WORDS.has(word))
)
const isNeutral = (word: string) =>
  NEUTRAL.has(word) || (word.endsWith('s') && NEUTRAL.has(word.slice(0, -1)))

/** Share of letters that must be Bengali script for a message to count as Bangla */
const BENGALI_SHARE = 0.4
/** Share of Latin words that must be Banglish words, unless at least two of them appear */
const BANGLISH_SHARE = 0.3

/**
 * Tells Bangla script, Banglish and English apart. Bangla is decided by script alone. For Latin
 * text, Banglish needs either two words from the list above or a third of all words.
 */
export function detectLanguage(text: string): Lang {
  return explainLanguage(text).lang
}

/** The language, and why: what the inspector shows */
export function explainLanguage(text: string): LanguageEvidence {
  const bengali = text.match(BENGALI_CHAR)?.length ?? 0
  const latin = text.match(LATIN_CHAR)?.length ?? 0
  const bengaliShare = bengali + latin > 0 ? bengali / (bengali + latin) : 0
  const words = text.toLowerCase().match(/[a-z]+/g) ?? []
  const banglishWords = words.filter((word) => BANGLISH_WORDS.has(word))
  const evidence = (lang: Lang): LanguageEvidence => ({lang, bengaliShare, banglishWords})

  if (bengali > 0 && bengaliShare >= BENGALI_SHARE) return evidence('bn')
  // Shop words count for neither language
  const counted = words.filter((word) => BANGLISH_WORDS.has(word) || !isNeutral(word))
  if (counted.length === 0) return evidence('en')
  const hits = banglishWords.length
  if (hits >= 2 || hits / counted.length >= BANGLISH_SHARE) return evidence('banglish')
  return evidence('en')
}

/** A phone number alone says nothing about the customer's language */
export function hasLetters(text: string): boolean {
  return BENGALI_LETTER.test(text) || /[A-Za-z]/.test(text)
}

const BENGALI_LETTER = /[অ-হ]/

/**
 * Too few words to tell the language: a place, a size, an order number and a phone. The
 * conversation's language stands then, so "Rajshahi" after a Banglish question stays Banglish.
 */
export function saysLittle(text: string): boolean {
  if (BENGALI_LETTER.test(text)) return false
  const words = text.toLowerCase().match(/[a-z]+/g) ?? []
  return words.filter((word) => BANGLISH_WORDS.has(word) || !isNeutral(word)).length <= 1
}
