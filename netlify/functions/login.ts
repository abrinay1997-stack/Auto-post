import bcrypt from 'bcryptjs'
import { issueToken } from './lib/auth'

const json = (statusCode: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { 'content-type': 'application/json' },
  })

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Método no soportado' })

  try {
    const hash = process.env.APP_PASSWORD_HASH
    if (!hash) return json(500, { ok: false, error: 'APP_PASSWORD_HASH no configurada' })

    const { password } = await req.json()
    if (!password) return json(400, { ok: false, error: 'password es obligatoria' })

    const valid = await bcrypt.compare(password, hash)
    if (!valid) return json(401, { ok: false, error: 'Contraseña incorrecta' })

    return json(200, { ok: true, token: issueToken() })
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : 'Error desconocido' })
  }
}
