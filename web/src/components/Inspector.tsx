import {useEffect, useRef, type ReactNode} from 'react'

import type {Trace} from '../../../src/shared/api.js'
import type {UiMessage} from '../chatState.js'
import {
  DECISIONS,
  duration,
  englishTitle,
  INTENT_NAMES,
  LANG_NAMES,
  LANG_TAGS,
  quotaLeft,
  requestCount,
  requestsText,
  TOOL_NAMES,
  words
} from '../words.js'

/** One step on the thread, with its knot */
function Step({title, children}: {title: string; children: ReactNode}) {
  return (
    <li className="relative pb-7 pl-8">
      <span
        aria-hidden
        className="absolute top-1 left-0 size-3.5 rounded-full border-2 border-thread bg-neel"
      />
      <h3 className="text-sm text-thread/65">{title}</h3>
      <div className="mt-1">{children}</div>
    </li>
  )
}

function Language({trace}: {trace: Trace}) {
  const {lang, bengaliShare, banglishWords} = trace.language
  const why =
    lang === 'bn'
      ? `${Math.round(bengaliShare * 100)}% of the letters are Bengali script.`
      : banglishWords.length > 0
        ? `Banglish words it knows: ${banglishWords.join(', ')}.`
        : 'No Bengali script, and no Banglish words it knows.'
  return (
    <>
      <p className="text-xl font-semibold">{LANG_NAMES[lang]}</p>
      <p className="text-sm text-thread/75">{why}</p>
    </>
  )
}

function Read({trace}: {trace: Trace}) {
  const e = trace.entities
  const tags = [
    e.orderId && `order ${e.orderId}`,
    e.phone && `phone ${e.phone}`,
    ...e.places.map((place) => `place: ${place}`),
    ...e.collections.map((name) => `name: ${words(name)}`),
    ...e.styles.map((style) => `style: ${words(style)}`),
    ...e.categories.map((category) => `type: ${words(category)}`),
    ...e.colors.map((color) => `colour: ${words(color)}`),
    ...e.sizes.map((size) => `size ${size}`),
    e.minPrice !== undefined && `from Tk ${e.minPrice.toLocaleString('en-US')}`,
    e.maxPrice !== undefined && `up to Tk ${e.maxPrice.toLocaleString('en-US')}`,
    e.ordinal !== undefined && (e.ordinal === -1 ? 'the last one' : `item ${e.ordinal} of a list`),
    e.reference && e.ordinal === undefined && 'points back at something said before'
  ].filter((tag): tag is string => Boolean(tag))
  const intents = trace.intents.map((intent) => INTENT_NAMES[intent] ?? intent)
  return (
    <>
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag} className="rounded-md border border-thread/25 px-2 py-0.5 text-sm">
              {tag}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-thread/75">No order number, place or product.</p>
      )}
      {intents.length > 0 && (
        <p className="mt-2 text-sm text-thread/75">Asks about {intents.join(', ')}.</p>
      )}
    </>
  )
}

function Route({trace}: {trace: Trace}) {
  const {route, rewrite, tool} = trace
  const where =
    route.kind === 'tool'
      ? (TOOL_NAMES[route.tool ?? ''] ?? route.tool)
      : "Search the shop's pages, then write an answer"
  return (
    <>
      <p className="text-lg leading-snug font-semibold">{where}</p>
      <p className="text-sm text-thread/75">
        The rule that decided: {route.reason}.{tool ? ` Done in ${duration(tool.ms)}.` : ''}
      </p>
      {rewrite && (
        <div className="mt-3 border-l-2 border-thread/25 pl-3">
          {rewrite.ok ? (
            <>
              <p className="text-sm text-thread/75">
                It could not place the message alone, so the model rewrote it first, in{' '}
                {duration(rewrite.ms)}:
              </p>
              <p lang="bn" className="mt-1">
                {rewrite.bangla}
              </p>
              <p lang="en">{rewrite.english}</p>
            </>
          ) : (
            <p className="text-sm text-thread/75">
              The rewrite failed, so it searched the message as written.
            </p>
          )}
        </div>
      )}
    </>
  )
}

