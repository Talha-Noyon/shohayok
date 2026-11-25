import {loadConfig, loadEnvFile} from '../config.js'
import {OpenRouterClient} from '../llm/openrouter.js'
import {createProviders, hasModel, PROVIDER_LABEL} from '../llm/providers.js'
import {supportsVectorSearch} from '../retrieval/atlasIndex.js'
import {openStore, redactUri} from '../store/mongo.js'
import {runCli} from './run.js'

/** Checks every dependency and says exactly what to fix */
await runCli(async () => {
  loadEnvFile()
  const config = loadConfig()
  let failures = 0
  const ok = (message: string) => console.log(`  ok    ${message}`)
  const note = (message: string) => console.log(`  note  ${message}`)
  const fail = (message: string) => {
    failures += 1
    console.log(`  FAIL  ${message}`)
  }
  const reason = (error: unknown) => (error instanceof Error ? error.message : String(error))

  console.log('MongoDB')
  try {
    const store = await openStore(config.mongoUri, config.mongoDb)
    try {
      const {version} = await store.client.db('admin').command({buildInfo: 1})
      ok(`connected to ${redactUri(config.mongoUri)}, MongoDB ${version}`)
      const supported = await supportsVectorSearch(store.chunks)
      if (config.vectorBackend === 'atlas' && !supported) {
        fail('VECTOR_BACKEND is atlas, but this server has no Atlas Vector Search')
      } else if (supported && config.vectorBackend !== 'local') {
        ok('Atlas Vector Search')
      } else {
        ok(`in-app cosine search${supported ? '' : ': this server has no Atlas Vector Search'}`)
      }
      const chunks = await store.chunks.estimatedDocumentCount()
      const models = await store.chunks.distinct('embedModel')
      if (chunks === 0) fail('no chunks yet: run npm run ingest')
      else if (models.some((model) => model !== config.embedModel)) {
        fail(`chunks were embedded with ${models.join(', ')}: run npm run ingest again`)
      } else ok(`${chunks} chunks embedded with ${config.embedModel}`)
    } finally {
      await store.close()
    }
  } catch (error) {
    fail(reason(error))
  }

  const providers = createProviders(config)
  for (const provider of new Set([providers.chat, providers.embed])) {
    console.log(PROVIDER_LABEL[provider.name])

    const uses = new Map<string, string[]>()
    const need = (model: string, use: string) => uses.set(model, [...(uses.get(model) ?? []), use])
    if (provider === providers.embed) need(config.embedModel, 'embeddings')
    if (provider === providers.chat) {
      need(config.chatModel, 'answers')
      need(config.rewriteModel, 'the Banglish rewrite')
    }

    if (provider instanceof OpenRouterClient) {
      try {
        const {freeTier} = await provider.checkKey()
        ok('key accepted')
        if (freeTier) {
          note(
            'free tier: free models allow only a few dozen requests a day until you buy $10 of ' +
              'credits, and a full eval run makes about 70'
          )
        }
      } catch (error) {
        fail(reason(error))
      }
    }

    try {
      const available = await provider.listModels()
      if (provider.name === 'ollama') ok(`reachable at ${config.ollamaUrl}`)
      for (const [model, use] of uses) {
        if (hasModel(available, model)) ok(`${model} for ${use.join(' and ')}`)
        else if (provider.name === 'ollama') fail(`${model} is missing: run ollama pull ${model}`)
        else fail(`${model} is not a model id on OpenRouter`)
      }
    } catch (error) {
      fail(reason(error))
    }
  }

  console.log(failures === 0 ? '\nAll good.' : `\n${failures} problem(s) to fix.`)
  if (failures > 0) process.exitCode = 1
})
