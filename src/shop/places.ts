import type {Term} from './vocab.js'

/** Delivery zones from the shop's policies: inside Dhaka city, or anywhere else in the country */
export type Zone = 'dhaka' | 'outside'

export interface Place extends Term {
  kind: 'district' | 'area' | 'region'
  zone: Zone
  /** For an area, the district it lies in */
  district?: string
}

type Row = [key: string, en: string, bn: string, spellings: string[]]

const district = ([key, en, bn, spellings]: Row): Place => ({
  key,
  en,
  bn,
  spellings,
  kind: 'district',
  zone: key === 'dhaka' ? 'dhaka' : 'outside'
})

const area =
  (zone: Zone, inDistrict = 'dhaka') =>
  ([key, en, bn, spellings]: Row): Place => ({
    key,
    en,
    bn,
    spellings,
    kind: 'area',
    zone,
    district: inDistrict
  })

/** All 64 districts, with the old and new English spellings people still use */
const DISTRICTS: Row[] = [
  // Dhaka division
  ['dhaka', 'Dhaka', 'ঢাকা', ['dacca']],
  ['gazipur', 'Gazipur', 'গাজীপুর', ['gajipur']],
  ['narayanganj', 'Narayanganj', 'নারায়ণগঞ্জ', ['narayangonj', 'narayangang']],
  ['narsingdi', 'Narsingdi', 'নরসিংদী', ['norsingdi', 'narshingdi']],
  ['munshiganj', 'Munshiganj', 'মুন্সিগঞ্জ', ['munshigonj']],
  ['manikganj', 'Manikganj', 'মানিকগঞ্জ', ['manikgonj']],
  ['tangail', 'Tangail', 'টাঙ্গাইল', []],
  ['kishoreganj', 'Kishoreganj', 'কিশোরগঞ্জ', ['kishorgonj', 'kishoregonj']],
  ['faridpur', 'Faridpur', 'ফরিদপুর', []],
  ['gopalganj', 'Gopalganj', 'গোপালগঞ্জ', ['gopalgonj']],
  ['madaripur', 'Madaripur', 'মাদারীপুর', []],
  ['shariatpur', 'Shariatpur', 'শরীয়তপুর', ['soriatpur']],
  ['rajbari', 'Rajbari', 'রাজবাড়ী', []],
  // Chattogram division
  ['chattogram', 'Chattogram', 'চট্টগ্রাম', ['chittagong', 'ctg', 'chottogram', 'চিটাগাং']],
  ['coxs-bazar', "Cox's Bazar", 'কক্সবাজার', ['coxs bazar', 'cox bazar', 'coxsbazar', 'coxbazar']],
  ['cumilla', 'Cumilla', 'কুমিল্লা', ['comilla', 'kumilla']],
  ['feni', 'Feni', 'ফেনী', []],
  ['noakhali', 'Noakhali', 'নোয়াখালী', []],
  ['lakshmipur', 'Lakshmipur', 'লক্ষ্মীপুর', ['laxmipur', 'lokkhipur']],
  ['chandpur', 'Chandpur', 'চাঁদপুর', []],
  ['brahmanbaria', 'Brahmanbaria', 'ব্রাহ্মণবাড়িয়া', ['b baria', 'bbaria']],
  ['khagrachhari', 'Khagrachhari', 'খাগড়াছড়ি', ['khagrachari']],
  ['rangamati', 'Rangamati', 'রাঙ্গামাটি', []],
  ['bandarban', 'Bandarban', 'বান্দরবান', []],
  // Sylhet division
  ['sylhet', 'Sylhet', 'সিলেট', ['silet', 'sileth']],
  ['moulvibazar', 'Moulvibazar', 'মৌলভীবাজার', ['moulvi bazar', 'maulvibazar']],
  ['habiganj', 'Habiganj', 'হবিগঞ্জ', ['hobigonj']],
  ['sunamganj', 'Sunamganj', 'সুনামগঞ্জ', ['sunamgonj']],
  // Rajshahi division
  ['rajshahi', 'Rajshahi', 'রাজশাহী', ['rajshai']],
  ['bogura', 'Bogura', 'বগুড়া', ['bogra']],
  ['pabna', 'Pabna', 'পাবনা', []],
  ['sirajganj', 'Sirajganj', 'সিরাজগঞ্জ', ['sirajgonj']],
  ['natore', 'Natore', 'নাটোর', ['nator']],
  ['naogaon', 'Naogaon', 'নওগাঁ', ['nogaon']],
  ['chapainawabganj', 'Chapainawabganj', 'চাঁপাইনবাবগঞ্জ', ['chapai nawabganj', 'chapai']],
  ['joypurhat', 'Joypurhat', 'জয়পুরহাট', ['jaipurhat']],
  // Khulna division
  ['khulna', 'Khulna', 'খুলনা', []],
  ['jashore', 'Jashore', 'যশোর', ['jessore', 'josor']],
  ['satkhira', 'Satkhira', 'সাতক্ষীরা', []],
  ['bagerhat', 'Bagerhat', 'বাগেরহাট', []],
  ['kushtia', 'Kushtia', 'কুষ্টিয়া', []],
  ['jhenaidah', 'Jhenaidah', 'ঝিনাইদহ', ['jhenaidaha', 'jinaidah']],
  ['magura', 'Magura', 'মাগুরা', []],
  ['narail', 'Narail', 'নড়াইল', []],
  ['chuadanga', 'Chuadanga', 'চুয়াডাঙ্গা', []],
  ['meherpur', 'Meherpur', 'মেহেরপুর', []],
  // Barishal division
  ['barishal', 'Barishal', 'বরিশাল', ['barisal']],
  ['bhola', 'Bhola', 'ভোলা', []],
  ['patuakhali', 'Patuakhali', 'পটুয়াখালী', []],
  ['pirojpur', 'Pirojpur', 'পিরোজপুর', []],
  ['jhalokathi', 'Jhalokathi', 'ঝালকাঠি', ['jhalokati', 'jhalakathi']],
  ['barguna', 'Barguna', 'বরগুনা', []],
  // Rangpur division
  ['rangpur', 'Rangpur', 'রংপুর', ['rongpur']],
  ['dinajpur', 'Dinajpur', 'দিনাজপুর', []],
  ['kurigram', 'Kurigram', 'কুড়িগ্রাম', []],
  ['gaibandha', 'Gaibandha', 'গাইবান্ধা', []],
  ['nilphamari', 'Nilphamari', 'নীলফামারী', []],
  ['lalmonirhat', 'Lalmonirhat', 'লালমনিরহাট', []],
  ['thakurgaon', 'Thakurgaon', 'ঠাকুরগাঁও', []],
  ['panchagarh', 'Panchagarh', 'পঞ্চগড়', ['ponchogor']],
  // Mymensingh division
  ['mymensingh', 'Mymensingh', 'ময়মনসিংহ', ['moymonsingh']],
  ['jamalpur', 'Jamalpur', 'জামালপুর', []],
  ['sherpur', 'Sherpur', 'শেরপুর', []],
  ['netrokona', 'Netrokona', 'নেত্রকোনা', ['netrakona']]
]

