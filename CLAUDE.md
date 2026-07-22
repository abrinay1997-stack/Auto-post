# Auto Post — CLAUDE.md

Sistema de automatización de contenido y campañas para agencia de publicidad. Ver `plan-construccion-auto-post.md` en la raíz para el plan completo (fases, costos, riesgos).

## Alcance
Este repo es exclusivamente la carpeta `AUTO POST`. No tiene relación con ningún otro proyecto en `DESARROLLOS/`.

## Arquitectura
```
Frontend (Netlify, React+Vite+Tailwind)
  → Netlify Functions (netlify/functions/*.ts)
    → Netlify DB (Postgres, vía @netlify/database): brands, posts, post_metrics, brand_insights, jobs
    → Netlify Blobs: imágenes generadas
    → Claude API (copy, análisis)
    → Gemini API (imágenes)
    → Postiz (VPS, self-hosted): publicación OAuth en redes
    → Metricool MCP: métricas y posts virales
```

**Principios:**
- Serverless-first: toda lógica de servidor vive en `netlify/functions/`.
- Postiz es la única capa de publicación — nunca se llama directo a la Graph API de Meta para publicar.
- Human-in-the-loop obligatorio: ningún post pasa a `scheduled` sin estado `pending_approval` → `approved` explícito.
- Identidad de marca en `brands/<cliente>/brand.md` es la fuente de verdad; se sincroniza a Netlify DB con `scripts/sync-brands.ts` (pendiente).
- Se descartó Supabase (2026-07-21): Netlify DB (Neon Postgres) + Netlify Blobs se auto-provisionan en el mismo deploy, sin cuenta ni OAuth adicional. Como solo las Functions tocan la base (nunca el frontend directo), no hace falta RLS.

## Estados del pipeline (`posts.status`)
`draft` → `image_pending` → `pending_approval` → `approved` → `scheduled` → `published` | `failed` | `archived`

## Esquema de base de datos (Netlify DB)
Migraciones en `netlify/database/migrations/`, se aplican solas en cada deploy. Tablas: `brands`, `posts`, `post_metrics`, `brand_insights`, `jobs` (DDL en `netlify/database/migrations/20260721000000_initial_schema/migration.sql`). Acceso solo desde Netlify Functions vía `@netlify/database` (`getDatabase()` / `getConnectionString()`); el frontend nunca habla directo con la base.

**Convención obligatoria**: toda function que use `@netlify/database` debe escribirse en formato v2 (`export default async (req: Request) => new Response(...)`), NUNCA en formato clásico `export const handler: Handler = async (event) => {...}` — el formato clásico corre en modo compatibilidad Lambda y Netlify no le inyecta la connection string (ver `.claude/errors-learned.md`, entrada 2026-07-21).

## Variables de entorno
Ver `.env.example`. Nunca se commitean valores reales. Solo las prefijadas `VITE_` son públicas (van al bundle del frontend).

## Comandos
- `npm run dev` — servidor de desarrollo Vite
- `npm run build` — type-check (`tsc -b`) + build de producción
- `npm run preview` — sirve el build de producción localmente

## Estado actual
- Fase 0-B: ✅ completa. Sitio live en Netlify (auto-post-abrinay.netlify.app), repo conectado con deploy continuo, `/api/health` responde (pendiente solo cargar `ANTHROPIC_API_KEY`). Pendiente: Postiz en VPS (se deja para cuando haya cliente piloto listo).
- Fase 1: ✅ completa. `netlify/functions/brands.ts` (CRUD), `netlify/functions/generate-batch.ts`, `scripts/sync-brands.ts`, routing del dashboard (`react-router-dom`). CRUD de marcas probado en vivo end-to-end.
- Fase 2: ✅ código completo. `generate-image.ts` (Gemini `gemini-2.5-flash-image` → Netlify Blobs), `images.ts` (sirve las imágenes por key), `posts.ts` (list + update status), `regenerate-copy.ts`, Kanban real en `src/pages/Pipeline.tsx` (generar lote, ver imagen, editar copy inline, aprobar/descartar/regenerar). Pendiente: probar generate-batch/generate-image en vivo (requieren `ANTHROPIC_API_KEY` y `GEMINI_API_KEY`), UI para elegir entre `copy_variants`.
- Pendiente global: cargar `ANTHROPIC_API_KEY` y `GEMINI_API_KEY` en Netlify para validar el flujo completo en producción.
