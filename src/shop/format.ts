import type {Lang} from '../lang/detect.js'
import {toBengaliDigits} from '../lang/digits.js'
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
