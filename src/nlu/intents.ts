import type {Term} from '../shop/vocab.js'
import type {Entities} from './entities.js'
import {matchTerms, phrases} from './match.js'
import {normalize} from './normalize.js'

export type Intent =
  'greeting' | 'thanks' | 'order_status' | 'delivery' | 'stock' | 'browse' | 'price' | 'human'

const GREETING = phrases('greeting', [
  'hi',
  'hello',
  'helo',
  'hey',
  'salam',
  'assalamualaikum',
  'assalamu alaikum',
  'asalamualaikum',
  'assalamu alaikom',
  'আসসালামু আলাইকুম',
  'সালাম',
  'হ্যালো',
  'হাই',
  'nomoskar',
  'namaskar',
  'নমস্কার',
  'adab',
  'আদাব',
  'good morning',
  'good afternoon',
  'good evening',
  'shuvo sokal',
  'শুভ সকাল'
])

const THANKS = phrases('thanks', [
  'thanks',
  'thank you',
  'thank u',
  'thx',
  'ty',
  'dhonnobad',
  'dhonyobad',
  'dhanyabad',
  'dhonnobaad',
  'ধন্যবাদ',
  'shukriya',
  'sukriya',
  'শুকরিয়া',
  'jazakallah'
])

const ORDER = phrases('order', [
  'order',
  'odar',
  'ordar',
  'অর্ডার',
  'parcel',
  'percel',
  'পার্সেল',
  'package',
  'প্যাকেজ',
  'jinish',
  'জিনিস'
])

const STATUS = phrases('status', [
  'status',
  'স্ট্যাটাস',
  'track',
  'tracking',
  'ট্র্যাক',
  'where',
  'kothay',
  'কোথায়',
  'koi',
  'কই',
  'kobe pabo',
  'কবে পাবো',
  'কবে পাব',
  'pai ni',
  'paini',
  'pai nai',
  'painai',
  'pelam na',
  'পাইনি',
  'পাই নাই',
  'ekhono',
  'akhono',
  'এখনো',
  'এখনও',
  'arrive',
  'arrived',
  'reach',
  'reached',
  'pouchabe',
  'পৌঁছাবে',
  'পৌঁছায়নি',
  'delivered',
  'shipped',
  'update',
  'obostha',
  'অবস্থা',
  'khobor',
  'খবর',
  'deri',
  'দেরি',
  'late',
  'kobe asbe',
  'kobe ashbe',
  'কবে আসবে',
  'when will'
])

/** Words that make "order" about placing, cancelling or returning one, not finding it */
const NOT_STATUS = phrases('not-status', [
  'place',
  'placing',
  'how to order',
  'how do i order',
  'can i order',
  'order korbo',
  'order korte',
  'order dibo',
  'order dite',
  'অর্ডার করব',
  'অর্ডার করতে',
  'অর্ডার দিব',
  'অর্ডার দিতে',
  'cancel',
  'batil',
  'বাতিল',
  'return',
  'ferot',
  'ফেরত',
  'exchange',
  'bodlate',
  'বদলাতে'
])

const DELIVERY = phrases('delivery', [
  'delivery',
  'deliver',
  'ডেলিভারি',
  'ডেলিভারী',
  'shipping',
  'ship',
  'courier',
  'কুরিয়ার',
  'pathate',
  'pathaben',
  'pathan',
  'pathano',
  'পাঠাতে',
  'পাঠাবেন',
  'পাঠান',
  'পাঠানো',
  'send',
  'pouchate',
  'পৌঁছাতে'
])

const FEE = phrases('fee', [
  'charge',
  'charj',
  'চার্জ',
  'fee',
  'fees',
  'ফি',
  'cost',
  'khoroch',
  'খরচ',
  'koto',
  'কত',
  'how much',
  'free',
  'ফ্রি',
  'taka',
  'টাকা'
])

