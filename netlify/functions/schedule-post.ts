import { getDatabase } from '@netlify/database'

const db = getDatabase()

const json = (statusCode: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { 'content-type': 'application/json' },
  })

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Método no soportado' })

  try {
    const postizUrl = process.env.POSTIZ_API_URL
    const postizKey = process.env.POSTIZ_API_KEY
    if (!postizUrl || !postizKey) {
      return json(500, { ok: false, error: 'POSTIZ_API_URL / POSTIZ_API_KEY no configuradas' })
    }

    const { post_id, scheduled_at } = await req.json()
    if (!post_id || !scheduled_at) return json(400, { ok: false, error: 'post_id y scheduled_at son obligatorios' })

    const [post] = await db.sql`SELECT * FROM posts WHERE id = ${post_id}`
    if (!post) return json(404, { ok: false, error: 'Post no encontrado' })
    if (post.status !== 'approved') {
      return json(409, { ok: false, error: `El post debe estar en estado "approved" (actual: ${post.status})` })
    }

    const [brand] = await db.sql`SELECT * FROM brands WHERE id = ${post.brand_id}`
    const integrationIds = (brand?.postiz_integration_ids ?? {}) as Record<string, string>

    const missingPlatforms = (post.platform as string[]).filter((platform) => !integrationIds[platform])
    if (missingPlatforms.length > 0) {
      return json(400, {
        ok: false,
        error: `La marca no tiene cuenta de Postiz conectada para: ${missingPlatforms.join(', ')}`,
      })
    }

    const postizBody = {
      type: 'schedule',
      date: scheduled_at,
      shortLink: false,
      tags: [],
      posts: (post.platform as string[]).map((platform) => ({
        integration: { id: integrationIds[platform] },
        value: [
          {
            content: post.copy_text,
            image: (post.image_urls ?? []).map((url: string) => ({ path: url })),
          },
        ],
        settings: { __type: platform },
      })),
    }

    const response = await fetch(`${postizUrl}/public/v1/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: postizKey },
      body: JSON.stringify(postizBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return json(502, { ok: false, error: `Postiz respondió ${response.status}: ${errorText}` })
    }

    const postizResult = await response.json()
    const postizPostId = postizResult?.id ?? postizResult?.posts?.[0]?.id ?? null

    const [updated] = await db.sql`
      UPDATE posts SET status = 'scheduled', scheduled_at = ${scheduled_at}, postiz_post_id = ${postizPostId}
      WHERE id = ${post_id}
      RETURNING *
    `

    return json(200, { ok: true, post: updated })
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : 'Error desconocido' })
  }
}
