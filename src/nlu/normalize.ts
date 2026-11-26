import {toAsciiDigits} from '../lang/digits.js'

/**
 * One spelling to compare against: Unicode NFC, lowercase, ASCII digits, no thousands commas, no
 * apostrophes, and every other character that is not a letter, mark or digit turned into a space.
 */
export function normalize(text: string): string {
  return (
    toAsciiDigits(text.normalize('NFC'))
      // Zero-width joiners sit inside some Bengali words
      .replace(/[‌‍]/g, '')
      .toLowerCase()
      .replace(/(?<=\d),(?=\d{3})/g, '')
      .replace(/['’`]/g, '')
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
      .trim()
  )
}

export function tokenize(text: string): string[] {
  const normal = normalize(text)
  return normal ? normal.split(' ') : []
}
