import type {Lang} from '../lang/detect.js'
import {toBengaliDigits} from '../lang/digits.js'
import type {Place} from './places.js'
import {COLORS, termOf} from './vocab.js'

const AND: Record<Lang, string> = {en: 'and', bn: 'ও', banglish: 'ar'}

/** "a, b and c", with the word for "and" in each language */
export function listWords(words: string[], lang: Lang): string {
  if (words.length <= 1) return words[0] ?? ''
  return `${words.slice(0, -1).join(', ')} ${AND[lang]} ${words.at(-1)}`
}

export function money(amount: number, lang: Lang): string {
  const grouped = amount.toLocaleString('en-US')
  if (lang === 'bn') return `${toBengaliDigits(grouped)} টাকা`
  if (lang === 'banglish') return `${grouped} taka`
  return `Tk ${grouped}`
}

const AGE = /^(\d+)-(\d+)Y$/

export function sizeLabel(size: string, lang: Lang): string {
  if (size === 'Free size') {
    return lang === 'bn' ? 'ফ্রি সাইজ' : lang === 'banglish' ? 'free size' : 'Free size'
  }
  const age = AGE.exec(size)
  if (age) {
    const [, from, to] = age
    if (lang === 'bn') return toBengaliDigits(`${from}–${to} বছর`)
    if (lang === 'banglish') return `${from}-${to} bochor`
    return `${from}–${to} years`
  }
  return lang === 'bn' ? toBengaliDigits(size) : size
}

/** Banglish uses the first Latin spelling customers type, like "lal" for red */
export function colorName(key: string, lang: Lang): string {
  const color = termOf(COLORS, key)
  if (lang === 'bn') return color.bn
  if (lang === 'banglish') return color.spellings[0] ?? color.en.toLowerCase()
  return color.en
}

/** "5,000", in Bengali digits for Bangla */
export function amount(value: number, lang: Lang): string {
  const grouped = value.toLocaleString('en-US')
  return lang === 'bn' ? toBengaliDigits(grouped) : grouped
}

/** A day in Dhaka time: "24 Nov", "২৪ নভেম্বর", "24 November" */
export function dateLabel(iso: string, lang: Lang): string {
  const date = new Date(iso)
  if (lang === 'bn') {
    return new Intl.DateTimeFormat('bn-BD', {
      day: 'numeric',
      month: 'long',
      timeZone: 'Asia/Dhaka'
    }).format(date)
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: lang === 'en' ? 'short' : 'long',
    timeZone: 'Asia/Dhaka'
  }).format(date)
}

/** "010•••••678": enough to recognise the number, not enough to copy it */
export function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)}•••••${phone.slice(-3)}`
}

function endsInVowel(word: string): boolean {
  const code = word.codePointAt(word.length - 1) ?? 0
  return (code >= 0x0985 && code <= 0x0994) || (code >= 0x09be && code <= 0x09cc)
}

/**
 * The Bengali locative, "in" or "to" a place: ঢাকা becomes ঢাকায়, সিলেট সিলেটে, রাজশাহী রাজশাহীতে
 */
export function bengaliLocative(word: string): string {
  const base = word.endsWith('ঁ') ? word.slice(0, -1) : word
  if (base.endsWith('া')) return `${word}য়`
  if (endsInVowel(base)) return `${word}তে`
  return `${word}ে`
}

/** "in Sylhet" as each language says it. Regions such as "inside Dhaka" already say it. */
export function placeIn(place: Place, lang: Lang): string {
  if (lang === 'bn') return place.kind === 'region' ? place.bn : bengaliLocative(place.bn)
  if (lang === 'banglish') return place.kind === 'region' ? place.en : `${place.en} e`
  return place.kind === 'region' ? place.en : `to ${place.en}`
}
