/**
 * The shop's vocabulary in English, Bengali and the other ways customers type it. The data
 * generator names products from these lists and the message reader matches against them, so a
 * word the shop sells is always a word the bot can read.
 */
export interface Term {
  key: string
  en: string
  bn: string
  /** Other spellings customers use, in any script, lowercased. The English and Bengali names match too. */
  spellings: string[]
}

export const CATEGORY_KEYS = [
  'sharee',
  'panjabi',
  'three-piece',
  'kurti',
  'fatua',
  'kids',
  'lungi',
  'orna',
  'shawl',
  'gamcha'
] as const

export type CategoryKey = (typeof CATEGORY_KEYS)[number]

export type SizeSystem = 'free' | 'chest' | 'letter' | 'age'

export const SIZE_SYSTEMS: Record<SizeSystem, readonly string[]> = {
  free: ['Free size'],
  chest: ['38', '40', '42', '44', '46'],
  letter: ['S', 'M', 'L', 'XL', 'XXL'],
  age: ['2-3Y', '4-5Y', '6-7Y', '8-9Y', '10-11Y']
}

export interface Category extends Term {
  key: CategoryKey
  sizes: SizeSystem
}

export interface Offer {
  count: number
  /** Price range in Taka */
  price: [number, number]
}

export interface Style extends Term {
  fabric: {en: string; bn: string}
  /** How many products of this style each category sells */
  offers: Partial<Record<CategoryKey, Offer>>
  /** Where the style comes from, a district key */
  origin?: string
  /** False when the name is also a category, like a kids' panjabi */
  matchable?: false
}

export const CATEGORIES: readonly Category[] = [
  {
    key: 'sharee',
    en: 'Sharee',
    bn: 'শাড়ি',
    spellings: ['saree', 'sari', 'shari', 'shaari', 'শাড়ী'],
    sizes: 'free'
  },
  {
    key: 'panjabi',
    en: 'Panjabi',
    bn: 'পাঞ্জাবি',
    spellings: ['punjabi', 'panjabee', 'পাঞ্জাবী'],
    sizes: 'chest'
  },
  {
    key: 'three-piece',
    en: 'Three-Piece',
    bn: 'থ্রি-পিস',
    spellings: [
      '3 piece',
      '3-piece',
      'threepiece',
      'thri pis',
      'salwar kameez',
      'salwar kamiz',
      'সালোয়ার কামিজ',
      'থ্রি পিস'
    ],
    sizes: 'letter'
  },
  {key: 'kurti', en: 'Kurti', bn: 'কুর্তি', spellings: ['kurta', 'kurtee', 'কুর্তা'], sizes: 'letter'},
  {key: 'fatua', en: 'Fatua', bn: 'ফতুয়া', spellings: ['fotua', 'fatwa'], sizes: 'letter'},
  {
    key: 'kids',
    en: 'Kids',
    bn: 'বাচ্চাদের পোশাক',
    spellings: ['kid', 'baby', 'baccha', 'bachcha', 'children', 'child', 'বাচ্চা', 'শিশু'],
    sizes: 'age'
  },
  {key: 'lungi', en: 'Lungi', bn: 'লুঙ্গি', spellings: ['lunghi'], sizes: 'free'},
  {
    key: 'orna',
    en: 'Orna',
    bn: 'ওড়না',
    spellings: ['urna', 'dupatta', 'orhna', 'ওরনা'],
    sizes: 'free'
  },
  {key: 'shawl', en: 'Shawl', bn: 'শাল', spellings: ['shal', 'chador', 'চাদর'], sizes: 'free'},
  {key: 'gamcha', en: 'Gamcha', bn: 'গামছা', spellings: ['gamchha', 'gamsa'], sizes: 'free'}
]

const COTTON = {en: 'cotton', bn: 'সুতি'}
const SILK = {en: 'silk', bn: 'সিল্ক'}

