import { getDatabase } from '@netlify/database'

const db = getDatabase()

const json = (statusCode: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { 'content-type': 'application/json' },
  })

const VALID_STATUSES = [
  'draft',
  'image_pending',
  'pending_approval',
  'approved',
  'scheduled',
  'published',
  'failed',
  'archived',
]

export default async (req: Request) => {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const brandId = url.searchParams.get('brand_id')

  if (req.method === 'GET') {
    if (!brandId) return json(400, { ok: false, error: 'brand_id es obligatorio' })
    const posts = await db.sql`
      SELECT * FROM posts WHERE brand_id = ${brandId} ORDER BY created_at DESC
    `
    return json(200, { ok: true, posts })
  }

  if (req.method === 'PATCH') {
    if (!id) return json(400, { ok: false, error: 'Falta el parámetro id' })
    const { status, copy_text } = await req.json()

    if (status && !VALID_STATUSES.includes(status)) {
      return json(400, { ok: false, error: `status inválido. Debe ser uno de: ${VALID_STATUSES.join(', ')}` })
    }

    const [post] = await db.sql`
      UPDATE posts SET
        status = COALESCE(${status ?? null}, status),
        copy_text = COALESCE(${copy_text ?? null}, copy_text)
      WHERE id = ${id}
      RETURNING *
    `
    if (!post) return json(404, { ok: false, error: 'Post no encontrado' })
    return json(200, { ok: true, post })
  }

  return json(405, { ok: false, error: 'Método no soportado' })
}
