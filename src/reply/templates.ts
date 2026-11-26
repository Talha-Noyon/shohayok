import type {Lang} from '../lang/detect.js'
import {toBengaliDigits} from '../lang/digits.js'
import {DELIVERY, type DeliveryRate} from '../shop/delivery.js'
import {
  amount,
  colorName,
  dateLabel,
  listWords,
  maskPhone,
  money,
  placeIn,
  sizeLabel
} from '../shop/format.js'
import {placeOf} from '../shop/places.js'
import type {Order, OrderStatus, Payment, Product, Variant} from '../shop/schema.js'
import type {ToolResult} from '../tools/types.js'

export interface Reply {
  text: string
  /** Document ids the reply is based on: products shown, or the delivery policy */
  sources: string[]
}

type Texts = Record<Lang, string>

const pick = (lang: Lang, texts: Texts) => texts[lang]
const days = (rate: DeliveryRate, lang: Lang) =>
  lang === 'bn'
    ? toBengaliDigits(`${rate.minDays}–${rate.maxDays}`)
    : lang === 'banglish'
      ? `${rate.minDays}-${rate.maxDays}`
      : `${rate.minDays} to ${rate.maxDays}`

/** A fixed reply, in the customer's language, from a tool's result. No model is involved. */
export function renderReply(result: ToolResult, lang: Lang): Reply {
  const reply = build(result, lang)
  return {text: reply.text.normalize('NFC'), sources: reply.sources}
}

function build(result: ToolResult, lang: Lang): Reply {
  switch (result.tool) {
    case 'order_status':
      return {text: orderText(result, lang), sources: []}
    case 'delivery_fee':
      return deliveryText(result, lang)
    case 'check_stock':
      return stockText(result, lang)
    case 'list_products':
      return listText(result, lang)
    case 'product_info':
      return {text: productText(result.product, lang), sources: [result.product.id]}
    case 'request_callback':
      return {text: callbackText(result, lang), sources: []}
    case 'smalltalk':
      return {text: smalltalkText(result.kind, lang), sources: []}
    case 'clarify':
      return {
        text: pick(lang, {
          en: 'Which one do you mean? Send its number from the list, like "the second one".',
          bn: 'কোনটার কথা বলছেন? তালিকার নম্বর দিয়ে বলুন, যেমন "দ্বিতীয়টা"।',
          banglish: 'Kontar kotha bolchen? List er number diye bolun, jemon "2nd ta".'
        }),
        sources: []
      }
  }
}

// Orders

function orderText(result: Extract<ToolResult, {tool: 'order_status'}>, lang: Lang): string {
  switch (result.outcome) {
    case 'missing': {
      const both = result.missing.length === 2
      if (both) {
        return pick(lang, {
          en: 'To check an order, send its order number (like NDI-10024) and the phone number you ordered with.',
          bn: 'অর্ডারের খোঁজ নিতে অর্ডার নম্বর (যেমন NDI-10024) আর যে ফোন নম্বর দিয়ে অর্ডার করেছেন, সেটা পাঠান।',
          banglish:
            'Order er khoj nite order number (jemon NDI-10024) ar je phone number diye order korechen, seta pathan.'
        })
      }
      if (result.missing[0] === 'phone') {
        return pick(lang, {
          en: 'Please also send the phone number you ordered with.',
          bn: 'যে ফোন নম্বর দিয়ে অর্ডার করেছেন, সেটাও পাঠান।',
          banglish: 'Je phone number diye order korechen, setao pathan.'
        })
      }
      return pick(lang, {
        en: 'Please also send the order number. It looks like NDI-10024.',
        bn: 'অর্ডার নম্বরটাও পাঠান। দেখতে এমন: NDI-10024।',
        banglish: 'Order number tao pathan. Dekhte emon: NDI-10024.'
      })
    }
    case 'not_found':
      return pick(lang, {
        en: "I couldn't find an order with that order number and phone number. Please check both and try again.",
        bn: 'এই অর্ডার নম্বর আর ফোন নম্বরে কোনো অর্ডার পাইনি। দুটোই আবার দেখে পাঠান।',
        banglish:
          'Ei order number ar phone number e kono order pailam na. Duto-i abar dekhe pathan.'
      })
    case 'locked':
      return pick(lang, {
        en: "There were too many tries with the wrong details, so I can't look up orders in this chat any more. Please email help@nodi.example.",
        bn: 'অনেকবার ভুল তথ্য দেওয়ায় এই চ্যাটে আর অর্ডার দেখা যাবে না। help@nodi.example ঠিকানায় ইমেইল করুন।',
        banglish:
          'Onekbar vul tottho deyay ei chat e ar order dekha jabe na. help@nodi.example e email korun.'
      })
    case 'found':
      return orderFoundText(result.order, lang)
  }
}

