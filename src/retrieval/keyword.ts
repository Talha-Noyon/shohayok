import type {Collection} from 'mongodb'

import type {ChunkDoc} from '../store/types.js'
import {toMongoFilter, type Hit, type SearchFilter} from './types.js'

/**
 * `$text` reads double quotes as a phrase search and a leading minus as "must not contain".
 * Customers type both by accident, so they are removed.
 */
export function toTextSearch(query: string): string {
  return query
    .replace(/["\\]/g, ' ')
    .replace(/(^|\s)-+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Keyword search on MongoDB's `$text` index. The language is "none": MongoDB has no Bengali
 * stemmer, and English stemming would mangle Banglish.
 */
export async function keywordSearch(
  chunks: Collection<ChunkDoc>,
  query: string,
  k: number,
  filter?: SearchFilter
): Promise<Hit[]> {
  const search = toTextSearch(query)
  if (!search) return []
  const docs = await chunks
    .find(
      {$text: {$search: search, $language: 'none'}, ...toMongoFilter(filter)},
      {
        projection: {
          docId: 1,
          title: 1,
          text: 1,
          textEn: 1,
          textBn: 1,
          score: {$meta: 'textScore'}
        },
        sort: {score: {$meta: 'textScore'}},
        limit: k
      }
    )
    .toArray()
  return docs.map((doc) => ({
    chunkId: doc._id,
    docId: doc.docId,
    title: doc.title,
    text: doc.text,
    textEn: doc.textEn,
    textBn: doc.textBn,
    score: (doc as unknown as {score: number}).score
  }))
}
