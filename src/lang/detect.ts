export type Lang = 'bn' | 'banglish' | 'en'

const BENGALI_CHAR = /[ঀ-৿]/g
const LATIN_CHAR = /[A-Za-z]/g

// Common Bengali words as people type them in Latin letters. Product names are left out on
// purpose, because "nakshi kantha" or "panjabi" also appear in English questions. Words that are
// also everyday English ("age", "tin", "char", "pore") are left out too.
const BANGLISH_WORDS = new Set(
  (
    'ami amar amake amra amader apni apnar apnake apnara apnader tumi tomar tomake tomra tader ' +
    'ki keno kemon koto kotodin koyta kobe kothay kokhon kivabe kibhabe ke kar ' +
    'ache achhe ase nai nei hobe hoy hoye hoyeche hocche hoise ' +
    'korbo korte kore koren korun kora korechi korsi chai chacchi lagbe lage ' +
    'dite diben deben debo dibo dao pabo pai paben pete jabe jete jaben ' +
    'theke porjonto jonno shathe sathe moddhe er ' +
    'dam daam taka kinte kinbo kinle kena ferot ferat bodlate bodol rong kapor jama ' +
    'baire bhitore vitore pathan pathaben pathabo bhai vai apu valo bhalo kintu tahole jodi ' +
    'kono kichu ekta duita din ghonta bochor aj kal ajke kalke ekhon onek beshi kom choto boro ' +
    'notun dekhte dekhan bolun bolen janaben janan jante dorkar lagche nibo niben neya deya ' +
    'asbe asche khule khole bondho shukrobar shonibar robibar thaki thake bujhbo bujhte malik ' +
    'dokan shob sob gula gulo'
  ).split(' ')
)

/** Share of letters that must be Bengali script for a message to count as Bangla */
const BENGALI_SHARE = 0.4
/** Share of Latin words that must be Banglish words, unless at least two of them appear */
const BANGLISH_SHARE = 0.3

/**
 * Tells Bangla script, Banglish and English apart. Bangla is decided by script alone. For Latin
 * text, Banglish needs either two words from the list above or a third of all words.
 */
export function detectLanguage(text: string): Lang {
  const bengali = text.match(BENGALI_CHAR)?.length ?? 0
  const latin = text.match(LATIN_CHAR)?.length ?? 0
  if (bengali > 0 && bengali / (bengali + latin) >= BENGALI_SHARE) return 'bn'

  const words = text.toLowerCase().match(/[a-z]+/g) ?? []
  if (words.length === 0) return 'en'
  const hits = words.filter((word) => BANGLISH_WORDS.has(word)).length
  if (hits >= 2 || hits / words.length >= BANGLISH_SHARE) return 'banglish'
  return 'en'
}
