import { createHmac, timingSafeEqual } from 'node:crypto'

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 días

function sign(expiry: number, secret: string) {
  return createHmac('sha256', secret).update(String(expiry)).digest('hex')
}

export function issueToken(): string {
  const secret = process.env.APP_SESSION_SECRET
  if (!secret) throw new Error('APP_SESSION_SECRET no configurada')
  const expiry = Date.now() + SESSION_TTL_MS
  return `${expiry}.${sign(expiry, secret)}`
}

export function isAuthorized(req: Request): boolean {
  const secret = process.env.APP_SESSION_SECRET
  if (!secret) return false

  const header = req.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return false

  const [expiryStr, signature] = header.slice('Bearer '.length).split('.')
  const expiry = Number(expiryStr)
  if (!expiry || !signature || expiry < Date.now()) return false

  const expected = sign(expiry, secret)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export const unauthorized = () =>
  new Response(JSON.stringify({ ok: false, error: 'No autorizado' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  })
