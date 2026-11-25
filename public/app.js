const form = document.querySelector('#composer')
const input = document.querySelector('#question')
const log = document.querySelector('#log')
const status = document.querySelector('#status')

const LANGUAGE = {en: 'English', bn: 'বাংলা', banglish: 'Banglish'}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function ms(value) {
  if (value === null || value === undefined) return '–'
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`
}

/** Reads newline-delimited JSON as it arrives */
async function* readNdjson(stream) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const {done, value} = await reader.read()
    if (done) break
    buffer += decoder.decode(value, {stream: true})
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (line) yield JSON.parse(line)
      newline = buffer.indexOf('\n')
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer)
}

function assistantCard() {
  const root = el('article', 'msg bot')
  const meta = el('div', 'meta')
  const text = el('div', 'text pending', 'Thinking…')
  const foot = el('div', 'foot')
  root.append(meta, text, foot)
  let started = false

  return {
    root,
    handle(event) {
      if (event.type === 'meta') {
        meta.append(el('span', 'badge', LANGUAGE[event.lang] ?? event.lang))
        if (event.handoff) meta.append(el('span', 'badge handoff', 'Handed to a person'))
        if (event.rewrite) {
          meta.append(
            el('span', 'rewrite', `Searched as: ${event.rewrite.bangla} · ${event.rewrite.english}`)
          )
        }
        if (event.sources.length > 0) {
          const sources = el('div', 'sources')
          for (const source of event.sources) {
            const chip = el('span', 'source')
            chip.append(el('b', '', source.docId), document.createTextNode(` ${source.title}`))
            sources.append(chip)
          }
          foot.append(sources)
        }
      } else if (event.type === 'token') {
        if (!started) {
          started = true
          text.textContent = ''
          text.classList.remove('pending')
        }
        text.textContent += event.text
      } else if (event.type === 'done') {
        const t = event.timings
        foot.append(
          el(
            'div',
            'timings',
            `retrieval ${ms(t.rewriteMs + t.embedMs + t.searchMs)} · first word ${ms(t.firstTokenMs)} · total ${ms(t.totalMs)}`
          )
        )
      } else if (event.type === 'error') {
        this.error(event.message)
      }
      root.scrollIntoView({block: 'end'})
    },
    error(message) {
      text.classList.remove('pending')
      text.classList.add('error')
      text.textContent = message
    }
  }
}

async function ask(question) {
  log.append(el('div', 'msg user', question))
  const card = assistantCard()
  log.append(card.root)
  card.root.scrollIntoView({block: 'end'})

  let response
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({message: question})
    })
  } catch {
    card.error('Cannot reach the server.')
    return
  }
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => ({}))
    card.error(body.error ?? `Server error ${response.status}`)
    return
  }
  for await (const event of readNdjson(response.body)) card.handle(event)
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const question = input.value.trim()
  if (!question || form.classList.contains('busy')) return
  input.value = ''
  form.classList.add('busy')
  try {
    await ask(question)
  } finally {
    form.classList.remove('busy')
    input.focus()
  }
})

for (const button of document.querySelectorAll('[data-sample]')) {
  button.addEventListener('click', () => {
    input.value = button.dataset.sample
    form.requestSubmit()
  })
}

fetch('/api/health')
  .then((response) => response.json())
  .then((health) => {
    const backend =
      health.vectorBackend === 'atlas' ? 'Atlas Vector Search' : 'in-app cosine search'
    const provider = {ollama: 'Ollama', openrouter: 'OpenRouter'}
    status.textContent =
      `${health.chunks} chunks · ${backend} · ` +
      `embeddings ${health.models.embed} via ${provider[health.providers.embed]} · ` +
      `answers ${health.models.chat} via ${provider[health.providers.chat]}` +
      (health.providersUp ? '' : ' · a model provider is not answering')
  })
  .catch(() => {
    status.textContent = 'Server status unavailable'
  })
