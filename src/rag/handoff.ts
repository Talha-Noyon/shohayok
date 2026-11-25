import type {Lang} from '../lang/detect.js'

/** Sent instead of a generated answer when retrieval found nothing close enough */
export const HANDOFF_MESSAGES: Record<Lang, string> = {
  en: "I'm not sure about that. Let me connect you with a human agent.",
  bn: 'এ বিষয়ে আমি নিশ্চিত নই। আপনাকে একজন প্রতিনিধির সাথে যুক্ত করে দিচ্ছি।',
  banglish: 'Ei bishoye ami nishchit na. Apnake ekjon agent er sathe connect kore dicchi.'
}

/**
 * Hands off when the best cosine similarity is under the threshold, or when nothing was found at
 * all. Deciding before generation is cheaper than asking the model to refuse, and testable.
 */
export function shouldHandoff(confidence: number | null, threshold: number): boolean {
  return confidence === null || confidence < threshold
}