const TIME = phrases('time', [
  'how long',
  'how many days',
  'koto din',
  'kotodin',
  'koydin',
  'koy din',
  'কত দিন',
  'কতদিন',
  'কয়দিন',
  'কয় দিন',
  'days',
  'din lage',
  'দিন লাগে',
  'somoy',
  'সময়',
  'kobe',
  'কবে',
  'when',
  'take'
])

/** Cash on delivery is about paying, not about delivery fees */
const COD = /(?<=^|\s)(?:cash on delivery|ক্যাশ অন ডেলিভারি|cod)(?=\s|$)/g

const STOCK = phrases('stock', [
  'stock',
  'স্টক',
  'available',
  'availability',
  'ache',
  'ase',
  'আছে',
  'do you have',
  'do u have',
  'have you got',
  'pawa jabe',
  'paowa jabe',
  'পাওয়া যাবে',
  'milbe',
  'মিলবে',
  'sold out',
  'left',
  'baki',
  'বাকি'
])

const BROWSE = phrases('browse', [
  'dekhan',
  'dekhao',
  'dekhte chai',
  'দেখান',
  'দেখাও',
  'দেখতে চাই',
  'show',
  'list',
  'ki ki',
  'কী কী',
  'কি কি',
  'collection',
  'options',
  'suggest',
  'recommend',
  'koyta',
  'কয়টা'
])

const PRICE = phrases('price', [
  'dam',
  'daam',
  'দাম',
  'price',
  'prices',
  'cost',
  'koto',
  'কত',
  'how much',
  'rate'
])

const HUMAN = phrases('human', [
  'manush',
  'মানুষ',
  'agent',
  'এজেন্ট',
  'human',
  'person',
  'representative',
  'callback',
  'call back',
  'call me',
  'call korun',
  'call den',
  'call diben',
  'phone korun',
  'phone diben',
  'ফোন করুন',
  'ফোন দিন',
  'কল করুন',
  'কল দিন',
  'kotha bolte',
  'kotha bolbo',
  'কথা বলতে',
  'কথা বলব',
  'talk to',
  'talk with',
  'speak to',
  'speak with',
  'someone from',
  'connect me',
  'complain',
  'complaint',
  'obhijog',
  'অভিযোগ'
])

/** One list per word set, made once, so the matcher's cache keeps their spellings */
const LISTS = new Map<Term, readonly Term[]>()
const listOf = (term: Term): readonly Term[] => {
  const list = LISTS.get(term) ?? [term]
  LISTS.set(term, list)
  return list
}

/** What the customer wants, from word lists in three scripts. Several intents can hold at once. */
export function detectIntents(text: string, entities: Entities): Set<Intent> {
  const normal = normalize(text)
  const tokens = normal ? normal.split(' ') : []
  const has = (term: Term, words = tokens) => matchTerms(words, listOf(term)).length > 0
  const intents = new Set<Intent>()

  if (has(GREETING)) intents.add('greeting')
  if (has(THANKS)) intents.add('thanks')
  if (has(HUMAN)) intents.add('human')
  if (has(STOCK)) intents.add('stock')
  if (has(BROWSE)) intents.add('browse')
  if (has(PRICE)) intents.add('price')

  // An order word with a status word, or with the phone an order is found by
  const lookup = has(STATUS) || entities.phone !== undefined
  if (entities.orderId || (has(ORDER) && lookup && !has(NOT_STATUS))) {
    intents.add('order_status')
  }

  const withoutCod = normal.replace(COD, ' ').trim().split(/\s+/)
  const fee = has(FEE, withoutCod)
  const time = has(TIME, withoutCod)
  const mentionsProduct =
    entities.categories.length > 0 || entities.styles.length > 0 || entities.collections.length > 0
  const asksAboutPlace = entities.places.length > 0 && (fee || time) && !mentionsProduct
  if (
    (has(DELIVERY, withoutCod) && (fee || time || entities.places.length > 0)) ||
    asksAboutPlace
  ) {
    intents.add('delivery')
  }
  return intents
}
