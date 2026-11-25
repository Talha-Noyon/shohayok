import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse
} from 'node:http'
import type {AddressInfo} from 'node:net'

export interface FakeReply {
  status?: number
  headers?: Record<string, string>
  /** Written one piece at a time with a pause between, so the client sees separate reads */
  pieces: (string | Buffer)[]
}

export interface FakeRequest {
  method: string
  path: string
  headers: IncomingHttpHeaders
  body: unknown
}

export interface FakeServer {
  url: string
  requests: FakeRequest[]
  close(): Promise<void>
}

type Handler = (body: unknown, request: FakeRequest) => FakeReply

/** A stand-in for a model provider's HTTP API, answering from per-path handlers */
export async function startFakeServer(handlers: Record<string, Handler>): Promise<FakeServer> {
  const requests: FakeRequest[] = []
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', async () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      const request: FakeRequest = {
        method: req.method ?? 'GET',
        path: req.url ?? '/',
        headers: req.headers,
        body: raw ? JSON.parse(raw) : undefined
      }
      requests.push(request)
      const handler = handlers[request.path]
      const reply = handler
        ? handler(request.body, request)
        : {status: 404, pieces: ['{"error":"not found"}']}
      res.writeHead(reply.status ?? 200, {'content-type': 'application/json', ...reply.headers})
      for (const piece of reply.pieces) {
        res.write(piece)
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
      res.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const {port} = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  }
}

export const json = (
  value: unknown,
  status = 200,
  headers?: Record<string, string>
): FakeReply => ({
  status,
  headers,
  pieces: [JSON.stringify(value)]
})

/** One server-sent event per chunk, as OpenAI-compatible APIs stream chat completions */
export const sse = (...contents: string[]): string[] => [
  ': OPENROUTER PROCESSING\n\n',
  ...contents.map((content) => `data: ${JSON.stringify({choices: [{delta: {content}}]})}\n\n`),
  'data: [DONE]\n\n'
]
