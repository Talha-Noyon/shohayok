import {appendFile, mkdir, readFile, writeFile} from 'node:fs/promises'
import {parseArgs} from 'node:util'

import type {AgentDeps, CachedAnswer} from '../agent/turn.js'
import {cachedEmbedder, MemoryCache} from '../cache/cache.js'
import {setup} from '../config.js'
import {loadEvalSet, SEARCH_ROUTES, type EvalCase} from '../eval/cases.js'
import {
  renderFailures,
  renderMarkdown,
  replaceResultsSection,
  summarize,
  type RunInfo
} from '../eval/report.js'
import {offlineDeps, runCase} from '../eval/runner.js'
import {scoreCase, type CaseResult, type Mode} from '../eval/score.js'
import {Budget} from '../limits/budget.js'
import {MongoCounter} from '../limits/counter.js'
import {budgeted, QuotaExhaustedError} from '../llm/budgeted.js'
import {createServices} from '../services.js'
import {MemoryConversations} from '../store/conversations.js'
import {runCli} from './run.js'

const README = new URL('../../README.md', import.meta.url)
const RESULTS = new URL('../../results/', import.meta.url)
const PROGRESS = new URL('progress.jsonl', RESULTS)
const VISITOR = 'eval'
const WARM_BATCH = 50

/** A progress line: a scored case, or the questions one run embedded ahead */
type Line = CaseResult | {type: 'warm'; texts: number; requests: number; at: string}

async function readProgress(): Promise<{results: CaseResult[]; texts: number; requests: number}> {
  let lines: Line[] = []
  try {
    const text = await readFile(PROGRESS, 'utf8')
    lines = text
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Line)
  } catch {
    // No progress yet
  }
  const warm = lines.flatMap((line) => ('type' in line ? [line] : []))
  return {
    results: lines.flatMap((line) => ('type' in line ? [] : [line])),
    texts: warm.reduce((sum, line) => sum + line.texts, 0),
    requests: warm.reduce((sum, line) => sum + line.requests, 0)
  }
}

/** The newest result per case, in the order of the set */
function latestPerCase(results: CaseResult[], cases: EvalCase[]): CaseResult[] {
  const byId = new Map(results.map((result) => [result.id, result]))
  return cases.flatMap((item) => byId.get(item.id) ?? [])
}

const dateRange = (results: CaseResult[]) => {
  const days = [...new Set(results.map((result) => result.at.slice(0, 10)))].sort()
  return days.length > 1 ? `${days[0]} to ${days.at(-1)}` : (days[0] ?? 'never')
}

async function write(name: string, results: CaseResult[], info: RunInfo, cases: EvalCase[]) {
  const summary = summarize(results, info, cases)
  const markdown = renderMarkdown(summary)
  await mkdir(RESULTS, {recursive: true})
  await writeFile(new URL(`${name}.json`, RESULTS), JSON.stringify({summary, results}, null, 2))
  await writeFile(
    new URL(`${name}.md`, RESULTS),
    `${markdown}\n\n## Failed checks\n\n${renderFailures(summary)}\n`
  )
  return {summary, markdown}
}

/**
 * Scores the labelled cases. --offline runs no model and needs no database: routing, reading
 * and every fixed reply, for CI. Without it the cases run against the configured MongoDB and
 * free models; the day's quota may end a run, and --resume picks up where it stopped.
 */
