import type { Handler } from '@netlify/functions'
import { getDatabase } from '@netlify/database'

const db = getDatabase()

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export const handler: Handler = async (event) => {
  const id = event.queryStringParameters?.id

  try {
    if (event.httpMethod === 'GET') {
      if (id) {
        const [brand] = await db.sql`SELECT * FROM brands WHERE id = ${id}`
        if (!brand) return json(404, { ok: false, error: 'Marca no encontrada' })
        return json(200, { ok: true, brand })
      }
      const brands = await db.sql`SELECT * FROM brands ORDER BY created_at DESC`
      return json(200, { ok: true, brands })
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}')
      const { name, slug, voice_profile, visual_profile, audience, hashtag_sets } = body
      if (!name || !slug) return json(400, { ok: false, error: 'name y slug son obligatorios' })

      const [brand] = await db.sql`
        INSERT INTO brands (name, slug, voice_profile, visual_profile, audience, hashtag_sets)
        VALUES (${name}, ${slug}, ${voice_profile ?? null}, ${visual_profile ?? null}, ${audience ?? null}, ${hashtag_sets ?? null})
        RETURNING *
      `
      return json(201, { ok: true, brand })
    }

    if (event.httpMethod === 'PUT') {
      if (!id) return json(400, { ok: false, error: 'Falta el parámetro id' })
      const body = JSON.parse(event.body || '{}')
      const { name, voice_profile, visual_profile, audience, hashtag_sets } = body

      const [brand] = await db.sql`
        UPDATE brands SET
          name = COALESCE(${name ?? null}, name),
          voice_profile = COALESCE(${voice_profile ?? null}, voice_profile),
          visual_profile = COALESCE(${visual_profile ?? null}, visual_profile),
          audience = COALESCE(${audience ?? null}, audience),
          hashtag_sets = COALESCE(${hashtag_sets ?? null}, hashtag_sets)
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
