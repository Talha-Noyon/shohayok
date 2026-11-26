import type {Term} from '../shop/vocab.js'
import {normalize} from './normalize.js'

/** Endings Bengali puts on a word: "সিলেটে", "লালটা", "ঢাকার", "মানুষের" */
const BENGALI_SUFFIXES = [
  'টা',
  'টি',
  'টার',
  'টির',
  'টাতে',
  'টায়',
  'র',
  'এর',
  'ের',
  'ে',
  'য়',
  'তে',
  'গুলো',
  'গুলি',
  'গুলোর',
  'দের',
  'ও',
  'ই',
  'কে',
  'রা'
].map((suffix) => suffix.normalize('NFC'))

/** The same endings as people type them in Latin letters: "sylhete", "lalta", "dhakar" */
const LATIN_SUFFIXES = [
  'ta',
  'ti',
  'tar',
  'tir',
  'r',
  'er',
  'e',
  'y',
  'te',
  'gula',
  'gulo',
  's',
  'es',
  'o',
  'i',
  'ke',
  'der'
]

const BENGALI = /[ঀ-৿]/

interface Variant<T extends Term> {
  term: T
  tokens: string[]
  length: number
}

const cache = new WeakMap<readonly Term[], Variant<Term>[]>()

/** Every spelling of every term, longest phrase first, so the first match is the best one */
function variantsOf<T extends Term>(terms: readonly T[]): Variant<T>[] {
  const cached = cache.get(terms)
  if (cached) return cached as Variant<T>[]
  const variants = terms
    .flatMap((term) => {
      const spellings = new Set(
        [term.en, term.bn, ...term.spellings].map(normalize).filter(Boolean)
      )
      return [...spellings].map((spelling) => ({
        term,
        tokens: spelling.split(' '),
        length: spelling.length
      }))
    })
    .sort((a, b) => b.tokens.length - a.tokens.length || b.length - a.length)
  cache.set(terms, variants)
  return variants
}

/** A word matches a spelling exactly, or with a case ending, if the spelling is long enough */
function wordMatches(word: string, spelling: string): boolean {
  if (word === spelling) return true
  if (spelling.length < 3 || !word.startsWith(spelling)) return false
  const ending = word.slice(spelling.length)
  return (BENGALI.test(spelling) ? BENGALI_SUFFIXES : LATIN_SUFFIXES).includes(ending)
}

/**
 * Finds the terms a message mentions, in the order it mentions them. Multi-word spellings win
 * over the single words inside them, so "dhakar baire" is outside Dhaka, not Dhaka.
 */
export function matchTerms<T extends Term>(tokens: string[], terms: readonly T[]): T[] {
  const variants = variantsOf(terms)
  const found: T[] = []
  let i = 0
  while (i < tokens.length) {
    const match = variants.find((variant) =>
      variant.tokens.every((spelling, j) => {
        const word = tokens[i + j]
        if (word === undefined) return false
        return j === variant.tokens.length - 1 ? wordMatches(word, spelling) : word === spelling
      })
    )
    if (match) {
      if (!found.includes(match.term)) found.push(match.term)
      i += match.tokens.length
    } else {
      i += 1
    }
  }
  return found
}

/** A term made of plain phrases, for word lists that are not part of the shop's vocabulary */
export function phrases(key: string, spellings: string[]): Term {
  return {key, en: '', bn: '', spellings}
}
