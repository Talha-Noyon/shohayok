import {setup} from '../src/config.js'
import {createApp} from '../src/server/app.js'
import {appDeps} from '../src/server/deps.js'
import {createServices, type Services} from '../src/services.js'

/**
 * The whole API as one Vercel function. Services connect on the first request and stay up while
 * the instance is warm; a failed connection is retried on the next request.
 */
const config = setup()
let services: Promise<Services> | undefined

function load(): Promise<Services> {
  services ??= createServices(config).catch((error: unknown) => {
    services = undefined
    throw error
  })
  return services
}

export default createApp(appDeps(load, config))
