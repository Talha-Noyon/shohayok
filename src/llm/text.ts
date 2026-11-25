/**
 * Splits a byte stream into lines. A network read can end in the middle of a line, or in the
 * middle of a multi-byte character, so both are buffered until they are complete.
 */
export async function* readLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const {done, value} = await reader.read()
      if (done) break
      buffer += decoder.decode(value, {stream: true})
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line) yield line
        newline = buffer.indexOf('\n')
      }
    }
    buffer += decoder.decode()
    if (buffer.trim()) yield buffer.trim()
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

/**
 * Parses JSON that a model may have wrapped in a code fence or a sentence. Models without a
 * JSON mode often do both, even when the prompt asks for JSON only.
 */
export function parseJsonLoose(text: string): unknown {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  try {
    return JSON.parse(unfenced)
  } catch {
    const start = unfenced.indexOf('{')
    const end = unfenced.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(unfenced.slice(start, end + 1))
    throw new SyntaxError('The model did not answer with JSON')
  }
}