export const STYLES: readonly Style[] = [
  {
    key: 'jamdani',
    en: 'Jamdani',
    bn: 'জামদানি',
    spellings: ['jamdhani', 'zamdani', 'jamdany', 'জামদানী'],
    fabric: {en: 'fine cotton', bn: 'মিহি সুতি'},
    origin: 'narayanganj',
    offers: {sharee: {count: 30, price: [6500, 28000]}}
  },
  {
    key: 'tangail',
    en: 'Tangail',
    bn: 'টাঙ্গাইল',
    spellings: ['tangile'],
    fabric: COTTON,
    origin: 'tangail',
    offers: {sharee: {count: 25, price: [1200, 4800]}}
  },
  {
    key: 'katan',
    en: 'Katan',
    bn: 'কাতান',
    spellings: ['kaatan'],
    fabric: SILK,
    origin: 'dhaka',
    offers: {sharee: {count: 20, price: [7500, 32000]}}
  },
  {
    key: 'rajshahi-silk',
    en: 'Rajshahi Silk',
    bn: 'রাজশাহী সিল্ক',
    spellings: ['rajshahi silk'],
    fabric: SILK,
    origin: 'rajshahi',
    offers: {sharee: {count: 20, price: [4500, 16000]}}
  },
  {
    key: 'muslin',
    en: 'Muslin',
    bn: 'মসলিন',
    spellings: ['moslin'],
    fabric: {en: 'muslin cotton', bn: 'মসলিন সুতি'},
    origin: 'narayanganj',
    offers: {sharee: {count: 10, price: [9000, 38000]}}
  },
  {
    key: 'tant',
    en: 'Cotton Tant',
    bn: 'সুতি তাঁত',
    spellings: ['tant', 'taat', 'তাঁত', 'তাঁতের'],
    fabric: COTTON,
    origin: 'pabna',
    offers: {sharee: {count: 25, price: [850, 2600]}}
  },
  {
    key: 'georgette',
    en: 'Georgette',
    bn: 'জর্জেট',
    spellings: ['jorjet', 'georget', 'jorjette'],
    fabric: {en: 'georgette', bn: 'জর্জেট'},
    offers: {
      sharee: {count: 20, price: [1600, 4500]},
      'three-piece': {count: 15, price: [2800, 5600]}
    }
  },
  {
    key: 'cotton',
    en: 'Cotton',
    bn: 'সুতি',
    spellings: ['suti', 'sutir', 'kotton'],
    fabric: COTTON,
    offers: {
      panjabi: {count: 20, price: [1350, 2800]},
      'three-piece': {count: 20, price: [1600, 3200]},
      kurti: {count: 20, price: [750, 1500]},
      fatua: {count: 15, price: [650, 1300]},
      orna: {count: 8, price: [450, 950]},
      gamcha: {count: 10, price: [250, 600]}
    }
  },
  {
    key: 'silk',
    en: 'Silk',
    bn: 'সিল্ক',
    spellings: ['reshmi', 'রেশমি'],
    fabric: SILK,
    offers: {panjabi: {count: 15, price: [3200, 7500]}, orna: {count: 6, price: [1200, 2400]}}
  },
  {
    key: 'khadi',
    en: 'Khadi',
    bn: 'খাদি',
    spellings: ['khaddar'],
    fabric: {en: 'khadi cotton', bn: 'খাদি সুতি'},
    origin: 'cumilla',
    offers: {panjabi: {count: 10, price: [1500, 3200]}, fatua: {count: 15, price: [850, 1600]}}
  },
  {
    key: 'linen',
    en: 'Linen',
    bn: 'লিনেন',
    spellings: [],
    fabric: {en: 'linen', bn: 'লিনেন'},
    offers: {panjabi: {count: 10, price: [2200, 4200]}}
  },
  {
    key: 'embroidered',
    en: 'Embroidered',
    bn: 'এমব্রয়ডারি',
    spellings: ['embroidery', 'embroydari', 'embroidary', 'karchupi', 'কারচুপি', 'এমব্রয়ডারী'],
    fabric: COTTON,
    offers: {
      panjabi: {count: 15, price: [2600, 6500]},
      'three-piece': {count: 20, price: [3400, 7800]},
      kurti: {count: 15, price: [1250, 2600]}
    }
  },
  {
    key: 'printed',
    en: 'Printed',
    bn: 'প্রিন্টেড',
    spellings: ['print', 'prints', 'প্রিন্ট'],
    fabric: COTTON,
    offers: {panjabi: {count: 10, price: [1200, 2400]}}
  },
  {
    key: 'lawn',
    en: 'Lawn',
    bn: 'লন',
    spellings: ['lon'],
    fabric: {en: 'lawn cotton', bn: 'লন সুতি'},
    offers: {'three-piece': {count: 15, price: [2100, 4200]}}
  },
  {
    key: 'block-print',
    en: 'Block Print',
    bn: 'ব্লক প্রিন্ট',
    spellings: ['blockprint', 'blok print', 'block printed'],
    fabric: COTTON,
    offers: {kurti: {count: 15, price: [850, 1800]}}
  },
  {
    key: 'checked',
    en: 'Checked',
    bn: 'চেক',
    spellings: ['chek'],
    fabric: COTTON,
    origin: 'sirajganj',
    offers: {lungi: {count: 15, price: [450, 950]}}
  },
  {
    key: 'batik',
    en: 'Batik',
    bn: 'বাটিক',
    spellings: [],
    fabric: COTTON,
    offers: {lungi: {count: 10, price: [650, 1300]}}
  },
  {
    key: 'kids-panjabi',
    en: 'Panjabi',
    bn: 'পাঞ্জাবি',
    spellings: [],
    fabric: COTTON,
    matchable: false,
    offers: {kids: {count: 20, price: [750, 1800]}}
  },
  {
    key: 'frock',
    en: 'Frock',
    bn: 'ফ্রক',
    spellings: ['frok'],
    fabric: COTTON,
    offers: {kids: {count: 20, price: [850, 2200]}}
  },
  {
    key: 'kids-three-piece',
    en: 'Three-Piece',
    bn: 'থ্রি-পিস',
    spellings: [],
    fabric: COTTON,
    matchable: false,
    offers: {kids: {count: 10, price: [950, 2400]}}
  },
  {
    key: 'chiffon',
    en: 'Chiffon',
    bn: 'শিফন',
    spellings: ['shifon'],
    fabric: {en: 'chiffon', bn: 'শিফন'},
    offers: {orna: {count: 6, price: [650, 1500]}}
  },
  {
    key: 'woollen',
    en: 'Woollen',
    bn: 'উলের',
    spellings: ['wool', 'woolen', 'uler'],
    fabric: {en: 'wool', bn: 'উল'},
    offers: {shawl: {count: 6, price: [1500, 3200]}}
  },
  {
    key: 'pashmina',
    en: 'Pashmina',
    bn: 'পশমিনা',
    spellings: ['poshmina'],
    fabric: {en: 'pashmina wool', bn: 'পশমিনা উল'},
    offers: {shawl: {count: 5, price: [2800, 4800]}}
  },
  {
    key: 'kashmiri',
    en: 'Kashmiri',
    bn: 'কাশ্মীরি',
    spellings: [],
    fabric: {en: 'Kashmiri wool', bn: 'কাশ্মীরি উল'},
    offers: {shawl: {count: 4, price: [3200, 6500]}}
  }
]