const PAYMENT: Record<Payment, Texts> = {
  cod: {en: 'cash on delivery', bn: 'ক্যাশ অন ডেলিভারি', banglish: 'cash on delivery'},
  bkash: {en: 'paid by bKash', bn: 'বিকাশে পরিশোধিত', banglish: 'bKash e paid'},
  nagad: {en: 'paid by Nagad', bn: 'নগদে পরিশোধিত', banglish: 'Nagad e paid'},
  card: {en: 'paid by card', bn: 'কার্ডে পরিশোধিত', banglish: 'card e paid'}
}

const IN_TRANSIT: OrderStatus[] = ['placed', 'confirmed', 'packed', 'shipped']

function orderFoundText(order: Order, lang: Lang): string {
  const id = order.id
  const last = order.timeline.at(-1) ?? {status: order.status, at: order.placedAt}
  const on = dateLabel(last.at, lang)
  const courier = order.courier ?? 'the courier'
  const status: Record<OrderStatus, Texts> = {
    placed: {
      en: `We received order ${id} on ${on} and will confirm it soon.`,
      bn: `অর্ডার ${id} আমরা ${on} তারিখে পেয়েছি, শিগগিরই কনফার্ম করা হবে।`,
      banglish: `Order ${id} amra ${on} peyechi, shiggiri confirm kora hobe.`
    },
    confirmed: {
      en: `Order ${id} was confirmed on ${on} and is being packed.`,
      bn: `অর্ডার ${id} ${on} তারিখে কনফার্ম হয়েছে, এখন প্যাক করা হচ্ছে।`,
      banglish: `Order ${id} ${on} confirm hoyeche, ekhon pack kora hocche.`
    },
    packed: {
      en: `Order ${id} was packed on ${on} and goes to the courier next.`,
      bn: `অর্ডার ${id} ${on} তারিখে প্যাক হয়েছে, এরপর কুরিয়ারে যাবে।`,
      banglish: `Order ${id} ${on} pack hoyeche, erpor courier e jabe.`
    },
    shipped: {
      en: `Order ${id} left our warehouse on ${on} with ${courier}.`,
      bn: `অর্ডার ${id} ${on} তারিখে ${courier}-এর মাধ্যমে পাঠানো হয়েছে।`,
      banglish: `Order ${id} ${on} ${courier} e pathano hoyeche.`
    },
    out_for_delivery: {
      en: `Order ${id} has been out for delivery since ${on}. The rider will call before arriving.`,
      bn: `অর্ডার ${id} ${on} থেকে ডেলিভারির পথে আছে। পৌঁছানোর আগে রাইডার ফোন করবেন।`,
      banglish: `Order ${id} ${on} theke delivery r pothe ache. Pouchanor age rider phone korben.`
    },
    delivered: {
      en: `Order ${id} was delivered on ${on}.`,
      bn: `অর্ডার ${id} ${on} তারিখে ডেলিভারি হয়েছে।`,
      banglish: `Order ${id} ${on} delivery hoyeche.`
    },
    cancelled: {
      en: `Order ${id} was cancelled on ${on}.`,
      bn: `অর্ডার ${id} ${on} তারিখে বাতিল হয়েছে।`,
      banglish: `Order ${id} ${on} cancel hoyeche.`
    },
    returned: {
      en: `Order ${id} was returned on ${on}. The refund reaches you within 5 working days.`,
      bn: `অর্ডার ${id} ${on} তারিখে ফেরত এসেছে। ৫ কার্যদিবসের মধ্যে টাকা ফেরত পাবেন।`,
      banglish: `Order ${id} ${on} ferot eseche. 5 working day er moddhe taka ferot paben.`
    }
  }

  const lines = [pick(lang, status[order.status])]
  if (IN_TRANSIT.includes(order.status)) {
    const place = placeOf(order.area ?? order.district)
    const rate = DELIVERY[place.zone]
    lines.push(
      pick(lang, {
        en: `Delivery ${placeIn(place, 'en')} usually takes ${days(rate, 'en')} working days.`,
        bn: `${placeIn(place, 'bn')} পৌঁছাতে সাধারণত ${days(rate, 'bn')} কার্যদিবস লাগে।`,
        banglish: `${placeIn(place, 'banglish')} pouchate sadharonoto ${days(rate, 'banglish')} working day lage.`
      })
    )
  }

  const names = order.items.map((item) => {
    const name = lang === 'bn' ? item.name.bn : item.name.en
    return item.qty > 1 ? `${amount(item.qty, lang)} × ${name}` : name
  })
  const total = money(order.total, lang)
  const paid = pick(lang, PAYMENT[order.payment])
  lines.push(
    pick(lang, {
      en: `Items: ${listWords(names, 'en')}. Total ${total}, ${paid}.`,
      bn: `পণ্য: ${listWords(names, 'bn')}। মোট ${total}, ${paid}।`,
      banglish: `Item: ${listWords(names, 'banglish')}. Total ${total}, ${paid}.`
    })
  )
  return lines.join(' ')
}

