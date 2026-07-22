// Servidor MCP remoto de Auto Post — para conectar desde Claude.ai/Cowork como "custom connector".
// Auth: header `Authorization: Bearer <MCP_API_TOKEN>` (credencial fija, no la sesión del dashboard).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import { getDatabase } from '@netlify/database'

const db = getDatabase()

// Mismos estados permitidos que posts.ts (PATCH) — 'scheduled'/'published'/'failed' los fija el sistema
// al programar/publicar de verdad, nunca una edición manual (ver auditoría 2026-07-22).
const PATCHABLE_STATUSES = ['draft', 'image_pending', 'pending_approval', 'approved', 'archived'] as const

function buildServer() {
  const server = new McpServer({ name: 'auto-post', version: '1.0.0' })

  server.registerTool(
    'list_brands',
    { description: 'Lista las marcas registradas en Auto Post (id, nombre, slug).' },
    async () => {
      const brands = await db.sql`SELECT id, name, slug FROM brands ORDER BY name`
      return { content: [{ type: 'text' as const, text: JSON.stringify(brands) }] }
    },
  )

  server.registerTool(
    'list_posts',
    {
      description: 'Lista los posts de una marca, opcionalmente filtrados por estado.',
      inputSchema: {
        brand_id: z.string().describe('ID de la marca'),
        status: z
          .enum(['draft', 'image_pending', 'pending_approval', 'approved', 'scheduled', 'published', 'failed', 'archived'])
          .optional()
          .describe('Filtrar por estado'),
      },
    },
    async ({ brand_id, status }) => {
      const posts = status
        ? await db.sql`SELECT * FROM posts WHERE brand_id = ${brand_id} AND status = ${status} ORDER BY created_at DESC`
        : await db.sql`SELECT * FROM posts WHERE brand_id = ${brand_id} ORDER BY created_at DESC`
      return { content: [{ type: 'text' as const, text: JSON.stringify(posts) }] }
    },
  )

  server.registerTool(
    'get_post',
    {
      description: 'Trae el detalle completo de un post: copy, variantes, prompt de imagen, URL de imagen y plataformas.',
      inputSchema: { post_id: z.string() },
    },
    async ({ post_id }) => {
      const [post] = await db.sql`SELECT * FROM posts WHERE id = ${post_id}`
      if (!post) return { content: [{ type: 'text' as const, text: 'Post no encontrado' }], isError: true }
      return { content: [{ type: 'text' as const, text: JSON.stringify(post) }] }
    },
  )

  server.registerTool(
    'update_post_status',
    {
      description: `Cambia el estado de un post. Estados permitidos: ${PATCHABLE_STATUSES.join(', ')}. No permite fijar 'scheduled'/'published'/'failed' — esos los pone el sistema al programar/publicar de verdad vía Postiz.`,
      inputSchema: {
        post_id: z.string(),
        status: z.enum(PATCHABLE_STATUSES),
      },
    },
    async ({ post_id, status }) => {
      const [post] = await db.sql`UPDATE posts SET status = ${status} WHERE id = ${post_id} RETURNING *`
      if (!post) return { content: [{ type: 'text' as const, text: 'Post no encontrado' }], isError: true }
      return { content: [{ type: 'text' as const, text: JSON.stringify(post) }] }
    },
  )

  return server
}

export default async (req: Request) => {
  const token = process.env.MCP_API_TOKEN
  const authHeader = req.headers.get('authorization')
  if (!token || authHeader !== `Bearer ${token}`) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    const server = buildServer()
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await server.connect(transport)
    return await transport.handleRequest(req)
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Error desconocido' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
