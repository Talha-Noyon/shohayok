import {parseArgs} from 'node:util'

import {loadConfig, loadEnvFile} from '../config.js'
import {loadDocs} from '../corpus/schema.js'
import {toChunks} from '../ingest/chunk.js'
import {OllamaClient} from '../llm/ollama.js'
import {createProvider, hasModel, PROVIDER_LABEL} from '../llm/providers.js'
import {ensureVectorSearchIndex} from '../retrieval/atlasIndex.js'
import {ensureTextIndex, openStore, resolveVectorBackend, upsertChunks} from '../store/mongo.js'
import {msSince} from '../util/time.js'
import {runCli} from './run.js'

const BATCH = 16

/** Chunks the catalogue and policies, embeds them, and stores them in MongoDB */
await runCli(async () => {
  const {values} = parseArgs({options: {pull: {type: 'boolean', default: false}}})
  loadEnvFile()
  const config = loadConfig()

  const docs = await loadDocs()
  const chunks = docs.flatMap((doc) => toChunks(doc))
  console.log(`${docs.length} documents in ${chunks.length} chunks`)

  const provider = createProvider(config.embedProvider, config)
  const model = config.embedModel
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
  const started = performance.now()
  const embeddings: number[][] = []
  for (let start = 0; start < chunks.length; start += BATCH) {
    const batch = chunks.slice(start, start + BATCH)
    embeddings.push(
      ...(await provider.embed(
        model,
        batch.map((chunk) => chunk.text)
      ))
    )
    process.stdout.write(`\rEmbedded ${embeddings.length}/${chunks.length}`)
  }
  console.log(` in ${(msSince(started) / 1000).toFixed(1)} s`)

  const store = await openStore(config.mongoUri, config.mongoDb)
  try {
    const rows = chunks.map((chunk, i) => ({chunk, embedding: embeddings[i] ?? []}))
    const {written, removed} = await upsertChunks(store.chunks, rows, model)
    await ensureTextIndex(store.chunks)
    console.log(`Stored ${written} chunks, removed ${removed} old ones`)

    const backend = await resolveVectorBackend(config.vectorBackend, store.chunks)
    if (backend === 'atlas') {
      console.log('Building the Atlas vector index...')
      await ensureVectorSearchIndex(store.chunks, embeddings[0]?.length ?? 0)
      console.log('Vector index ready')
    } else {
      console.log('No Atlas Vector Search here: the server will search vectors in memory')
    }
  } finally {
    await store.close()
  }
})
