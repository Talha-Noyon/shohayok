import {once} from 'node:events'
import type {Server} from 'node:http'
import type {AddressInfo} from 'node:net'

import type {Express} from 'express'

export async function listen(app: Express): Promise<{url: string; server: Server}> {
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const {port} = server.address() as AddressInfo
  return {url: `http://127.0.0.1:${port}`, server}
}

export async function postChat(
  url: string,
  message: unknown,
  conversationId?: string
): Promise<Response> {
  return fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({message, conversationId})
  })
}

export async function readEvents(
  response: Response
): Promise<{type: string; [key: string]: unknown}[]> {
  const text = await response.text()
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as {type: string})
}
