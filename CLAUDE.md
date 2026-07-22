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
    → Graph API de Meta directo (Instagram/Facebook): publicación
    → Metricool: métricas y posts virales (requiere plan Advanced/Custom para API, ver Estado actual)
```

**Principios:**
- Serverless-first: toda lógica de servidor vive en `netlify/functions/`.
- Human-in-the-loop obligatorio: ningún post pasa a `scheduled` sin estado `pending_approval` → `approved` explícito.
- Identidad de marca en `brands/<cliente>/brand.md` es la fuente de verdad; se sincroniza a Netlify DB con `scripts/sync-brands.ts` (pendiente).
- Se descartó Supabase (2026-07-21): Netlify DB (Neon Postgres) + Netlify Blobs se auto-provisionan en el mismo deploy, sin cuenta ni OAuth adicional. Como solo las Functions tocan la base (nunca el frontend directo), no hace falta RLS.
- Se descartó Postiz/VPS (2026-07-22): la capacidad Always Free de Oracle Cloud resultó inviable (agotada en la región del usuario, cuenta limitada a 1 región) y el usuario prefirió no pagar VPS. Se reemplazó por integración directa con la Graph API de Meta desde las propias Netlify Functions (ver `netlify/functions/lib/meta.ts`) — cero servidor adicional, todo vive en Netlify. Limitación conocida: Instagram no soporta programación nativa vía API (siempre publica de inmediato al llamar `media_publish`), así que la "programación" para ambas plataformas la maneja `publish-due-posts.ts`, una scheduled function propia que publica cuando llega `scheduled_at`. El usuario debe renovar manualmente el Page Access Token de Meta cada ~60 días desde Meta for Developers (no hay refresh automático en v1).

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
- Fase 0-B: ✅ completa. Sitio live en Netlify (auto-post-abrinay.netlify.app), repo conectado con deploy continuo, `/api/health` respondiendo con `ANTHROPIC_API_KEY` real (probado en vivo).
- Fase 1: ✅ completa. `netlify/functions/brands.ts` (CRUD), `netlify/functions/generate-batch.ts`, `scripts/sync-brands.ts`, routing del dashboard (`react-router-dom`). CRUD de marcas y generate-batch probados en vivo end-to-end con Claude real.
- Fase 2: ✅ código completo. `generate-image.ts` (Gemini `gemini-2.5-flash-image` → Netlify Blobs), `images.ts` (sirve las imágenes por key), `posts.ts` (list + update status), `regenerate-copy.ts`, Kanban real en `src/pages/Pipeline.tsx`. Pendiente: probar generate-image en vivo (requiere `GEMINI_API_KEY`), UI para elegir entre `copy_variants`.
- Fase 3: ✅ código completo, **rediseñada 2026-07-22** — se abandonó Postiz/VPS por integración directa con Meta (ver Arquitectura). `schedule-post.ts` valida y marca `scheduled` sin llamar nada externo; `publish-due-posts.ts` (scheduled, cada 10 min) publica de verdad vía `lib/meta.ts` cuando llega la hora. Nuevas columnas `brands.meta_page_id` / `meta_ig_user_id` / `meta_page_access_token`. No probado en vivo: falta que el usuario cree una Meta App y genere el Page Access Token de un cliente piloto.
- Fase 4: código completo pero **bloqueado**: la API de Metricool requiere plan Advanced/Custom (de pago), no incluida en el free tier que se pensaba usar. `sync-metrics.ts`/`analyze-brand.ts`/`weekly-report.ts` existen pero `sync-metrics.ts` no podrá traer datos reales hasta que se decida pagar ese plan o buscar otra fuente de métricas. `metrics.ts` y el panel en `src/pages/Metrics.tsx` funcionan (mostrarán vacío sin datos).
- Auditoría 2026-07-22 (código): se encontraron y corrigieron 9 hallazgos (ver `.claude/errors-learned.md`): autenticación faltante (login con contraseña + token firmado), URLs de imagen relativas, `max_tokens` insuficiente en `generate-batch.ts`, doble conteo de métricas por falta de dedup de snapshots, estado de copy en el Kanban desincronizado, `regenerate-copy.ts` sin forzar re-aprobación, falta de `try/catch` consistente, matching de Metricool sin usar la red social, y `posts.ts` sin restringir transiciones de estado manuales.
- Feedback de UX/UI pendiente (2026-07-22): editar/borrar marca, claridad del campo "slug", affordance de acciones en el Kanban, claridad del calendario y de las métricas — pospuesto a propósito para un pase dedicado al final (ver plan §"Pendiente — Pulido UX/UI").
- Pendiente global de infraestructura (todo del lado del usuario, no de código): `GEMINI_API_KEY`; crear una Meta App + Page Access Token por marca para Fase 3; decidir si se paga Metricool Advanced o se busca otra fuente de métricas para Fase 4; verificar dominio en Resend para el reporte semanal.

## Autenticación
Contraseña compartida (single-operator, no hay multiusuario en v1): `POST /api/login` con `{ password }` verifica contra `APP_PASSWORD_HASH` (hash bcrypt) y devuelve un token HMAC firmado con `APP_SESSION_SECRET` (7 días de validez). El frontend lo guarda en `sessionStorage` y lo manda como `Authorization: Bearer <token>` en cada request (`src/lib/api.ts`). Todas las functions que exponen datos o gastan API credits llaman `isAuthorized(req)` de `netlify/functions/lib/auth.ts` al inicio. **No** se protegen: `login.ts` (obvio), `images.ts` (debe ser públicamente descargable por el navegador y por la Graph API de Meta), `mcp.ts` (usa su propio `MCP_API_TOKEN`, ver abajo), y las scheduled functions `sync-metrics.ts`/`analyze-brand.ts`/`weekly-report.ts`/`publish-due-posts.ts` (las invoca el cron de Netlify, no llevan el header de sesión).

## Servidor MCP (`/api/mcp`)
Expone Auto Post como "custom connector" remoto para Claude.ai/Cowork (2026-07-22, a pedido del usuario para poder tomar contenido aprobado y llevarlo a Meta Ads Manager desde una conversación de Cowork usando su conector de Meta Ads). Implementado con `@modelcontextprotocol/sdk` (`McpServer` + `WebStandardStreamableHTTPServerTransport`, modo stateless — cada invocación crea un server fresco, apropiado para Netlify Functions). Auth: header fijo `Authorization: Bearer <MCP_API_TOKEN>` (no pasa por `/api/login`, es una credencial de máquina, no de sesión humana).

Herramientas expuestas:
- `list_brands` — lectura
- `list_posts(brand_id, status?)` — lectura
- `get_post(post_id)` — lectura, incluye `image_urls`
- `update_post_status(post_id, status)` — escritura, restringido a los mismos `PATCHABLE_STATUSES` que `posts.ts` (nunca `scheduled`/`published`/`failed` manualmente — esos los pone el sistema real al programar/publicar vía Meta)

Para conectarlo: en Claude.ai/Cowork → Settings → Connectors → Add custom connector → URL `https://auto-post-abrinay.netlify.app/api/mcp` → Request headers → `Authorization: Bearer <MCP_API_TOKEN>`. La escritura de campañas en Meta Ads sigue siendo responsabilidad del conector de Meta Ads de Cowork (fuera de Auto Post) y debe quedar en PAUSED/manual, igual que dice el principio de la Fase 3.
