import type { Handler } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'

export const handler: Handler = async () => {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: 'ANTHROPIC_API_KEY no configurada' }),
    }
  }

  const anthropic = new Anthropic({ apiKey })
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 32,
    messages: [{ role: 'user', content: 'Responde solo con: OK' }],
  })

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ok: true, claude: message.content }),
  }
}
