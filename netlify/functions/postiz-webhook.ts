// Endpoint a configurar en Postiz para recibir notificaciones de cambio de estado de un post.
// Postiz debe apuntar su webhook de "post published/failed" a https://<sitio>/api/postiz-webhook
import { getDatabase } from '@netlify/database'

const db = getDatabase()

const json = (statusCode: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { 'content-type': 'application/json' },
  })

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Método no soportado' })

  const secret = process.env.POSTIZ_WEBHOOK_SECRET
  if (secret && req.headers.get('x-webhook-secret') !== secret) {
    return json(401, { ok: false, error: 'Firma de webhook inválida' })
  }

  const payload = await req.json()
  const postizPostId = payload?.postId ?? payload?.id
  const status = payload?.status // esperado: 'published' | 'failed'

  if (!postizPostId || !status) {
    return json(400, { ok: false, error: 'payload sin postId/status' })
  }

  if (status === 'published') {
    const [post] = await db.sql`
      UPDATE posts SET status = 'published', published_at = now()
      WHERE postiz_post_id = ${postizPostId}
      RETURNING *
    `
    return json(200, { ok: true, post: post ?? null })
  }

  if (status === 'failed') {
    const [post] = await db.sql`
      UPDATE posts SET status = 'failed'
      WHERE postiz_post_id = ${postizPostId}
      RETURNING *
    `
    return json(200, { ok: true, post: post ?? null })
  }

  return json(200, { ok: true, ignored: true })
}
