import { getDatabase } from '@netlify/database'
import Anthropic from '@anthropic-ai/sdk'

const db = getDatabase()

const json = (statusCode: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { 'content-type': 'application/json' },
  })

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Método no soportado' })

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return json(500, { ok: false, error: 'ANTHROPIC_API_KEY no configurada' })

    const { post_id } = await req.json()
    if (!post_id) return json(400, { ok: false, error: 'post_id es obligatorio' })

    const [post] = await db.sql`SELECT * FROM posts WHERE id = ${post_id}`
    if (!post) return json(404, { ok: false, error: 'Post no encontrado' })

    const [brand] = await db.sql`SELECT * FROM brands WHERE id = ${post.brand_id}`

    const prompt = `Eres el redactor de contenido de la marca "${brand?.name ?? ''}".

Perfil de voz: ${JSON.stringify(brand?.voice_profile)}
Público: ${JSON.stringify(brand?.audience)}

Copy actual de este post: ${post.copy_text}
Tema de la imagen: ${post.image_prompt}

Reescribe el copy de este post con un ángulo distinto, manteniendo la voz de la marca. Responde SOLO con un objeto JSON, sin texto adicional, con esta forma exacta:
{ "copy_text": "string", "copy_variants": ["variante A", "variante B"] }`

    const anthropic = new Anthropic({ apiKey })
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = message.content.find((block) => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return json(502, { ok: false, error: 'Claude no devolvió texto' })
    }

    let result: { copy_text: string; copy_variants?: string[] }
    try {
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/)
      result = JSON.parse(jsonMatch ? jsonMatch[0] : textBlock.text)
    } catch {
      return json(502, { ok: false, error: 'Claude no devolvió JSON válido', raw: textBlock.text })
    }

    // El copy cambió: si el post ya estaba aprobado/programado, hay que forzar una nueva revisión humana
    // antes de que pueda programarse (mismo criterio que generate-image.ts al regenerar la imagen).
    const [updated] = await db.sql`
      UPDATE posts SET
        copy_text = ${result.copy_text},
        copy_variants = ${JSON.stringify(result.copy_variants ?? [])},
        status = 'pending_approval'
      WHERE id = ${post_id}
      RETURNING *
    `

    return json(200, { ok: true, post: updated })
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : 'Error desconocido' })
  }
}