export const COLORS: readonly Term[] = [
  {key: 'red', en: 'Red', bn: 'লাল', spellings: ['lal']},
  {key: 'maroon', en: 'Maroon', bn: 'মেরুন', spellings: ['merun']},
  {key: 'pink', en: 'Pink', bn: 'গোলাপি', spellings: ['golapi', 'gulapi']},
  {key: 'orange', en: 'Orange', bn: 'কমলা', spellings: ['komola', 'kamala']},
  {key: 'yellow', en: 'Yellow', bn: 'হলুদ', spellings: ['holud']},
  {key: 'green', en: 'Green', bn: 'সবুজ', spellings: ['sobuj', 'shobuj', 'sabuj']},
  {key: 'olive', en: 'Olive', bn: 'জলপাই', spellings: ['jolpai']},
  {key: 'blue', en: 'Blue', bn: 'নীল', spellings: ['nil', 'neel']},
  {key: 'navy', en: 'Navy Blue', bn: 'নেভি ব্লু', spellings: ['navy', 'nevi', 'nevi blue']},
  {key: 'sky-blue', en: 'Sky Blue', bn: 'আকাশি', spellings: ['akashi', 'sky']},
  {key: 'purple', en: 'Purple', bn: 'বেগুনি', spellings: ['beguni']},
  {key: 'white', en: 'White', bn: 'সাদা', spellings: ['sada', 'shada']},
  {key: 'off-white', en: 'Off-white', bn: 'অফ-হোয়াইট', spellings: ['off white', 'offwhite']},
  {key: 'black', en: 'Black', bn: 'কালো', spellings: ['kalo']},
  {key: 'grey', en: 'Grey', bn: 'ধূসর', spellings: ['gray', 'dhusor', 'dhushor']},
  {key: 'golden', en: 'Golden', bn: 'সোনালি', spellings: ['sonali', 'gold', 'সোনালী']},
  {key: 'silver', en: 'Silver', bn: 'রুপালি', spellings: ['rupali', 'রূপালী']},
  {key: 'cream', en: 'Cream', bn: 'ক্রিম', spellings: ['krim']},
  {key: 'brown', en: 'Brown', bn: 'বাদামি', spellings: ['badami']}
]

