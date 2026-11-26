import {runTurn} from '../agent/turn.js'
import type {Config} from '../config.js'
import {clientIp, visitorId} from '../limits/visitor.js'
import type {Services} from '../services.js'
import type {AppDeps} from './app.js'

/**
 * The API's dependencies from the services. `load` may connect on first use, as on Vercel, where
 * a function instance starts cold and serves many requests once it is up.
 */
export function appDeps(load: () => Promise<Services>, config: Config): AppDeps {
  return {
    turn: async function* (input) {
      yield* runTurn(input, (await load()).agent)
    },
    conversation: async (id) => (await load()).agent.conversations.get(id),
    quota: async (visitor) => (await load()).agent.budget.status(visitor),
    allow: async (visitor) => (await load()).rateLimiter.allow(visitor),
    visitor: (req) => visitorId(clientIp(req.headers, req.socket.remoteAddress), config.hashSecret),
    health: async () => (await load()).health()
  }
}
