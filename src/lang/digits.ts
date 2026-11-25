const BENGALI_DIGITS = '০১২৩৪৫৬৭৮৯'

export function toAsciiDigits(text: string): string {
  return text.replace(/[০-৯]/g, (digit) => String(BENGALI_DIGITS.indexOf(digit)))
}

export function toBengaliDigits(text: string): string {
  return text.replace(/[0-9]/g, (digit) => BENGALI_DIGITS.charAt(Number(digit)))
}

/**
 * Lowercase, ASCII digits and no separators inside numbers, so "১,৪৫০", "1,450" and "1450" all
 * compare equal. Used to check answers for expected facts.
 */
export function normalizeForMatch(text: string): string {
  return toAsciiDigits(text)
    .toLowerCase()
    .replace(/(?<=\d),(?=\d)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