/** Areas inside Dhaka city, where the inside-Dhaka rate applies */
const DHAKA_AREAS: Row[] = [
  ['mirpur', 'Mirpur', 'মিরপুর', []],
  ['uttara', 'Uttara', 'উত্তরা', ['uttora']],
  ['dhanmondi', 'Dhanmondi', 'ধানমন্ডি', ['dhanmandi']],
  ['gulshan', 'Gulshan', 'গুলশান', []],
  ['banani', 'Banani', 'বনানী', []],
  ['mohammadpur', 'Mohammadpur', 'মোহাম্মদপুর', ['muhammadpur']],
  ['badda', 'Badda', 'বাড্ডা', []],
  ['rampura', 'Rampura', 'রামপুরা', []],
  ['motijheel', 'Motijheel', 'মতিঝিল', ['motijhil']],
  ['jatrabari', 'Jatrabari', 'যাত্রাবাড়ী', []],
  ['khilgaon', 'Khilgaon', 'খিলগাঁও', []],
  ['tejgaon', 'Tejgaon', 'তেজগাঁও', []],
  ['farmgate', 'Farmgate', 'ফার্মগেট', ['farm gate']],
  ['bashundhara', 'Bashundhara', 'বসুন্ধরা', ['basundhara']],
  ['malibagh', 'Malibagh', 'মালিবাগ', []],
  ['shyamoli', 'Shyamoli', 'শ্যামলী', ['shamoli']],
  ['lalbagh', 'Lalbagh', 'লালবাগ', []],
  ['wari', 'Wari', 'ওয়ারী', []],
  ['mohakhali', 'Mohakhali', 'মহাখালী', []],
  ['baridhara', 'Baridhara', 'বারিধারা', []],
  ['shantinagar', 'Shantinagar', 'শান্তিনগর', []],
  ['paltan', 'Paltan', 'পল্টন', ['polton']],
  ['banasree', 'Banasree', 'বনশ্রী', ['banashree']],
  ['cantonment', 'Cantonment', 'ক্যান্টনমেন্ট', []],
  ['old-dhaka', 'Old Dhaka', 'পুরান ঢাকা', ['puran dhaka']]
]

/** Towns in Dhaka district outside the city, which pay the outside-Dhaka rate */
const DHAKA_OUTSKIRTS: Row[] = [
  ['savar', 'Savar', 'সাভার', ['shavar']],
  ['keraniganj', 'Keraniganj', 'কেরানীগঞ্জ', ['keranigonj']],
  ['dhamrai', 'Dhamrai', 'ধামরাই', []],
  ['ashulia', 'Ashulia', 'আশুলিয়া', []]
]

const REGIONS: Place[] = [
  {
    key: 'inside-dhaka',
    en: 'inside Dhaka',
    bn: 'ঢাকার ভিতরে',
    spellings: [
      'inside dhaka',
      'within dhaka',
      'dhaka city',
      'dhakar bhitore',
      'dhakar vitore',
      'dhakar moddhe',
      'dhaka shohor',
      'ঢাকার মধ্যে',
      'ঢাকার ভেতরে',
      'ঢাকা শহর',
      'ঢাকা শহরে'
    ],
    kind: 'region',
    zone: 'dhaka'
  },
  {
    key: 'outside-dhaka',
    en: 'outside Dhaka',
    bn: 'ঢাকার বাইরে',
    spellings: ['outside dhaka', 'dhakar baire', 'dhaka er baire', 'dhakar bahire', 'ঢাকার বাহিরে'],
    kind: 'region',
    zone: 'outside'
  }
]

export const PLACES: readonly Place[] = [
  ...DISTRICTS.map(district),
  ...DHAKA_AREAS.map(area('dhaka')),
  ...DHAKA_OUTSKIRTS.map(area('outside')),
  area('outside', 'gazipur')(['tongi', 'Tongi', 'টঙ্গী', []]),
  ...REGIONS
]

export function placeOf(key: string): Place {
  const place = PLACES.find((item) => item.key === key)
  if (!place) throw new Error(`Unknown place ${key}`)
  return place
}
