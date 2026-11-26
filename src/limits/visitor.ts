import {createHmac} from 'node:crypto'

type Headers = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim() || undefined

/** The client's address as the proxy forwarded it. Vercel puts it first in x-forwarded-for. */
export function clientIp(headers: Headers, fallback?: string): string {
  return first(headers['x-forwarded-for']) ?? first(headers['x-real-ip']) ?? fallback ?? 'unknown'
}

/**
 * Visitors are counted by a keyed hash of their address. Without the key, the 4 billion IPv4
 * addresses could be hashed one by one to find whose it is; with it, the hash says nothing.
 */
export function visitorId(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(ip).digest('base64url').slice(0, 16)
}
