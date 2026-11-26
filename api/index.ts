/**
 * The Vercel entry point. Vercel runs this file as one serverless function and serves `public/`
 * from its CDN; `vercel.json` sends every `/api/*` request here, and Express routes it.
 */
import {setup} from '../src/config.js'
import {answerQuestion} from '../src/rag/pipeline.js'
import {createApp} from '../src/server/app.js'
import {createServices, type Services} from '../src/services.js'

// One set of connections per warm instance, opened by the first request. A failed start is
// forgotten, so the next request tries again instead of failing forever.
let services: Promise<Services> | undefined

function getServices(): Promise<Services> {
  services ??= createServices(setup()).catch((error: unknown) => {
    services = undefined
    throw error
  })
  return services
}

const app = createApp({
  answer: async function* (question, signal) {
    yield* answerQuestion(question, (await getServices()).pipeline, signal)
  },
  health: async () => (await getServices()).health()
})

export default app
