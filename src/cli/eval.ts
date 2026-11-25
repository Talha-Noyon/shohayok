import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {cpus} from 'node:os'
import {parseArgs} from 'node:util'

import {setup} from '../config.js'
import {loadEvalSet} from '../corpus/schema.js'
import {factsFound, firstRelevantRank} from '../eval/metrics.js'
import {renderMarkdown, replaceResultsSection, summarize, type ItemResult} from '../eval/report.js'
import {detectLanguage} from '../lang/detect.js'
import {PROVIDER_LABEL} from '../llm/providers.js'
import {prepareAnswer, sourcesOf, streamAnswer} from '../rag/pipeline.js'
import {createServices} from '../services.js'
import {runCli} from './run.js'

const README = new URL('../../README.md', import.meta.url)
const RESULTS = new URL('../../results/', import.meta.url)

/** Runs the labelled questions through the real pipeline and reports quality and latency */
await runCli(async () => {
  const {values} = parseArgs({
    options: {
      'retrieval-only': {type: 'boolean', default: false},
      'write-readme': {type: 'boolean', default: false},
      limit: {type: 'string'},
      hardware: {type: 'string', default: cpus()[0]?.model.trim() ?? 'unknown hardware'}
    }
  })
  const config = setup()
  const retrievalOnly = values['retrieval-only']
  const items = (await loadEvalSet()).slice(0, values.limit ? Number(values.limit) : undefined)
  const services = await createServices(config)

  try {
    const results: ItemResult[] = []
    for (const [index, item] of items.entries()) {
      const prepared = await prepareAnswer(item.question, services.pipeline)
      const ranked = sourcesOf(prepared.hits).map((source) => source.docId)

      let rankWithoutRewrite: number | null = null
      if (item.lang === 'banglish') {
        const bare = await prepareAnswer(item.question, {...services.pipeline, useRewrite: false})
        const bareRanked = sourcesOf(bare.hits).map((source) => source.docId)
        rankWithoutRewrite = firstRelevantRank(bareRanked, item.expectDocs)
      }

      const result: ItemResult = {
        id: item.id,
        lang: item.lang,
        detected: prepared.lang,
        question: item.question,
        answerable: item.answerable,
        ranked,
        rank: firstRelevantRank(ranked, item.expectDocs),
        rankWithoutRewrite,
        confidence: prepared.confidence,
        handoff: prepared.handoff,
        retrievalMs: prepared.rewriteMs + prepared.embedMs + prepared.searchMs
      }

      if (!retrievalOnly) {
        for await (const event of streamAnswer(prepared, services.pipeline)) {
          if (event.type !== 'done') continue
          result.answer = event.answer
          result.firstTokenMs = event.timings.firstTokenMs
          result.totalMs = event.timings.totalMs
        }
        const answer = result.answer ?? ''
        result.factsOk = item.expectFacts.length > 0 ? factsFound(answer, item.expectFacts) : null
        result.langOk = detectLanguage(answer) === item.lang
      }

      results.push(result)
      console.log(
        `[${index + 1}/${items.length}] ${item.id} ${item.lang.padEnd(8)} ` +
          `rank ${result.rank ?? '-'} cosine ${prepared.confidence?.toFixed(2) ?? '-'}` +
          (result.handoff ? ' handoff' : '') +
          (result.factsOk === false ? ' FACT MISSING' : '') +
          (result.langOk === false ? ' WRONG LANGUAGE' : '')
      )
    }

    const summary = summarize(results, {
      date: new Date().toISOString().slice(0, 10),
      hardware: values.hardware,
      embedModel: config.embedModel,
      embedProvider: PROVIDER_LABEL[config.embedProvider],
      chatModel: config.chatModel,
      chatProvider: PROVIDER_LABEL[config.chatProvider],
      rewriteModel: config.rewriteModel,
      vectorBackend: services.vectorIndex.kind === 'atlas' ? 'Atlas' : 'in-app cosine',
      topK: config.topK,
      threshold: config.handoffThreshold,
      retrievalOnly
    })
    const markdown = renderMarkdown(summary)

    await mkdir(RESULTS, {recursive: true})
    await writeFile(new URL('latest.json', RESULTS), JSON.stringify({summary, results}, null, 2))
    await writeFile(new URL('latest.md', RESULTS), `${markdown}\n`)
    if (values['write-readme']) {
      const readme = await readFile(README, 'utf8')
      await writeFile(README, replaceResultsSection(readme, markdown))
      console.log('\nREADME.md updated')
    }
    console.log(`\n${markdown}`)
  } finally {
    await services.close()
  }
})