// Delivery

function deliveryText(result: Extract<ToolResult, {tool: 'delivery_fee'}>, lang: Lang): Reply {
  const {place, rate} = result
  if (!place || !rate) {
    const inside = DELIVERY.dhaka
    const outside = DELIVERY.outside
    return {
      text: pick(lang, {
        en:
          `Delivery inside Dhaka costs ${money(inside.fee, 'en')} and takes ${days(inside, 'en')} working days. ` +
          `Outside Dhaka it costs ${money(outside.fee, 'en')} and takes ${days(outside, 'en')}. ` +
          `It is free inside Dhaka above ${money(inside.freeOver, 'en')}, and anywhere above ${money(outside.freeOver, 'en')}.`,
        bn:
          `ঢাকার ভিতরে ডেলিভারি চার্জ ${money(inside.fee, 'bn')}, পৌঁছাতে ${days(inside, 'bn')} কার্যদিবস লাগে। ` +
          `ঢাকার বাইরে ${money(outside.fee, 'bn')}, ${days(outside, 'bn')} কার্যদিবস। ` +
          `ঢাকায় ${amount(inside.freeOver, 'bn')} টাকার বেশি আর সারা দেশে ${amount(outside.freeOver, 'bn')} টাকার বেশি অর্ডারে ডেলিভারি ফ্রি।`,
        banglish:
          `Dhakar bhitore delivery charge ${money(inside.fee, 'banglish')}, pouchate ${days(inside, 'banglish')} working day lage. ` +
          `Dhakar baire ${money(outside.fee, 'banglish')}, ${days(outside, 'banglish')} working day. ` +
          `Dhakay ${amount(inside.freeOver, 'banglish')} takar beshi ar sara deshe ${amount(outside.freeOver, 'banglish')} takar beshi order e delivery free.`
      }),
      sources: [inside.policy, outside.policy]
    }
  }

  const lines = [
    pick(lang, {
      en: `Delivery ${placeIn(place, 'en')} costs ${money(rate.fee, 'en')} and takes ${days(rate, 'en')} working days. Orders above ${money(rate.freeOver, 'en')} are delivered free.`,
      bn: `${placeIn(place, 'bn')} ডেলিভারি চার্জ ${money(rate.fee, 'bn')}, পৌঁছাতে ${days(rate, 'bn')} কার্যদিবস লাগে। ${amount(rate.freeOver, 'bn')} টাকার বেশি অর্ডারে ডেলিভারি ফ্রি।`,
      banglish: `${placeIn(place, 'banglish')} delivery charge ${money(rate.fee, 'banglish')}, pouchate ${days(rate, 'banglish')} working day lage. ${amount(rate.freeOver, 'banglish')} takar beshi order e delivery free.`
    })
  ]
  if (place.kind === 'area' && place.zone === 'outside' && place.district === 'dhaka') {
    lines.push(
      pick(lang, {
        en: `${place.en} is outside Dhaka city, so the outside-Dhaka rate applies.`,
        bn: `${place.bn} ঢাকা শহরের বাইরে, তাই ঢাকার বাইরের চার্জ প্রযোজ্য।`,
        banglish: `${place.en} Dhaka shohorer baire, tai dhakar bairer charge projojjo.`
      })
    )
  }
  return {text: lines.join(' '), sources: [rate.policy]}
}

