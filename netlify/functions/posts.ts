import { getDatabase } from '@netlify/database'
import { isAuthorized, unauthorized } from './lib/auth'

const db = getDatabase()

const json = (statusCode: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { 'content-type': 'application/json' },
  })

// Estados que se pueden fijar a mano desde el dashboard (PATCH). 'scheduled'/'published'/'failed' los fija
// el sistema (schedule-post.ts / postiz-webhook.ts) — permitirlos aquí saltaría Postiz por completo.
const PATCHABLE_STATUSES = ['draft', 'image_pending', 'pending_approval', 'approved', 'archived']

export default async (req: Request) => {
  if (!isAuthorized(req)) return unauthorized()

  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    const brandId = url.searchParams.get('brand_id')

    if (req.method === 'GET') {
      if (!brandId) return json(400, { ok: false, error: 'brand_id es obligatorio' })
      const posts = await db.sql`
        SELECT * FROM posts WHERE brand_id = ${brandId} ORDER BY created_at DESC
      `
      return json(200, { ok: true, posts })
    }

    if (req.method === 'PATCH') {
      if (!id) return json(400, { ok: false, error: 'Falta el parámetro id' })
      const { status, copy_text } = await req.json()

      if (status && !PATCHABLE_STATUSES.includes(status)) {
        return json(400, {
          ok: false,
          error: `status inválido para edición manual. Debe ser uno de: ${PATCHABLE_STATUSES.join(', ')}`,
        })
      }

      const [post] = await db.sql`
        UPDATE posts SET
          status = COALESCE(${status ?? null}, status),
          copy_text = COALESCE(${copy_text ?? null}, copy_text)
        WHERE id = ${id}
        RETURNING *
      `
      if (!post) return json(404, { ok: false, error: 'Post no encontrado' })
      return json(200, { ok: true, post })
    }

    return json(405, { ok: false, error: 'Método no soportado' })
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : 'Error desconocido' })
  }
}
