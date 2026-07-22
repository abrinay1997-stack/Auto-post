import Anthropic from '@anthropic-ai/sdk'
import { isAuthorized, unauthorized } from './lib/auth'

const json = (statusCode: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { 'content-type': 'application/json' },
  })

export default async (req: Request) => {
  if (!isAuthorized(req)) return unauthorized()

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return json(500, { ok: false, error: 'ANTHROPIC_API_KEY no configurada' })

    const anthropic = new Anthropic({ apiKey })
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 32,
      messages: [{ role: 'user', content: 'Responde solo con: OK' }],
    })

    return json(200, { ok: true, claude: message.content })
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : 'Error desconocido' })
  }
}
