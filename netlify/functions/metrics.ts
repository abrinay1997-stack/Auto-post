import { getDatabase } from '@netlify/database'

const db = getDatabase()

const json = (statusCode: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { 'content-type': 'application/json' },
  })

export default async (req: Request) => {
  if (req.method !== 'GET') return json(405, { ok: false, error: 'Método no soportado' })

  const url = new URL(req.url)
  const brandId = url.searchParams.get('brand_id')
  if (!brandId) return json(400, { ok: false, error: 'brand_id es obligatorio' })

  const perPost = await db.sql`
    SELECT p.id, p.copy_text, p.published_at, m.likes, m.comments, m.shares, m.reach, m.impressions, m.engagement_rate
    FROM posts p
    JOIN post_metrics m ON m.post_id = p.id
    WHERE p.brand_id = ${brandId}
    ORDER BY p.published_at DESC
    LIMIT 50
  `

  const bestTimes = await db.sql`
    SELECT EXTRACT(DOW FROM p.published_at) AS weekday, EXTRACT(HOUR FROM p.published_at) AS hour,
           AVG(m.engagement_rate) AS avg_engagement, COUNT(*) AS sample_size
    FROM posts p
    JOIN post_metrics m ON m.post_id = p.id
    WHERE p.brand_id = ${brandId} AND m.engagement_rate IS NOT NULL
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
}