/** Flower and season names the shop gives its designs, so every product has its own name */
export const COLLECTIONS: readonly Term[] = [
  {key: 'shapla', en: 'Shapla', bn: 'শাপলা', spellings: []},
  {key: 'kodom', en: 'Kodom', bn: 'কদম', spellings: ['kadam']},
  {key: 'shiuli', en: 'Shiuli', bn: 'শিউলি', spellings: ['shewli', 'siuli']},
  {key: 'bokul', en: 'Bokul', bn: 'বকুল', spellings: ['bakul']},
  {key: 'joba', en: 'Joba', bn: 'জবা', spellings: ['jaba']},
  {
    key: 'rojonigondha',
    en: 'Rojonigondha',
    bn: 'রজনীগন্ধা',
    spellings: ['rajanigandha', 'rojoni gondha']
  },
  {key: 'krishnochura', en: 'Krishnochura', bn: 'কৃষ্ণচূড়া', spellings: ['krishnachura']},
  {key: 'hasnahena', en: 'Hasnahena', bn: 'হাসনাহেনা', spellings: ['hasna hena']},
  {key: 'kash', en: 'Kash', bn: 'কাশ', spellings: ['kashful']},
  {key: 'megh', en: 'Megh', bn: 'মেঘ', spellings: []},
  {key: 'brishti', en: 'Brishti', bn: 'বৃষ্টি', spellings: ['bristi']},
  {key: 'jochna', en: 'Jochna', bn: 'জোছনা', spellings: ['josna', 'jochona']},
  {key: 'shorot', en: 'Shorot', bn: 'শরৎ', spellings: ['sharat', 'sarat']},
  {key: 'boishakhi', en: 'Boishakhi', bn: 'বৈশাখী', spellings: ['baishakhi']},
  {key: 'palash', en: 'Palash', bn: 'পলাশ', spellings: ['polash']},
  {key: 'chameli', en: 'Chameli', bn: 'চামেলি', spellings: []},
  {key: 'golap', en: 'Golap', bn: 'গোলাপ', spellings: ['gulap']},
  {key: 'beli', en: 'Beli', bn: 'বেলি', spellings: []},
  {key: 'dolonchapa', en: 'Dolonchapa', bn: 'দোলনচাঁপা', spellings: ['dolon chapa']},
  {key: 'kamini', en: 'Kamini', bn: 'কামিনী', spellings: []},
  {key: 'madhobi', en: 'Madhobi', bn: 'মাধবী', spellings: ['madhabi']},
  {key: 'champa', en: 'Champa', bn: 'চাঁপা', spellings: []},
  {key: 'kolmi', en: 'Kolmi', bn: 'কলমি', spellings: ['kalmi']},
  {key: 'nilkontho', en: 'Nilkontho', bn: 'নীলকণ্ঠ', spellings: ['nilkantha', 'neelkantha']},
  {key: 'oporajita', en: 'Oporajita', bn: 'অপরাজিতা', spellings: ['aparajita']},
  {key: 'togor', en: 'Togor', bn: 'টগর', spellings: ['tagar']},
  {key: 'kanchon', en: 'Kanchon', bn: 'কাঞ্চন', spellings: ['kanchan']},
  {key: 'shimul', en: 'Shimul', bn: 'শিমুল', spellings: ['simul']},
  {key: 'hijol', en: 'Hijol', bn: 'হিজল', spellings: ['hijal']},
  {key: 'ketoki', en: 'Ketoki', bn: 'কেতকী', spellings: ['ketaki']},
  {key: 'maloti', en: 'Maloti', bn: 'মালতী', spellings: ['malati']},
  {key: 'shefali', en: 'Shefali', bn: 'শেফালি', spellings: ['sefali']},
  {key: 'jhumko', en: 'Jhumko', bn: 'ঝুমকো', spellings: ['jhumka']},
  {key: 'sonalu', en: 'Sonalu', bn: 'সোনালু', spellings: []}
]

export interface Occasion {
  key: string
  en: string
  bn: string
  /** The Bengali word as "at" or "for" the occasion, as in "ঈদে পরার মতো" */
  bnAt: string
}

export const OCCASIONS: readonly Occasion[] = [
  {key: 'eid', en: 'Eid', bn: 'ঈদ', bnAt: 'ঈদে'},
  {key: 'boishakh', en: 'Pohela Boishakh', bn: 'পহেলা বৈশাখ', bnAt: 'পহেলা বৈশাখে'},
  {key: 'wedding', en: 'weddings', bn: 'বিয়ে', bnAt: 'বিয়েতে'},
  {key: 'puja', en: 'Puja', bn: 'পূজা', bnAt: 'পূজায়'},
  {key: 'office', en: 'the office', bn: 'অফিস', bnAt: 'অফিসে'},
  {key: 'daily', en: 'everyday wear', bn: 'প্রতিদিন', bnAt: 'প্রতিদিন'},
  {key: 'winter', en: 'winter', bn: 'শীত', bnAt: 'শীতে'}
]

export function categoryOf(key: string): Category {
  const category = CATEGORIES.find((item) => item.key === key)
  if (!category) throw new Error(`Unknown category ${key}`)
  return category
}

export function styleOf(key: string): Style {
  const style = STYLES.find((item) => item.key === key)
  if (!style) throw new Error(`Unknown style ${key}`)
  return style
}

export function termOf(terms: readonly Term[], key: string): Term {
  const term = terms.find((item) => item.key === key)
  if (!term) throw new Error(`Unknown term ${key}`)
  return term
}
