import type { Handler } from '@netlify/functions'
import { getDatabase } from '@netlify/database'
import Anthropic from '@anthropic-ai/sdk'

const db = getDatabase()

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

interface GeneratedPost {
  copy_text: string
  copy_variants?: string[]
  image_prompt: string
  platform: string[]
  hashtags?: string[]
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Método no soportado' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json(500, { ok: false, error: 'ANTHROPIC_API_KEY no configurada' })

  const body = JSON.parse(event.body || '{}')
  const { brand_id, brief, count = 10 } = body
  if (!brand_id || !brief) return json(400, { ok: false, error: 'brand_id y brief son obligatorios' })

  const [brand] = await db.sql`SELECT * FROM brands WHERE id = ${brand_id}`
  if (!brand) return json(404, { ok: false, error: 'Marca no encontrada' })

  const anthropic = new Anthropic({ apiKey })

  const prompt = `Eres el redactor de contenido de la marca "${brand.name}".

Perfil de voz: ${JSON.stringify(brand.voice_profile)}
Perfil visual: ${JSON.stringify(brand.visual_profile)}
Público: ${JSON.stringify(brand.audience)}
Hashtags disponibles: ${JSON.stringify(brand.hashtag_sets)}

Brief de esta tanda: ${brief}

Genera ${count} posts para redes sociales siguiendo la voz de la marca. Responde SOLO con un array JSON válido, sin texto adicional, donde cada elemento tiene esta forma exacta:
{
  "copy_text": "string",
  "copy_variants": ["variante A", "variante B"],
  "image_prompt": "string en inglés, describe la imagen para un generador de imágenes",
  "platform": ["instagram", "facebook"],
  "hashtags": ["#ejemplo"]
}`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
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
    return json(502, { ok: false, error: 'Claude no devolvió JSON válido', raw: textBlock.text })
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
}
