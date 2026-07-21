// Sincroniza brands/<cliente>/brand.md -> tabla `brands` de Netlify DB.
// Requiere correr con `netlify dev:exec` (o NETLIFY_DATABASE_URL en el entorno) para tener conexión a la base.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDatabase } from '@netlify/database'

const BRANDS_DIR = join(import.meta.dirname, '..', 'brands')

function parseSections(markdown: string): Record<string, string> {
  const sections: Record<string, string> = {}
  const parts = markdown.split(/\n## /).slice(1) // descarta el título "# Marca: ..."
  for (const part of parts) {
    const [heading, ...rest] = part.split('\n')
    sections[heading.trim()] = rest.join('\n').trim()
  }
  return sections
}

async function main() {
  const db = getDatabase()
  const folders = readdirSync(BRANDS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '_TEMPLATE')
    .map((entry) => entry.name)

  for (const slug of folders) {
    const path = join(BRANDS_DIR, slug, 'brand.md')
    const markdown = readFileSync(path, 'utf-8')
    const titleMatch = markdown.match(/^#\s*Marca:\s*(.+)$/m)
    const name = titleMatch?.[1]?.trim() ?? slug
    const sections = parseSections(markdown)

    await db.sql`
      INSERT INTO brands (name, slug, voice_profile, visual_profile, audience, hashtag_sets)
      VALUES (
        ${name}, ${slug},
        ${JSON.stringify({ raw: sections['Voz'] ?? '' })},
        ${JSON.stringify({ raw: sections['Visual'] ?? '' })},
        ${JSON.stringify({ raw: sections['Público'] ?? '' })},
        ${JSON.stringify({ raw: sections['Hashtags'] ?? '' })}
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        voice_profile = EXCLUDED.voice_profile,
        visual_profile = EXCLUDED.visual_profile,
        audience = EXCLUDED.audience,
        hashtag_sets = EXCLUDED.hashtag_sets
    `
    console.log(`Sincronizado: ${slug} (${name})`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
