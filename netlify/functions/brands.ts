import { getDatabase } from '@netlify/database'
import { isAuthorized, unauthorized } from './lib/auth'

const db = getDatabase()

const json = (statusCode: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { 'content-type': 'application/json' },
  })

export default async (req: Request) => {
  if (!isAuthorized(req)) return unauthorized()

  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  try {
    if (req.method === 'GET') {
      if (id) {
        const [brand] = await db.sql`SELECT * FROM brands WHERE id = ${id}`
        if (!brand) return json(404, { ok: false, error: 'Marca no encontrada' })
        return json(200, { ok: true, brand })
      }
      const brands = await db.sql`SELECT * FROM brands ORDER BY created_at DESC`
      return json(200, { ok: true, brands })
    }

    if (req.method === 'POST') {
      const { name, slug, voice_profile, visual_profile, audience, hashtag_sets } = await req.json()
      if (!name || !slug) return json(400, { ok: false, error: 'name y slug son obligatorios' })

      const [brand] = await db.sql`
        INSERT INTO brands (name, slug, voice_profile, visual_profile, audience, hashtag_sets)
        VALUES (${name}, ${slug}, ${voice_profile ?? null}, ${visual_profile ?? null}, ${audience ?? null}, ${hashtag_sets ?? null})
        RETURNING *
      `
      return json(201, { ok: true, brand })
    }

    if (req.method === 'PUT') {
      if (!id) return json(400, { ok: false, error: 'Falta el parámetro id' })
      const { name, voice_profile, visual_profile, audience, hashtag_sets, metricool_blog_id } = await req.json()

      const [brand] = await db.sql`
        UPDATE brands SET
          name = COALESCE(${name ?? null}, name),
          voice_profile = COALESCE(${voice_profile ?? null}, voice_profile),
          visual_profile = COALESCE(${visual_profile ?? null}, visual_profile),
          audience = COALESCE(${audience ?? null}, audience),
          hashtag_sets = COALESCE(${hashtag_sets ?? null}, hashtag_sets),
          metricool_blog_id = COALESCE(${metricool_blog_id ?? null}, metricool_blog_id)
        WHERE id = ${id}
        RETURNING *
      `
      if (!brand) return json(404, { ok: false, error: 'Marca no encontrada' })
      return json(200, { ok: true, brand })
    }

    return json(405, { ok: false, error: 'Método no soportado' })
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : 'Error desconocido' })
  }
}
