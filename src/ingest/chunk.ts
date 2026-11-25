import type {SourceDoc} from '../corpus/schema.js'
import {toBengaliDigits} from '../lang/digits.js'

export interface Chunk {
  /** `<docId>#<n>` */
  id: string
  docId: string
  type: SourceDoc['type']
  /** Both titles, for display */
  title: string
  /** What gets embedded and keyword-indexed: the header, then part of the body */
  text: string
}

export const MAX_CHUNK_CHARS = 900

/**
 * Every chunk starts with the document's titles, price and tags in both languages, so a chunk
 * cut from the middle of a long body still says what it is about.
 */
export function chunkHeader(doc: SourceDoc): string {
  const lines = [`${doc.title.en} / ${doc.title.bn}`]
  if (doc.price !== undefined) {
    lines.push(`Price: Tk ${doc.price} / দাম: ${toBengaliDigits(String(doc.price))} টাকা`)
  }
  if (doc.tags.length > 0) lines.push(`Tags: ${doc.tags.join(', ')}`)
  return lines.join('\n')
}

/** English paragraphs first, then Bangla ones, packed greedily into chunks under `maxChars` */
export function toChunks(doc: SourceDoc, maxChars = MAX_CHUNK_CHARS): Chunk[] {
  const header = chunkHeader(doc)
  const budget = Math.max(maxChars - header.length - 1, 100)
  const pieces = [...paragraphs(doc.body.en), ...paragraphs(doc.body.bn)].flatMap((paragraph) =>
    splitLong(paragraph, budget)
  )

  const bodies: string[] = []
  let current = ''
  for (const piece of pieces) {
    const joined = current ? `${current}\n${piece}` : piece
    if (joined.length > budget && current) {
      bodies.push(current)
      current = piece
    } else {
      current = joined
    }
  }
  if (current) bodies.push(current)

  const title = `${doc.title.en} / ${doc.title.bn}`
  return bodies.map((body, n) => ({
    id: `${doc.id}#${n}`,
    docId: doc.id,
    type: doc.type,
    title,
    text: `${header}\n${body}`
  }))
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

/**
 * Splits a paragraph that is over budget at sentence ends, including the Bengali full stop "।",
 * and cuts any single sentence that is still too long.
 */
export function splitLong(paragraph: string, budget: number): string[] {
  if (paragraph.length <= budget) return [paragraph]
  const sentences = paragraph.match(/[^.!?।]+[.!?।]*\s*/g) ?? [paragraph]
  const out: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if (current && (current + sentence).length > budget) {
      out.push(current.trim())
      current = ''
    }
    if (sentence.length > budget) {
      for (let start = 0; start < sentence.length; start += budget) {
        out.push(sentence.slice(start, start + budget).trim())
      }
      continue
    }
    current += sentence
  }
  if (current.trim()) out.push(current.trim())
  return out
}
