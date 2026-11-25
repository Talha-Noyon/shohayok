import {runCli} from '../cli/run.js'
import {setup} from '../config.js'
import {PROVIDER_LABEL} from '../llm/providers.js'
import {answerQuestion} from '../rag/pipeline.js'
import {createServices} from '../services.js'
import {createApp} from './app.js'

await runCli(async () => {
  const config = setup()
  const services = await createServices(config)
  const health = await services.health()
  if (health.chunks === 0) {
    await services.close()
    throw new Error('No chunks in MongoDB yet. Run npm run ingest first.')
  }

  const app = createApp({
    answer: (question, signal) => answerQuestion(question, services.pipeline, signal),
    health: () => services.health()
  })
  const server = app.listen(config.port, () => {
    console.log(`Shohayok is running on http://localhost:${config.port}`)
    console.log(
      `${health.chunks} chunks, ${health.vectorBackend} vector search, ` +
        `embeddings ${config.embedModel} via ${PROVIDER_LABEL[config.embedProvider]}, ` +
        `answers ${config.chatModel} via ${PROVIDER_LABEL[config.chatProvider]}` +
        (health.providersUp ? '' : '. Warning: a model provider did not answer')
    )
  })

  const stop = () => {
    server.close()
    void services.close()
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
})
