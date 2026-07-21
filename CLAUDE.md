# Auto Post — CLAUDE.md

Sistema de automatización de contenido y campañas para agencia de publicidad. Ver `plan-construccion-auto-post.md` en la raíz para el plan completo (fases, costos, riesgos).

## Alcance
Este repo es exclusivamente la carpeta `AUTO POST`. No tiene relación con ningún otro proyecto en `DESARROLLOS/`.

## Arquitectura
```
Frontend (Netlify, React+Vite+Tailwind)
  → Netlify Functions (netlify/functions/*.ts)
    → Supabase (Postgres+Storage+RLS): brands, posts, post_metrics, brand_insights, jobs
    → Claude API (copy, análisis)
    → Gemini API (imágenes)
    → Postiz (VPS, self-hosted): publicación OAuth en redes
    → Metricool MCP: métricas y posts virales
```

**Principios:**
- Serverless-first: toda lógica de servidor vive en `netlify/functions/`.
- Postiz es la única capa de publicación — nunca se llama directo a la Graph API de Meta para publicar.
- Human-in-the-loop obligatorio: ningún post pasa a `scheduled` sin estado `pending_approval` → `approved` explícito.
- Identidad de marca en `brands/<cliente>/brand.md` es la fuente de verdad; se sincroniza a Supabase con `scripts/sync-brands.ts` (pendiente).

## Estados del pipeline (`posts.status`)
`draft` → `image_pending` → `pending_approval` → `approved` → `scheduled` → `published` | `failed` | `archived`

## Esquema de base de datos (Supabase)
Ver sección 5 de `plan-construccion-auto-post.md` para el DDL completo: `brands`, `posts`, `post_metrics`, `brand_insights`, `jobs`. RLS activo en todas las tablas; `service_role` key solo se usa desde Netlify Functions, nunca en el frontend.

## Variables de entorno
Ver `.env.example`. Nunca se commitean valores reales. Solo las prefijadas `VITE_` son públicas (van al bundle del frontend).

## Comandos
- `npm run dev` — servidor de desarrollo Vite
- `npm run build` — type-check (`tsc -b`) + build de producción
- `npm run preview` — sirve el build de producción localmente

## Estado actual
Fase 0-B en progreso: scaffold inicial (Vite+React+TS+Tailwind v4, `netlify/functions/health.ts` de prueba, `netlify.toml`). Pendiente: proyecto Supabase, deploy en Netlify, Postiz en VPS.
