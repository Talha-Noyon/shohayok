import {writeFile} from 'node:fs/promises'

import {generateShop} from '../shop/generate.js'
import {DATA_DIR} from '../shop/schema.js'
import {runCli} from './run.js'

/** One item per line, so a change to the generator shows up as a readable diff */
function jsonLines(items: unknown[]): string {
  return `[\n${items.map((item) => JSON.stringify(item)).join(',\n')}\n]\n`
}

/** Writes the generated catalogue and orders to data/. The same seed always gives the same shop. */
await runCli(async () => {
  const {products, orders} = generateShop()
  await writeFile(new URL('products.json', DATA_DIR), jsonLines(products))
  await writeFile(new URL('orders.json', DATA_DIR), jsonLines(orders))
  console.log(`Wrote ${products.length} products and ${orders.length} orders to data/`)
})
