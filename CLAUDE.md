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
- Fase 3: ✅ código completo. `schedule-post.ts` (mapea `post.platform` → `brand.postiz_integration_ids`, llama a Postiz `POST {POSTIZ_API_URL}/public/v1/posts`), `postiz-webhook.ts` (recibe published/failed de Postiz), calendario mensual real en `src/pages/Calendar.tsx` (grilla + lista de aprobados para programar). No probado en vivo: requiere el VPS de Postiz (pendiente, ver Fase 0-B).
- Fase 4: ✅ código completo. `sync-metrics.ts` y `analyze-brand.ts` y `weekly-report.ts` son scheduled functions (`export const config: Config = { schedule: '...' }`). `metrics.ts` sirve datos agregados al panel real en `src/pages/Metrics.tsx`. `generate-batch.ts` ahora inyecta `brand_insights` recientes en el prompt (el sistema "aprende"). Nueva columna `brands.metricool_blog_id`.
- Con esto las 4 fases del plan tienen el código completo. Pendiente global: cargar `ANTHROPIC_API_KEY` y `GEMINI_API_KEY` en Netlify (Fases 1-2), levantar Postiz VPS (Fase 3), conectar Metricool + verificar dominio en Resend (Fase 4) — todo del lado de infraestructura/cuentas externas del usuario, no de código.
- **Auditoría 2026-07-22**: se encontraron y corrigieron 9 hallazgos (ver `.claude/errors-learned.md`): autenticación faltante (ahora hay login con contraseña + token firmado, ver abajo), URLs de imagen relativas rotas para Postiz, `max_tokens` insuficiente en `generate-batch.ts`, doble conteo de métricas por falta de dedup de snapshots, estado de copy en el Kanban desincronizado, `regenerate-copy.ts` sin forzar re-aprobación, falta de `try/catch` consistente, matching de Metricool sin usar la red social, y `posts.ts` sin restringir transiciones de estado manuales.

## Autenticación
Contraseña compartida (single-operator, no hay multiusuario en v1): `POST /api/login` con `{ password }` verifica contra `APP_PASSWORD_HASH` (hash bcrypt) y devuelve un token HMAC firmado con `APP_SESSION_SECRET` (7 días de validez). El frontend lo guarda en `sessionStorage` y lo manda como `Authorization: Bearer <token>` en cada request (`src/lib/api.ts`). Todas las functions que exponen datos o gastan API credits llaman `isAuthorized(req)` de `netlify/functions/lib/auth.ts` al inicio. **No** se protegen: `login.ts` (obvio), `images.ts` (debe ser públicamente descargable por el navegador y por Postiz), `postiz-webhook.ts` (usa su propio `POSTIZ_WEBHOOK_SECRET`), `mcp.ts` (usa su propio `MCP_API_TOKEN`, ver abajo), y las scheduled functions `sync-metrics.ts`/`analyze-brand.ts`/`weekly-report.ts` (las invoca el cron de Netlify, no llevan el header de sesión).

## Servidor MCP (`/api/mcp`)
Expone Auto Post como "custom connector" remoto para Claude.ai/Cowork (2026-07-22, a pedido del usuario para poder tomar contenido aprobado y llevarlo a Meta Ads Manager desde una conversación de Cowork usando su conector de Meta Ads). Implementado con `@modelcontextprotocol/sdk` (`McpServer` + `WebStandardStreamableHTTPServerTransport`, modo stateless — cada invocación crea un server fresco, apropiado para Netlify Functions). Auth: header fijo `Authorization: Bearer <MCP_API_TOKEN>` (no pasa por `/api/login`, es una credencial de máquina, no de sesión humana).

Herramientas expuestas:
- `list_brands` — lectura
- `list_posts(brand_id, status?)` — lectura
- `get_post(post_id)` — lectura, incluye `image_urls`
- `update_post_status(post_id, status)` — escritura, restringido a los mismos `PATCHABLE_STATUSES` que `posts.ts` (nunca `scheduled`/`published`/`failed` manualmente — esos los pone el sistema real al publicar vía Postiz)

Para conectarlo: en Claude.ai/Cowork → Settings → Connectors → Add custom connector → URL `https://auto-post-abrinay.netlify.app/api/mcp` → Request headers → `Authorization: Bearer <MCP_API_TOKEN>`. La escritura de campañas en Meta Ads sigue siendo responsabilidad del conector de Meta Ads de Cowork (fuera de Auto Post) y debe quedar en PAUSED/manual, igual que dice el principio de la Fase 3.
