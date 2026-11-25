import {fileURLToPath} from 'node:url'

import express from 'express'
import {z} from 'zod'

import type {AnswerEvent} from '../rag/pipeline.js'

export const PUBLIC_DIR = fileURLToPath(new URL('../../public', import.meta.url))

export type StreamEvent = AnswerEvent | {type: 'error'; message: string}

export interface AppDeps {
  answer(question: string, signal: AbortSignal): AsyncIterable<AnswerEvent>
  health(): Promise<object>
}

const ChatRequest = z.object({message: z.string().trim().min(1).max(500)})

/**
 * One page and two endpoints. `POST /api/chat` streams newline-delimited JSON: a `meta` event
 * with what was found, `token` events with the answer, and a `done` event with timings.
 */
export function createApp(deps: AppDeps): express.Express {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({limit: '16kb'}))
  app.use(express.static(PUBLIC_DIR))

  app.get('/api/health', async (_req, res) => {
    res.json(await deps.health())
  })

  app.post('/api/chat', async (req, res) => {
    const parsed = ChatRequest.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({error: 'Send {"message": "..."} with 1 to 500 characters.'})
      return
    }

    const controller = new AbortController()
    res.on('close', () => {
      if (!res.writableFinished) controller.abort()
    })
    res.status(200).type('application/x-ndjson').setHeader('cache-control', 'no-store')

    const send = (event: StreamEvent) => res.write(`${JSON.stringify(event)}\n`)
    try {
      for await (const event of deps.answer(parsed.data.message, controller.signal)) send(event)
    } catch (error) {
      if (!controller.signal.aborted) {
        send({type: 'error', message: error instanceof Error ? error.message : String(error)})
      }
    }
    res.end()
  })

  return app
}
