import { getDatabase } from '@netlify/database'
import Anthropic from '@anthropic-ai/sdk'

const db = getDatabase()

const json = (statusCode: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { 'content-type': 'application/json' },
  })

interface GeneratedPost {
  copy_text: string
  copy_variants?: string[]
  image_prompt: string
  platform: string[]
  hashtags?: string[]
}

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Método no soportado' })

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return json(500, { ok: false, error: 'ANTHROPIC_API_KEY no configurada' })

    const { brand_id, brief, count = 10 } = await req.json()
    if (!brand_id || !brief) return json(400, { ok: false, error: 'brand_id y brief son obligatorios' })

    const [brand] = await db.sql`SELECT * FROM brands WHERE id = ${brand_id}`
    if (!brand) return json(404, { ok: false, error: 'Marca no encontrada' })

    const insights = await db.sql`
      SELECT insight_type, content FROM brand_insights
      WHERE brand_id = ${brand_id}
      ORDER BY created_at DESC
      LIMIT 3
    `

    const anthropic = new Anthropic({ apiKey })

    const insightsBlock =
      insights.length > 0
        ? `\nAprendizajes de lotes anteriores (qué funcionó, úsalo para orientar este lote): ${JSON.stringify(insights.map((i) => i.content))}\n`
        : ''

    const prompt = `Eres el redactor de contenido de la marca "${brand.name}".

Perfil de voz: ${JSON.stringify(brand.voice_profile)}
Perfil visual: ${JSON.stringify(brand.visual_profile)}
Público: ${JSON.stringify(brand.audience)}
Hashtags disponibles: ${JSON.stringify(brand.hashtag_sets)}
${insightsBlock}
Brief de esta tanda: ${brief}

Genera ${count} posts para redes sociales siguiendo la voz de la marca. Responde SOLO con un array JSON válido, sin texto adicional, donde cada elemento tiene esta forma exacta:
{
  "copy_text": "string",
  "copy_variants": ["variante A", "variante B"],
  "image_prompt": "string en inglés, describe la imagen para un generador de imágenes",
  "platform": ["instagram", "facebook"],
  "hashtags": ["#ejemplo"]
}`

    // ~400-500 tokens por post (copy + 2 variantes + image_prompt + hashtags); hasta 20 posts (máximo de la UI) puede
    // necesitar ~10k tokens de salida. 8192 cubre el caso normal con margen; si Claude igual corta, el catch de abajo
    // devuelve un 502 claro en vez de reventar.
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = message.content.find((block) => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return json(502, { ok: false, error: 'Claude no devolvió texto' })
    }

    let posts: GeneratedPost[]
    try {
      const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/)
      posts = JSON.parse(jsonMatch ? jsonMatch[0] : textBlock.text)
    } catch {
      return json(502, { ok: false, error: 'Claude no devolvió JSON válido (posible corte por límite de tokens)', raw: textBlock.text })
    }

    const batchId = crypto.randomUUID()

    const inserted = []
    for (const post of posts) {
      const [row] = await db.sql`
        INSERT INTO posts (brand_id, status, platform, copy_text, copy_variants, image_prompt, batch_id)
        VALUES (${brand_id}, 'draft', ${post.platform}, ${post.copy_text}, ${JSON.stringify(post.copy_variants ?? [])}, ${post.image_prompt}, ${batchId})
        RETURNING *
      `
      inserted.push(row)
    }

    return json(201, { ok: true, batch_id: batchId, posts: inserted })
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : 'Error desconocido' })
  }
}
