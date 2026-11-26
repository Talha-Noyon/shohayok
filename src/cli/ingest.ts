import {parseArgs} from 'node:util'

import {setup} from '../config.js'
import {ingestShop} from '../ingest/ingest.js'
import {OllamaClient} from '../llm/ollama.js'
import {createProvider, hasModel, PROVIDER_LABEL} from '../llm/providers.js'
import {ensureVectorSearchIndex} from '../retrieval/atlasIndex.js'
import {openStore, resolveVectorBackend} from '../store/mongo.js'
import {msSince} from '../util/time.js'
import {runCli} from './run.js'

/**
 * Loads the shop into MongoDB: products, orders, and chunks embedded for search. With --offline
 * it stores the chunks without vectors, which is enough for keyword search and for CI.
 */
await runCli(async () => {
  const {values} = parseArgs({
    options: {
      pull: {type: 'boolean', default: false},
      offline: {type: 'boolean', default: false}
    }
  })
  const config = setup()
  const model = config.embedModel

  let embed: ((texts: string[]) => Promise<number[][]>) | undefined
  if (values.offline) {
    console.log('Offline: storing chunks without vectors, for keyword search only')
  } else {
    const provider = createProvider(config.embedProvider, config)
    if (!hasModel(await provider.listModels(), model)) {
      if (!(provider instanceof OllamaClient)) {
        throw new Error(`OpenRouter has no model called ${model}. Check EMBED_MODEL.`)
      }
      if (!values.pull) {
        throw new Error(
          `Ollama does not have ${model}. Run: ollama pull ${model} (or npm run ingest -- --pull)`
        )
      }
      console.log(`Pulling ${model}...`)
      await provider.pull(model)
    }
    console.log(`Embedding with ${model} on ${PROVIDER_LABEL[provider.name]}`)
    embed = (texts) => provider.embed(model, texts)
  }

  const store = await openStore(config.mongoUri, config.mongoDb)
  try {
    const started = performance.now()
    const result = await ingestShop(store, {
      embed,
      embedModel: model,
      onProgress: (done, total) => process.stdout.write(`\rEmbedded ${done}/${total}`)
    })
    if (embed) console.log(` in ${(msSince(started) / 1000).toFixed(1)} s`)
    console.log(
      `Stored ${result.products} products, ${result.orders} orders and ${result.chunks} chunks, ` +
        `and removed ${result.removed} old chunks`
    )
    if (!embed) return

    const backend = await resolveVectorBackend(config.vectorBackend, store.chunks)
    if (backend === 'atlas') {
      console.log('Building the Atlas vector index...')
      await ensureVectorSearchIndex(store.chunks, result.dimensions)
      console.log('Vector index ready')
    } else {
      console.log('No Atlas Vector Search here: the server will search vectors in memory')
    }
  } finally {
    await store.close()
  }
})
