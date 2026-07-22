// Scheduled function: publica los posts en estado 'scheduled' cuya scheduled_at ya llegó,
// llamando directo a la Graph API de Meta (ver lib/meta.ts). Reemplaza a Postiz (2026-07-22).
import type { Config } from '@netlify/functions'
import { getDatabase } from '@netlify/database'
import { publishToMeta } from './lib/meta'

const db = getDatabase()

export default async () => {
  try {
    const duePosts = await db.sql`
      SELECT * FROM posts WHERE status = 'scheduled' AND scheduled_at <= now()
    `

    let published = 0
    let failed = 0

    for (const post of duePosts) {
      const [brand] = await db.sql`SELECT * FROM brands WHERE id = ${post.brand_id}`
      const imageUrl = post.image_urls?.[0]

      if (!brand || !imageUrl) {
        await db.sql`UPDATE posts SET status = 'failed' WHERE id = ${post.id}`
        failed++
        continue
      }

      const metaBrand = brand as {
        meta_page_id: string | null
        meta_ig_user_id: string | null
        meta_page_access_token: string | null
      }
      const results = await Promise.all(
        (post.platform as string[]).map((platform) => publishToMeta(platform, metaBrand, imageUrl, post.copy_text)),
      )

      const allOk = results.every((r) => r.success)
      if (allOk) {
        await db.sql`
          UPDATE posts SET status = 'published', published_at = now(), platform_results = ${JSON.stringify(results)}
          WHERE id = ${post.id}
        `
        published++
      } else {
        // Fallo parcial (ej. Facebook publicó pero Instagram no): platform_results queda guardado
        // para que el operador vea qué plataforma ya publicó antes de reintentar manualmente,
        // y no vuelva a publicar por duplicado en la que sí funcionó.
        console.error(`Post ${post.id} falló al publicar:`, results.filter((r) => !r.success))
        await db.sql`
          UPDATE posts SET status = 'failed', platform_results = ${JSON.stringify(results)}
          WHERE id = ${post.id}
        `
        failed++
      }
    }

    return new Response(JSON.stringify({ ok: true, published, failed }), {
      headers: { 'content-type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Error desconocido' }), {
      status: 500,
    })
  }
}

export const config: Config = { schedule: '*/10 * * * *' }
