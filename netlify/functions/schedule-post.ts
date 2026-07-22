import { getDatabase } from '@netlify/database'
import { isAuthorized, unauthorized } from './lib/auth'

const db = getDatabase()

const json = (statusCode: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { 'content-type': 'application/json' },
  })

// No llama a ninguna API externa: solo marca el post como "scheduled". La publicación real
// la hace publish-due-posts.ts (scheduled function) cuando llega scheduled_at, porque Instagram
// no soporta programación nativa vía API — publica de inmediato al llamar media_publish.
export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Método no soportado' })
  if (!isAuthorized(req)) return unauthorized()

  try {
    const { post_id, scheduled_at } = await req.json()
    if (!post_id || !scheduled_at) return json(400, { ok: false, error: 'post_id y scheduled_at son obligatorios' })

    const [post] = await db.sql`SELECT * FROM posts WHERE id = ${post_id}`
    if (!post) return json(404, { ok: false, error: 'Post no encontrado' })
    if (post.status !== 'approved') {
      return json(409, { ok: false, error: `El post debe estar en estado "approved" (actual: ${post.status})` })
    }

    const [brand] = await db.sql`SELECT * FROM brands WHERE id = ${post.brand_id}`
    const missingMeta =
      !brand?.meta_page_access_token ||
      ((post.platform as string[]).includes('facebook') && !brand.meta_page_id) ||
      ((post.platform as string[]).includes('instagram') && !brand.meta_ig_user_id)
    if (missingMeta) {
      return json(400, { ok: false, error: 'La marca no tiene configurados los datos de Meta (meta_page_id / meta_ig_user_id / meta_page_access_token)' })
    }

    const [updated] = await db.sql`
      UPDATE posts SET status = 'scheduled', scheduled_at = ${scheduled_at}
      WHERE id = ${post_id}
      RETURNING *
    `

    return json(200, { ok: true, post: updated })
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : 'Error desconocido' })
  }
}
