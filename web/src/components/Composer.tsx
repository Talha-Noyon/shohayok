import {useState, type FormEvent, type KeyboardEvent} from 'react'

const LIMIT = 500

export function Composer({onSend, busy}: {onSend: (text: string) => void; busy: boolean}) {
  const [text, setText] = useState('')
  const empty = text.trim() === ''

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (empty || busy) return
    onSend(text)
    setText('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <form onSubmit={submit} className="sticky bottom-0 bg-muslin pt-2 pb-4">
      <div className="flex items-end gap-2 rounded-xl border-2 border-neel/15 bg-white/70 py-2 pr-2 pl-4 focus-within:border-neel/60">
        <label htmlFor="message" className="sr-only">
          Your message
        </label>
        <textarea
          id="message"
          rows={1}
          maxLength={LIMIT}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask about a product, delivery or your order"
          className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 leading-snug field-sizing-content placeholder:text-neel-soft/70 focus:outline-none"
        />
        <button
          type="submit"
          disabled={empty || busy}
          className="rounded-lg bg-neel px-4 py-2 font-semibold text-thread transition-opacity disabled:opacity-35"
        >
          {busy ? 'Replying' : 'Send'}
        </button>
      </div>
      {text.length > LIMIT - 100 && (
        <p className="mt-1 text-right text-xs text-neel-soft">
          {LIMIT - text.length} characters left
        </p>
      )}
    </form>
  )
}
