import {Fragment, useEffect, useRef} from 'react'

import type {Source} from '../../../src/shared/api.js'
import type {UiMessage} from '../chatState.js'
import {englishTitle, LANG_TAGS, madeBy, requestCount, requestsText} from '../words.js'

const CITATION = /\[([PF]\d{2,3})\]/g

/** Reply text with its line breaks, and document ids such as [F05] shown as small tags */
function ReplyText({text, sources}: {text: string; sources: Source[]}) {
  const parts = text.split(CITATION)
  return (
    <p className="leading-relaxed whitespace-pre-line">
      {parts.map((part, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>
        const source = sources.find((item) => item.docId === part)
        return (
          <abbr
            key={i}
            title={source ? englishTitle(source.title) : undefined}
            className="mx-0.5 rounded-sm bg-muslin-deep px-1 py-px text-xs font-medium text-neel-soft no-underline"
          >
            {part}
          </abbr>
        )
      })}
    </p>
  )
}

function BotMessage({
  message,
  selected,
  onInspect
}: {
  message: UiMessage
  selected: boolean
  onInspect: (id: string) => void
}) {
  const {trace} = message
  const requests = trace ? requestCount(trace) : 0
  return (
    <li
      lang={message.lang ? LANG_TAGS[message.lang] : undefined}
      className={`max-w-[94%] rounded-md px-3 py-2 ${
        selected ? 'outline-2 outline-offset-2 outline-neel-soft/45 outline-dashed' : ''
      }`}
    >
      {message.status === 'pending' ? (
        <p className="text-neel-soft">Reading your message…</p>
      ) : (
        message.text && <ReplyText text={message.text} sources={message.sources} />
      )}
      {message.status === 'error' && (
        <p lang="en" className="mt-1 font-medium">
          {message.error}
        </p>
      )}
      {trace && (
        <p
          lang="en"
          className="mt-1.5 flex flex-wrap items-baseline gap-x-3 text-sm text-neel-soft"
        >
          <span>{madeBy(trace)}</span>
          <span className={requests > 0 ? 'text-madder' : undefined}>{requestsText(requests)}</span>
          <button
            type="button"
            onClick={() => onInspect(message.id)}
            aria-pressed={selected}
            className="font-medium text-neel underline decoration-neel-soft/50 decoration-dotted decoration-2 underline-offset-4 hover:decoration-neel"
          >
            How it decided
          </button>
        </p>
      )}
    </li>
  )
}

export function Messages({
  messages,
  selectedId,
  onInspect
}: {
  messages: UiMessage[]
  selectedId?: string
  onInspect: (id: string) => void
}) {
  const end = useRef<HTMLLIElement>(null)
  const last = messages.at(-1)

  useEffect(() => {
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    end.current?.scrollIntoView({block: 'end', behavior: smooth ? 'smooth' : 'auto'})
  }, [messages.length, last?.text, last?.status])

  return (
    <ol aria-live="polite" aria-label="Conversation" className="flex flex-1 flex-col gap-4 py-4">
      {messages.map((message) =>
        message.role === 'customer' ? (
          <li
            key={message.id}
            className="ml-auto max-w-[85%] rounded-lg rounded-br-sm bg-neel px-4 py-2.5 leading-relaxed whitespace-pre-line text-thread"
          >
            {message.text}
          </li>
        ) : (
          <BotMessage
            key={message.id}
            message={message}
            selected={message.id === selectedId}
            onInspect={onInspect}
          />
        )
      )}
      <li ref={end} aria-hidden className="h-px" />
    </ol>
  )
}
