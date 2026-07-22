// Scheduled function (lunes): envía por Resend un reporte HTML semanal por marca.
import type { Config } from '@netlify/functions'
import { getDatabase } from '@netlify/database'

const db = getDatabase()

function renderReport(brandName: string, stats: { published: number; likes: number; comments: number; shares: number }) {
  return `
    <h1>Reporte semanal — ${brandName}</h1>
    <ul>
      <li>Posts publicados: ${stats.published}</li>
      <li>Likes totales: ${stats.likes}</li>
      <li>Comentarios totales: ${stats.comments}</li>
      <li>Compartidos totales: ${stats.shares}</li>
    </ul>
  `
}

export default async () => {
  const resendKey = process.env.RESEND_API_KEY
  const reportTo = process.env.WEEKLY_REPORT_TO
  // Debe ser un remitente de un dominio verificado en Resend (https://resend.com/domains).
  const reportFrom = process.env.WEEKLY_REPORT_FROM
  if (!resendKey || !reportTo || !reportFrom) {
    return new Response(
      JSON.stringify({ ok: false, error: 'RESEND_API_KEY / WEEKLY_REPORT_TO / WEEKLY_REPORT_FROM no configuradas' }),
      { status: 500 },
    )
  }

  const since = new Date()
  since.setDate(since.getDate() - 7)

  const brands = await db.sql`SELECT * FROM brands`
  let sent = 0

  for (const brand of brands) {
    const [stats] = await db.sql`
      SELECT
        COUNT(DISTINCT p.id) AS published,
        COALESCE(SUM(m.likes), 0) AS likes,
        COALESCE(SUM(m.comments), 0) AS comments,
        COALESCE(SUM(m.shares), 0) AS shares
      FROM posts p
      LEFT JOIN post_metrics m ON m.post_id = p.id
      WHERE p.brand_id = ${brand.id} AND p.status = 'published' AND p.published_at >= ${since.toISOString()}
    `
    if (!stats || Number(stats.published) === 0) continue

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: reportFrom,
        to: reportTo,
        subject: `Reporte semanal — ${brand.name}`,
        html: renderReport(brand.name, {
          published: Number(stats.published),
          likes: Number(stats.likes),
          comments: Number(stats.comments),
          shares: Number(stats.shares),
        }),
      }),
    })
    sent++
  }

  return new Response(JSON.stringify({ ok: true, sent }), { headers: { 'content-type': 'application/json' } })
}

export const config: Config = { schedule: '0 9 * * 1' }
