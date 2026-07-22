import { getDatabase } from '@netlify/database'

const db = getDatabase()

const json = (statusCode: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { 'content-type': 'application/json' },
  })

export default async (req: Request) => {
  if (req.method !== 'GET') return json(405, { ok: false, error: 'Método no soportado' })

  try {
    const url = new URL(req.url)
    const brandId = url.searchParams.get('brand_id')
    if (!brandId) return json(400, { ok: false, error: 'brand_id es obligatorio' })

    // post_metrics guarda un snapshot por sync (captured_at); nos quedamos solo con el más reciente por post
    // para no duplicar/sobre-contar cuando sync-metrics.ts ya corrió varias veces sobre el mismo post.
    const perPost = await db.sql`
      SELECT * FROM (
        SELECT DISTINCT ON (p.id) p.id, p.copy_text, p.published_at,
               m.likes, m.comments, m.shares, m.reach, m.impressions, m.engagement_rate
        FROM posts p
        JOIN post_metrics m ON m.post_id = p.id
        WHERE p.brand_id = ${brandId}
        ORDER BY p.id, m.captured_at DESC
      ) latest
      ORDER BY published_at DESC
      LIMIT 50
    `

    const bestTimes = await db.sql`
      SELECT weekday, hour, AVG(engagement_rate) AS avg_engagement, COUNT(*) AS sample_size
      FROM (
        SELECT DISTINCT ON (p.id) EXTRACT(DOW FROM p.published_at) AS weekday, EXTRACT(HOUR FROM p.published_at) AS hour,
               m.engagement_rate
        FROM posts p
        JOIN post_metrics m ON m.post_id = p.id
        WHERE p.brand_id = ${brandId} AND m.engagement_rate IS NOT NULL
        ORDER BY p.id, m.captured_at DESC
      ) latest
      GROUP BY weekday, hour
      ORDER BY avg_engagement DESC NULLS LAST
      LIMIT 5
    `

    const insights = await db.sql`
      SELECT insight_type, content, created_at FROM brand_insights
      WHERE brand_id = ${brandId}
      ORDER BY created_at DESC
      LIMIT 5
    `

    return json(200, { ok: true, perPost, bestTimes, insights })
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : 'Error desconocido' })
  }
}
