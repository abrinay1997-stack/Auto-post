// Scheduled function (diaria): trae métricas de Metricool para los posts publicados
// y las guarda en post_metrics. El endpoint/campos de Metricool se validan contra
// https://app.metricool.com/resources/apidocs/index.html — ajustar si la respuesta real difiere.
import type { Config } from '@netlify/functions'
import { getDatabase } from '@netlify/database'

const db = getDatabase()

interface MetricoolPost {
  publishDate?: string
  date?: string
  network?: string
  likes?: number
  reactions?: number
  comments?: number
  shares?: number
  reshares?: number
  saves?: number
  reach?: number
  impressions?: number
  views?: number
}

function sameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

export default async () => {
  try {
    const userToken = process.env.METRICOOL_USER_TOKEN
    const userId = process.env.METRICOOL_USER_ID
    if (!userToken || !userId) {
      return new Response(
        JSON.stringify({ ok: false, error: 'METRICOOL_USER_TOKEN / METRICOOL_USER_ID no configuradas' }),
        { status: 500 },
      )
    }

    const brands = await db.sql`SELECT * FROM brands WHERE metricool_blog_id IS NOT NULL`
    let synced = 0

    for (const brand of brands) {
      const since = new Date()
      since.setDate(since.getDate() - 7)
      const posts = await db.sql`
        SELECT * FROM posts
        WHERE brand_id = ${brand.id} AND status = 'published' AND published_at >= ${since.toISOString()}
      `
      if (posts.length === 0) continue

      const response = await fetch(
        `https://app.metricool.com/api/explore/posts/${brand.metricool_blog_id}?userId=${userId}&limit=50`,
        { headers: { 'X-Mc-Auth': userToken } },
      )
      if (!response.ok) continue

      const metricoolPosts: MetricoolPost[] = await response.json()
      // Evita que dos posts nuestros del mismo día/red terminen apuntando al mismo post de Metricool.
      const usedIndexes = new Set<number>()

      for (const post of posts) {
        const matchIndex = metricoolPosts.findIndex((mp, i) => {
          if (usedIndexes.has(i)) return false
          const mpDate = mp.publishDate ?? mp.date
          if (!mpDate || !post.published_at || !sameDay(mpDate, post.published_at)) return false
          // Si Metricool nos da la red social, exigimos que coincida con alguna de las plataformas del post.
          if (mp.network && post.platform && !(post.platform as string[]).includes(mp.network)) return false
          return true
        })
        if (matchIndex === -1) continue
        usedIndexes.add(matchIndex)
        const match = metricoolPosts[matchIndex]

        const likes = match.likes ?? match.reactions ?? 0
        const comments = match.comments ?? 0
        const shares = match.shares ?? match.reshares ?? 0
        const saves = match.saves ?? 0
        const reach = match.reach ?? 0
        const impressions = match.impressions ?? match.views ?? 0
        const engagementRate = impressions > 0 ? (likes + comments + shares) / impressions : null

        await db.sql`
          INSERT INTO post_metrics (post_id, likes, comments, shares, saves, reach, impressions, engagement_rate)
          VALUES (${post.id}, ${likes}, ${comments}, ${shares}, ${saves}, ${reach}, ${impressions}, ${engagementRate})
        `
        synced++
      }
    }

    return new Response(JSON.stringify({ ok: true, synced }), { headers: { 'content-type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Error desconocido' }), {
      status: 500,
    })
  }
}

export const config: Config = { schedule: '0 6 * * *' }
