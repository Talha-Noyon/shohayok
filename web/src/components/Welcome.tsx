const SAME_QUESTION = [
  {text: 'delivery charge koto?', label: 'Banglish', lang: 'bn-Latn'},
  {text: 'ডেলিভারি চার্জ কত?', label: 'Bangla', lang: 'bn'},
  {text: 'How much is delivery?', label: 'English', lang: 'en'}
]

const GROUPS = [
  {
    title: 'Answered from shop data',
    note: 'No model is asked, so these never run out.',
    samples: [
      'amar order NDI-10299 kothay? phone 01000000002',
      'lal jamdani 15000 er niche dekhan',
      'ঢাকার বাইরে কত দিনে পৌঁছাবে?'
    ]
  },
  {
    title: 'Written by the model',
    note: "Searched first, then answered from the shop's own pages.",
    samples: [
      'exchange korte chai, ki niyom?',
      'Can I pay with bKash?',
      'জামদানি শাড়ির যত্ন কীভাবে নেব?'
    ]
  },
  {
    title: 'Following up',
    note: 'It remembers the conversation: send the first, then the second.',
    samples: ['sylhet e koto din lage?', 'ar Chittagong e?']
  },
  {
    title: "When it doesn't know",
    note: 'It offers a callback instead of guessing.',
    samples: ['Do you sell iPhone chargers?']
  }
]

export function Welcome({onAsk}: {onAsk: (text: string) => void}) {
  return (
    <section aria-labelledby="ask" className="pt-4 pb-10">
      <h2 id="ask" className="text-sm text-neel-soft">
        Ask the way you would type it
      </h2>
      <ul className="mt-2">
        {SAME_QUESTION.map((question) => (
          <li key={question.text}>
            <button
              type="button"
              lang={question.lang}
              onClick={() => onAsk(question.text)}
              className="group flex w-full items-baseline gap-3 py-1 text-left"
            >
              <span className="text-4xl leading-tight font-semibold font-stretch-condensed underline decoration-neel-soft/35 decoration-dotted decoration-2 underline-offset-8 group-hover:decoration-neel sm:text-5xl">
                {question.text}
              </span>
              <span lang="en" className="shrink-0 text-sm text-neel-soft">
                {question.label}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-12 grid gap-x-8 gap-y-8 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <div key={group.title}>
            <h3 className="font-semibold">{group.title}</h3>
            <p className="text-sm text-neel-soft">{group.note}</p>
            <ul className="mt-2 space-y-1.5">
              {group.samples.map((sample) => (
                <li key={sample}>
                  <button
                    type="button"
                    onClick={() => onAsk(sample)}
                    className="text-left leading-snug underline decoration-neel-soft/35 decoration-dotted decoration-2 underline-offset-4 hover:decoration-neel"
                  >
                    {sample}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-10 text-sm leading-relaxed text-neel-soft">
        Orders you can look up: NDI-10298 with phone 01000000001, NDI-10299 with 01000000002, and
        NDI-10300 with 01000000003. An order is shown only with its number and its phone together.
      </p>
    </section>
  )
}
