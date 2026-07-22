import { getDatabase } from '@netlify/database'
import { getStore } from '@netlify/blobs'
import { GoogleGenAI } from '@google/genai'
import { isAuthorized, unauthorized } from './lib/auth'

const db = getDatabase()

const json = (statusCode: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { 'content-type': 'application/json' },
  })

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Método no soportado' })
  if (!isAuthorized(req)) return unauthorized()

  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return json(500, { ok: false, error: 'GEMINI_API_KEY no configurada' })

    const { post_id } = await req.json()
    if (!post_id) return json(400, { ok: false, error: 'post_id es obligatorio' })

    const [post] = await db.sql`SELECT * FROM posts WHERE id = ${post_id}`
    if (!post) return json(404, { ok: false, error: 'Post no encontrado' })

    const [brand] = await db.sql`SELECT * FROM brands WHERE id = ${post.brand_id}`

    const stylePrompt = brand?.visual_profile
      ? `Estilo visual de la marca: ${JSON.stringify(brand.visual_profile)}. `
      : ''
    const fullPrompt = `${stylePrompt}${post.image_prompt}`

    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: fullPrompt,
    })

    const parts = response.candidates?.[0]?.content?.parts ?? []
    const imagePart = parts.find((part) => part.inlineData?.data)
    if (!imagePart?.inlineData?.data) {
      return json(502, { ok: false, error: 'Gemini no devolvió una imagen' })
    }

    const mimeType = imagePart.inlineData.mimeType ?? 'image/png'
    const bytes = Buffer.from(imagePart.inlineData.data, 'base64')
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

    const store = getStore('post-images')
    await store.set(post_id, arrayBuffer, { metadata: { contentType: mimeType } })

    // URL absoluta: la Graph API de Meta necesita poder descargarla, una ruta relativa no le sirve.
    const imageUrl = `${new URL(req.url).origin}/api/images/${post_id}`
    const [updated] = await db.sql`
      UPDATE posts SET image_urls = ${[imageUrl]}, status = 'pending_approval'
      WHERE id = ${post_id}
      RETURNING *
    `

    return json(200, { ok: true, post: updated })
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : 'Error desconocido' })
  }
}
