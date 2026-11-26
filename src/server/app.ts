import {existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'

import express from 'express'
import {z} from 'zod'

import type {TurnEvent, TurnInput} from '../agent/turn.js'
import type {Quota} from '../limits/budget.js'
import type {Conversation} from '../store/conversations.js'

/** The built React app. Vercel serves it from its CDN; locally Express does. */
export const WEB_DIR = fileURLToPath(new URL('../../dist/web', import.meta.url))

export type StreamEvent = TurnEvent | {type: 'error'; message: string}

export interface AppDeps {
  turn(input: TurnInput): AsyncIterable<TurnEvent>
  conversation(id: string): Promise<Conversation | null>
  quota(visitor: string): Promise<Quota>
  /** False when the visitor sent too many messages */
  allow(visitor: string): Promise<boolean>
  /** A keyed hash of the visitor's address */
  visitor(req: express.Request): string
  health(): Promise<object>
  staticDir?: string
}

const CONVERSATION_ID = z.string().regex(/^[A-Za-z0-9_-]{22}$/)

const ChatRequest = z.object({
  message: z.string().trim().min(1).max(500),
  conversationId: CONVERSATION_ID.optional()
})

const FAILURE = 'Something went wrong. Please try again in a moment.'

function log(event: string, details: Record<string, unknown>): void {
  console.error(JSON.stringify({level: 'error', event, ...details}))
}

/**
 * The chat API. `POST /api/chat` streams newline-delimited JSON: a `meta` event with the route
 * and sources, `token` events with the reply, and a `done` event with the trace.
 */
export function createApp(deps: AppDeps): express.Express {
  const app = express()
  app.disable('x-powered-by')
  app.use('/api', (_req, res, next) => {
    res.setHeader('x-content-type-options', 'nosniff')
    res.setHeader('cache-control', 'no-store')
    res.setHeader('referrer-policy', 'no-referrer')
    next()
  })
  app.use(express.json({limit: '16kb'}))

  const staticDir = deps.staticDir ?? WEB_DIR
  if (existsSync(staticDir)) app.use(express.static(staticDir))

  app.get('/api/health', async (_req, res) => {
    res.json(await deps.health())
  })

  app.get('/api/quota', async (req, res) => {
    res.json(await deps.quota(deps.visitor(req)))
  })

  app.get('/api/conversations/:id', async (req, res) => {
    const id = CONVERSATION_ID.safeParse(req.params.id)
    if (!id.success) {
      res.status(400).json({error: 'Not a conversation id.'})
      return
    }
    const conversation = await deps.conversation(id.data)
    if (!conversation) {
      res.status(404).json({error: 'No such conversation. It may have expired.'})
      return
    }
    res.json({id: conversation.id, messages: conversation.messages})
  })

  app.post('/api/chat', async (req, res) => {
    const parsed = ChatRequest.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        error:
          'Send {"message": "..."} with 1 to 500 characters, and a conversationId if you have one.'
      })
      return
    }
    const visitor = deps.visitor(req)
    if (!(await deps.allow(visitor))) {
      res.status(429).json({error: 'Too many messages. Wait a minute and try again.'})
      return
    }

    const controller = new AbortController()
    res.on('close', () => {
      if (!res.writableFinished) controller.abort()
    })
    res.status(200).type('application/x-ndjson')
    const send = (event: StreamEvent) => res.write(`${JSON.stringify(event)}\n`)
    try {
      for await (const event of deps.turn({...parsed.data, visitor, signal: controller.signal})) {
        send(event)
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        log('turn_failed', {error: error instanceof Error ? error.message : String(error)})
        send({type: 'error', message: FAILURE})
      }
    }
    res.end()
  })

  return app
}
