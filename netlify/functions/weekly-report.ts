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
  try {
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
      // post_metrics guarda un snapshot por sync; nos quedamos con el más reciente por post antes de sumar,
      // si no un post sincronizado varias veces infla el total (ver auditoría 2026-07-22).
      const [stats] = await db.sql`
        WITH latest_metrics AS (
          SELECT DISTINCT ON (post_id) post_id, likes, comments, shares
          FROM post_metrics
          ORDER BY post_id, captured_at DESC
        )
        SELECT
          COUNT(DISTINCT p.id) AS published,
          COALESCE(SUM(lm.likes), 0) AS likes,
          COALESCE(SUM(lm.comments), 0) AS comments,
          COALESCE(SUM(lm.shares), 0) AS shares
        FROM posts p
        LEFT JOIN latest_metrics lm ON lm.post_id = p.id
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
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Error desconocido' }), {
      status: 500,
    })
  }
}

export const config: Config = { schedule: '0 9 * * 1' }
