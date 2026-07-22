// Scheduled function (semanal): Claude analiza los posts con mejor desempeño de los últimos 7 días
// y escribe patrones en brand_insights. generate-batch.ts luego inyecta estos insights en el prompt.
import type { Config } from '@netlify/functions'
import { getDatabase } from '@netlify/database'
import Anthropic from '@anthropic-ai/sdk'

const db = getDatabase()

export default async () => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ ok: false, error: 'ANTHROPIC_API_KEY no configurada' }), { status: 500 })
    }

    const anthropic = new Anthropic({ apiKey })
    const brands = await db.sql`SELECT * FROM brands`
    let analyzed = 0

    for (const brand of brands) {
      const since = new Date()
      since.setDate(since.getDate() - 7)

      // post_metrics guarda un snapshot por sync; nos quedamos con el más reciente por post para no repetir
      // el mismo post varias veces en el "top 10" (ver auditoría 2026-07-22).
      const topPosts = await db.sql`
        SELECT * FROM (
          SELECT DISTINCT ON (p.id) p.copy_text, p.platform, p.image_prompt,
                 m.likes, m.comments, m.shares, m.reach, m.impressions, m.engagement_rate
          FROM posts p
          JOIN post_metrics m ON m.post_id = p.id
          WHERE p.brand_id = ${brand.id} AND p.published_at >= ${since.toISOString()}
          ORDER BY p.id, m.captured_at DESC
        ) latest
        ORDER BY engagement_rate DESC NULLS LAST
        LIMIT 10
      `

      if (topPosts.length === 0) continue

      const prompt = `Eres un analista de redes sociales para la marca "${brand.name}".

Estos son los posts de los últimos 7 días con sus métricas:
${JSON.stringify(topPosts, null, 2)}

Analiza qué formatos, temas y horarios funcionaron mejor. Responde SOLO con un objeto JSON, sin texto adicional, con esta forma exacta:
{
  "viral_pattern": "descripción breve de qué tipo de contenido generó más engagement",
  "top_hashtags": ["#ejemplo"],
  "recommendation": "una frase accionable para el próximo lote de contenido"
}`

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })

      const textBlock = message.content.find((block) => block.type === 'text')
      if (!textBlock || textBlock.type !== 'text') continue

      let insight: unknown
      try {
        const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/)
        insight = JSON.parse(jsonMatch ? jsonMatch[0] : textBlock.text)
      } catch {
        continue
      }

      await db.sql`
        INSERT INTO brand_insights (brand_id, insight_type, content, source)
        VALUES (${brand.id}, 'viral_pattern', ${JSON.stringify(insight)}, 'claude_analysis')
      `
      analyzed++
    }

    return new Response(JSON.stringify({ ok: true, analyzed }), { headers: { 'content-type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Error desconocido' }), {
      status: 500,
    })
  }
}

export const config: Config = { schedule: '0 8 * * 1' }