function Found({search}: {search: NonNullable<Trace['search']>}) {
  const {hits, confidence, threshold, keywordOnly} = search
  const scale = (value: number) => `${Math.max(0, Math.min(1, value)) * 100}%`
  return (
    <>
      {keywordOnly ? (
        <p className="text-sm text-thread/75">
          Keyword search only, because today&apos;s free model requests are used up.
        </p>
      ) : (
        <p className="text-sm text-thread/75">
          Best match {confidence?.toFixed(2) ?? 'none'}, against a threshold of{' '}
          <span className="text-turmeric">{threshold.toFixed(2)}</span>:{' '}
          {confidence !== null && confidence >= threshold
            ? 'close enough to answer from.'
            : 'not close enough to answer from.'}
        </p>
      )}
      <ul className="mt-3 space-y-2.5">
        {hits.map((hit) => (
          <li key={hit.docId}>
            <p className="flex items-baseline justify-between gap-3 text-sm">
              <span>
                <span className="font-semibold">{hit.docId}</span> {englishTitle(hit.title)}
              </span>
              <span className="shrink-0 text-thread/75">
                {hit.cosine === null ? 'by keyword' : hit.cosine.toFixed(2)}
              </span>
            </p>
            {hit.cosine !== null && (
              <div className="relative mt-1 h-1.5 rounded-full bg-thread/15">
                <div className="h-full rounded-full bg-thread" style={{width: scale(hit.cosine)}} />
                <span
                  aria-hidden
                  className="absolute -top-1 h-3.5 w-0.5 bg-turmeric"
                  style={{left: scale(threshold)}}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      {search.queries.length > 1 && (
        <p className="mt-3 text-sm text-thread/75">
          Searched {search.queries.length} ways: as written and as both rewrites.
        </p>
      )}
    </>
  )
}

function Answered({trace}: {trace: Trace}) {
  const asked = trace.language.lang
  const replied = trace.answer?.replyLang
  return (
    <>
      <p>{DECISIONS[trace.decision]}</p>
      {trace.answer?.model && (
        <p className="mt-1 text-sm text-thread/75">Model: {trace.answer.model}</p>
      )}
      {replied && (
        <p className="mt-1 text-sm text-thread/75">
          {replied === asked
            ? `Written in ${LANG_NAMES[replied]}, as the question was.`
            : `Written in ${LANG_NAMES[replied]}, though the question was ${LANG_NAMES[asked]}.`}
        </p>
      )}
    </>
  )
}

function Cost({trace}: {trace: Trace}) {
  const {embed, chat} = trace.modelRequests
  const total = requestCount(trace)
  const parts = [
    embed > 0 && `${embed} to embed the question`,
    chat > 0 && `${chat} to write`
  ].filter(Boolean)
  const quota = trace.quota
  return (
    <>
      <p className="text-xl font-semibold">
        {total === 0 ? 'Nothing' : <span className="text-madder-light">{requestsText(total)}</span>}
      </p>
      {total === 0 ? (
        <p className="text-sm text-thread/75">No model was asked.</p>
      ) : (
        <p className="text-sm text-thread/75">{parts.join(', and ')}.</p>
      )}
      {quota?.enabled && (
        <p className="mt-1 text-sm text-thread/75">
          After it, {quotaLeft(quota).day} of {quota.limit} free requests were left today, and{' '}
          {quotaLeft(quota).visitor} of {quota.visitorLimit} of yours. They come back at 6 am in
          Dhaka.
        </p>
      )}
    </>
  )
}

function Timing({trace}: {trace: Trace}) {
  const rows = [
    trace.tool && ['Shop data', trace.tool.ms],
    trace.rewrite && ['Rewrite', trace.rewrite.ms],
    trace.search && !trace.search.keywordOnly && ['Embedding', trace.search.embedMs],
    trace.search && ['Search', trace.search.searchMs],
    trace.answer?.firstTokenMs != null && ['First word', trace.answer.firstTokenMs],
    ['Whole reply', trace.totalMs]
  ].filter((row): row is [string, number] => Array.isArray(row))
  const longest = Math.max(1, ...rows.map(([, ms]) => ms))
  return (
    <ul className="space-y-1.5">
      {rows.map(([label, ms]) => (
        <li key={label} className="grid grid-cols-[6.5rem_1fr_4rem] items-center gap-2 text-sm">
          <span className="text-thread/75">{label}</span>
          <span className="h-1.5 rounded-full bg-thread/15">
            <span
              className="block h-full rounded-full bg-thread"
              style={{width: `${Math.max(2, (ms / longest) * 100)}%`}}
            />
          </span>
          <span className="text-right">{duration(ms)}</span>
        </li>
      ))}
    </ul>
  )
}

const STEP_TITLES = [
  'Language',
  'What it read',
  'Where it went',
  'What it found',
  'How it answered',
  'What it cost',
  'How long it took'
]

/** Before any reply: the steps every record has, so the structure is visible from the start */
function EmptyThread() {
  return (
    <div className="relative mt-8 opacity-45">
      <span aria-hidden className="stitch-y absolute top-3 bottom-8 left-[6px] text-thread/45" />
      <ol className="relative">
        {STEP_TITLES.map((title) => (
          <li key={title} className="relative pb-6 pl-8">
            <span
              aria-hidden
              className="absolute top-1 left-0 size-3.5 rounded-full border-2 border-thread bg-neel"
            />
            <p className="text-sm">{title}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Thread({trace}: {trace: Trace}) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="stitch-y animate-stitch absolute top-3 bottom-8 left-[6px] text-thread/45"
      />
      <ol className="relative">
        <Step title="Language">
          <Language trace={trace} />
        </Step>
        <Step title="What it read">
          <Read trace={trace} />
        </Step>
        <Step title="Where it went">
          <Route trace={trace} />
        </Step>
        {trace.search && (
          <Step title="What it found">
            <Found search={trace.search} />
          </Step>
        )}
        <Step title="How it answered">
          <Answered trace={trace} />
        </Step>
        <Step title="What it cost">
          <Cost trace={trace} />
        </Step>
        <Step title="How long it took">
          <Timing trace={trace} />
        </Step>
      </ol>
    </div>
  )
}

export function Inspector({
  message,
  open,
  onClose
}: {
  message?: UiMessage
  open: boolean
  onClose: () => void
}) {
  const close = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    close.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const trace = message?.trace
  return (
    <>
      {open && (
        <div
          aria-hidden
          className="fixed inset-0 z-20 bg-neel-deep/50 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        aria-label="How it decided"
        className={`${
          open ? 'fixed inset-x-0 bottom-0 z-30 flex max-h-[88dvh] rounded-t-2xl' : 'hidden'
        } flex-col bg-neel text-thread lg:sticky lg:top-0 lg:flex lg:h-dvh lg:max-h-none lg:rounded-none`}
      >
        <div className="flex items-baseline justify-between gap-4 px-6 pt-6 pb-4">
          <h2 className="text-3xl leading-none font-semibold font-stretch-condensed">
            How it decided
          </h2>
          <button
            ref={close}
            type="button"
            onClick={onClose}
            className="text-sm underline decoration-thread/40 decoration-dotted decoration-2 underline-offset-4 lg:hidden"
          >
            Close
          </button>
        </div>
        <div className="overflow-y-auto px-6 pb-6">
          {trace ? (
            <>
              <p
                lang={message?.lang ? LANG_TAGS[message.lang] : undefined}
                className="mb-6 line-clamp-2 text-sm text-thread/75"
              >
                For the reply “{message?.text}”
              </p>
              <Thread key={message?.id} trace={trace} />
            </>
          ) : (
            <>
              <p className="max-w-sm leading-relaxed text-thread/80">
                Every reply keeps a record of how it was made. Send a message, and the record of its
                reply appears here, step by step.
              </p>
              <EmptyThread />
            </>
          )}
        </div>
      </aside>
    </>
  )
}