await runCli(async () => {
  const {values} = parseArgs({
    options: {
      offline: {type: 'boolean', default: false},
      resume: {type: 'boolean', default: false},
      limit: {type: 'string'},
      only: {type: 'string'},
      'write-readme': {type: 'boolean', default: false}
    }
  })
  const cases = await loadEvalSet()
  const only = values.only ? new Set(values.only.split(',')) : undefined
  const selected = cases.filter((item) => !only || only.has(item.id))

  if (values.offline) {
    const deps = await offlineDeps()
    const results: CaseResult[] = []
    for (const item of selected) {
      results.push(scoreCase(item, await runCase(item, deps, VISITOR), 'offline'))
    }
    const info: RunInfo = {
      mode: 'offline',
      dates: dateRange(results),
      embedModel: 'none',
      chatModel: 'none',
      rewriteModel: 'none',
      vectorBackend: 'none',
      topK: deps.config.topK,
      threshold: deps.config.handoffThreshold,
      total: cases.length,
      warmed: 0,
      warmRequests: 0
    }
    const {summary, markdown} = await write('offline', results, info, cases)
    console.log(`${markdown}\n\n${renderFailures(summary)}`)
    // A leak is never acceptable; other failures are measured, and shown above
    if (summary.safety.leaks.length > 0) process.exitCode = 1
    return
  }

  const config = setup()
  const services = await createServices(config)
  try {
    // The eval spends the shop's daily budget like visitors do, but no visitor share caps it
    const budget = new Budget(new MongoCounter(services.store.usage), {
      ...config.budget,
      visitorLimit: config.budget.dailyLimit
    })
    const deps: AgentDeps = {
      ...services.agent,
      budget,
      conversations: new MemoryConversations(),
      // Every answer is written fresh: a cached one would not measure the model
      answers: new MemoryCache<CachedAnswer>()
    }

    const previous = values.resume ? (await readProgress()).results : []
    if (!values.resume) {
      await mkdir(RESULTS, {recursive: true})
      await writeFile(PROGRESS, '')
    }
    const done = new Set(previous.map((result) => result.id))
    const limit = values.limit ? Number(values.limit) : Infinity
    const todo = selected.filter((item) => !done.has(item.id)).slice(0, limit)

    // Open questions are embedded ahead, 50 to a request, instead of one request each
    const searched = todo.filter((item) => SEARCH_ROUTES.includes(item.expect.route))
    const texts = [...new Set(searched.map((item) => item.question))]
    const embed = cachedEmbedder(
      (batch) =>
        budgeted(services.providers.embed, budget, VISITOR).embed(config.embedModel, batch),
      deps.embeddings,
      config.embedModel
    )
    let warmRequests = 0
    let stopped = false
    try {
      for (let start = 0; start < texts.length; start += WARM_BATCH) {
        const {requested} = await embed(texts.slice(start, start + WARM_BATCH))
        if (requested > 0) warmRequests += 1
      }
    } catch (error) {
      if (!(error instanceof QuotaExhaustedError)) throw error
      stopped = true
    }
    const warm = {type: 'warm', texts: texts.length, requests: warmRequests}
    await appendFile(PROGRESS, `${JSON.stringify({...warm, at: new Date().toISOString()})}\n`)

    const mode: Mode = 'online'
    for (const [index, item] of (stopped ? [] : todo).entries()) {
      let run
      try {
        run = await runCase(item, deps, VISITOR)
      } catch (error) {
        if (!(error instanceof QuotaExhaustedError)) throw error
        run = undefined
      }
      // A case cut short by the quota is not scored: --resume runs it again
      if (!run || run.quota) {
        stopped = true
        break
      }
      const result = scoreCase(item, run, mode)
      await appendFile(PROGRESS, `${JSON.stringify(result)}\n`)
      const cost = result.requests.embed + result.requests.chat
      console.log(
        `[${index + 1}/${todo.length}] ${item.id.padEnd(10)} ${result.actual.padEnd(16)} ` +
          `${cost} req ${String(result.totalMs).padStart(6)} ms ` +
          (result.failed.length > 0 ? `FAILED ${result.failed.join(', ')}` : 'ok')
      )
    }

    if (stopped) {
      console.log(`\nToday's free requests are spent. Run again after 00:00 UTC with --resume.`)
    }
    const progress = await readProgress()
    const results = latestPerCase(progress.results, cases)
    const info: RunInfo = {
      mode,
      dates: dateRange(results),
      embedModel: config.embedModel,
      chatModel: config.chatModel,
      rewriteModel: config.rewriteModel,
      vectorBackend: services.vectorIndex.kind === 'atlas' ? 'Atlas' : 'in-app cosine',
      topK: config.topK,
      threshold: config.handoffThreshold,
      total: cases.length,
      warmed: progress.texts,
      warmRequests: progress.requests
    }
    const {summary, markdown} = await write('latest', results, info, cases)
    console.log(`\n${markdown}\n\n${renderFailures(summary)}`)
    console.log(`\n${results.length} of ${cases.length} cases scored.`)
    if (values['write-readme'] && !stopped && results.length === cases.length) {
      const readme = await readFile(README, 'utf8')
      await writeFile(README, replaceResultsSection(readme, markdown))
      console.log('README.md updated')
    }
  } finally {
    await services.close()
  }
})