// Products

function variantText(variant: Pick<Variant, 'color' | 'size'>, lang: Lang): string {
  const color = colorName(variant.color, lang)
  if (variant.size === 'Free size') return color
  const size = sizeLabel(variant.size, lang)
  return pick(lang, {
    en: `${color}, size ${size}`,
    bn: `${color}, ${size} সাইজ`,
    banglish: `${color}, ${size} size`
  })
}

/** "blue (L, XXL) and golden (M)": sizes grouped under each colour, or colours alone */
function groupedOptions(variants: Variant[], lang: Lang): string {
  const byColor = new Map<string, string[]>()
  for (const variant of variants) {
    const sizes = byColor.get(variant.color) ?? []
    if (variant.size !== 'Free size') sizes.push(sizeLabel(variant.size, lang))
    byColor.set(variant.color, sizes)
  }
  const parts = [...byColor].map(([color, sizes]) =>
    sizes.length > 0 ? `${colorName(color, lang)} (${sizes.join(', ')})` : colorName(color, lang)
  )
  return listWords(parts, lang)
}

function nameOf(product: Product, lang: Lang): string {
  return lang === 'bn' ? product.name.bn : product.name.en
}

function stockText(result: Extract<ToolResult, {tool: 'check_stock'}>, lang: Lang): Reply {
  if (result.outcome === 'no_product') {
    return {
      text: pick(lang, {
        en: "I couldn't tell which product you mean. Could you send its name, like Ketoki Jamdani Sharee?",
        bn: 'কোন পণ্যের কথা বলছেন বুঝতে পারিনি। নামটা লিখবেন? যেমন কেতকী জামদানি শাড়ি।',
        banglish:
          'Kon product er kotha bolchen bujhte parini. Nam ta likhben? Jemon Ketoki Jamdani Sharee.'
      }),
      sources: []
    }
  }

  const {product, requested, available} = result
  const name = nameOf(product, lang)
  const cite = `[${product.id}]`
  const asked = result.color || result.size
  if (available.length === 0) {
    return {
      text: pick(lang, {
        en: `${name} is sold out right now. ${cite}`,
        bn: `${name} এখন স্টকে নেই। ${cite}`,
        banglish: `${name} ekhon stock e nai. ${cite}`
      }),
      sources: [product.id]
    }
  }
  const optionList = groupedOptions(available, lang)
  if (asked && requested.length > 0) {
    const first = requested[0] ?? available[0]
    const few = first && first.stock <= 3 ? first.stock : undefined
    const left =
      few === undefined
        ? ''
        : pick(lang, {
            en: `, but only ${few} left`,
            bn: `, তবে মাত্র ${amount(few, 'bn')}টি বাকি`,
            banglish: `, tobe matro ${few} ta baki`
          })
    const what = first
      ? variantText({color: result.color ?? first.color, size: result.size ?? first.size}, lang)
      : ''
    return {
      text: pick(lang, {
        en: `Yes, ${name} in ${what} is in stock${left}. ${cite}`,
        bn: `হ্যাঁ, ${name} (${what}) স্টকে আছে${left}। ${cite}`,
        banglish: `Ji, ${name} (${what}) stock e ache${left}. ${cite}`
      }),
      sources: [product.id]
    }
  }
  if (asked) {
    const what = variantText(
      {color: result.color ?? available[0]?.color ?? '', size: result.size ?? 'Free size'},
      lang
    )
    return {
      text: pick(lang, {
        en: `${name} in ${what} is sold out. Still in stock: ${optionList}. ${cite}`,
        bn: `${name} (${what}) শেষ হয়ে গেছে। স্টকে আছে: ${optionList}। ${cite}`,
        banglish: `${name} (${what}) shesh hoye geche. Stock e ache: ${optionList}. ${cite}`
      }),
      sources: [product.id]
    }
  }
  return {
    text: pick(lang, {
      en: `${name} is in stock in ${optionList}. ${cite}`,
      bn: `${name} স্টকে আছে: ${optionList}। ${cite}`,
      banglish: `${name} stock e ache: ${optionList}. ${cite}`
    }),
    sources: [product.id]
  }
}

