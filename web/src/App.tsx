import {useCallback, useState} from 'react'

import {Composer} from './components/Composer.js'
import {Header} from './components/Header.js'
import {Inspector} from './components/Inspector.js'
import {Messages} from './components/Messages.js'
import {Welcome} from './components/Welcome.js'
import {useChat} from './useChat.js'

export function App() {
  const {state, busy, send, reset, select} = useChat()
  const [sheetOpen, setSheetOpen] = useState(false)
  const selected = state.messages.find((message) => message.id === state.selectedId)

  const inspect = useCallback(
    (id: string) => {
      select(id)
      setSheetOpen(true)
    },
    [select]
  )
  const closeSheet = useCallback(() => setSheetOpen(false), [])

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
      <div className="flex min-h-dvh flex-col">
        <Header quota={state.quota} onReset={reset} canReset={state.messages.length > 0} />
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4">
          {state.messages.length === 0 ? (
            <Welcome onAsk={(text) => void send(text)} />
          ) : (
            <Messages messages={state.messages} selectedId={state.selectedId} onInspect={inspect} />
          )}
          <Composer onSend={(text) => void send(text)} busy={busy} />
        </main>
        <footer className="mx-auto w-full max-w-2xl px-4 pb-6 text-xs leading-relaxed text-neel-soft">
          Nodi is made up: its products, orders and phone numbers are invented, and the numbers use
          the unassigned 010 prefix.{' '}
          <a
            href="https://github.com/Talha-Noyon/shohayok"
            className="underline decoration-dotted underline-offset-2 hover:text-neel"
          >
            Source on GitHub
          </a>
        </footer>
      </div>
      <Inspector message={selected} open={sheetOpen} onClose={closeSheet} />
    </div>
  )
}