function listText(result: Extract<ToolResult, {tool: 'list_products'}>, lang: Lang): Reply {
  if (result.outcome === 'none') {
    return {
      text: pick(lang, {
        en: 'Nothing matches that right now. Try a higher price, or another colour or style.',
        bn: 'এই মুহূর্তে মিলছে এমন কিছু নেই। দাম, রং বা ধরন একটু বদলে দেখুন।',
        banglish: 'Ekhon milche emon kichu nai. Dam, rong ba dhoron ektu bodle dekhun.'
      }),
      sources: []
    }
  }
  const {items, total} = result
  const shown = items.length
  const head =
    total > shown
      ? pick(lang, {
          en: `${total} products match. Here are the ${shown} cheapest:`,
          bn: `${amount(total, 'bn')}টি পণ্য মিলেছে। সবচেয়ে কম দামের ${amount(shown, 'bn')}টি:`,
          banglish: `${total} ta product mileche. Shobcheye kom damer ${shown} ta:`
        })
      : pick(lang, {
          en: total === 1 ? 'One product matches:' : `These ${total} match:`,
          bn: `${amount(total, 'bn')}টি পণ্য মিলেছে:`,
          banglish: `${total} ta product mileche:`
        })
  const rows = items.map(
    (item, i) =>
      `${amount(i + 1, lang)}. ${nameOf(item, lang)}, ${money(item.price, lang)} [${item.id}]`
  )
  const tail = pick(lang, {
    en: 'Ask about any of them by number, like "the second one".',
    bn: 'নম্বর দিয়ে জিজ্ঞেস করতে পারেন, যেমন "দ্বিতীয়টার দাম কত?"',
    banglish: 'Number diye jiggesh korte paren, jemon "2nd tar dam koto?"'
  })
  return {text: [head, ...rows, tail].join('\n'), sources: items.map((item) => item.id)}
}

function productText(product: Product, lang: Lang): string {
  const name = nameOf(product, lang)
  const price = money(product.price, lang)
  const colors = listWords(
    product.colors.map((key) => colorName(key, lang)),
    lang
  )
  const sizes = product.sizes.map((size) => sizeLabel(size, lang)).join(', ')
  return pick(lang, {
    en: `${name} costs ${price}. Colours: ${colors}. Sizes: ${sizes}. [${product.id}]`,
    bn: `${name}-এর দাম ${price}। রং: ${colors}। সাইজ: ${sizes}। [${product.id}]`,
    banglish: `${name} er dam ${price}. Rong: ${colors}. Size: ${sizes}. [${product.id}]`
  })
}

// Callbacks and small talk

function callbackText(result: Extract<ToolResult, {tool: 'request_callback'}>, lang: Lang): string {
  if (result.outcome === 'missing') {
    return pick(lang, {
      en: 'I can ask our team to call you. Which phone number should they call?',
      bn: 'আমাদের টিম আপনাকে ফোন করতে পারে। কোন নম্বরে ফোন করবে?',
      banglish: 'Amader team apnake phone korte pare. Kon number e phone korbe?'
    })
  }
  const phone = maskPhone(result.phone)
  return pick(lang, {
    en: `Thank you! Your callback request ${result.ticket} is saved. Our team will call ${phone} within 24 hours.`,
    bn: `ধন্যবাদ! আপনার কলব্যাক অনুরোধ ${result.ticket} রাখা হয়েছে। আমাদের টিম ২৪ ঘণ্টার মধ্যে ${phone} নম্বরে ফোন করবে।`,
    banglish: `Dhonnobad! Apnar callback request ${result.ticket} rakha holo. Amader team 24 ghontar moddhe ${phone} number e phone korbe.`
  })
}

function smalltalkText(kind: 'greeting' | 'thanks', lang: Lang): string {
  if (kind === 'thanks') {
    return pick(lang, {
      en: "You're welcome! Anything else I can help with?",
      bn: 'আপনাকেও ধন্যবাদ! আর কিছু জানতে চাইলে বলুন।',
      banglish: 'Apnakeo dhonnobad! Ar kichu jante chaile bolun.'
    })
  }
  return pick(lang, {
    en: "Hello! I'm Shohayok, Nodi's support assistant. Ask me about products, delivery or your order.",
    bn: 'হ্যালো! আমি সহায়ক, নদীর সাপোর্ট সহকারী। পণ্য, ডেলিভারি বা অর্ডার নিয়ে জিজ্ঞেস করুন।',
    banglish:
      'Hello! Ami Shohayok, Nodi-r support assistant. Product, delivery ba order niye jiggesh korun.'
  })
}
