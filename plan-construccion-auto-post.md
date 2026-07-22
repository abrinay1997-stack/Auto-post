# Auto Post — Plan de Construcción Detallado

**Sistema de automatización de contenido y campañas para agencia de publicidad, con Claude como motor.**
Versión 1.0 · Julio 2026 · Autor: Abrinay

> **Actualización 2026-07-21:** se descartó Supabase como capa de datos. Se usa **Netlify DB (Postgres, powered by Neon) + Netlify Blobs**, nativo de la plataforma donde ya vive el resto del proyecto: se auto-provisiona en cada deploy, sin cuenta ni OAuth adicional, sin RLS (innecesario porque solo las Netlify Functions tocan la base). El resto de este documento queda actualizado en consecuencia; las menciones a Supabase son historia de la decisión original.

---

## 0. ¿Dónde se construye? Cowork vs. Claude Code

**Respuesta corta: la construcción del código se hace en Claude Code. Cowork es donde OPERAS, no donde CONSTRUYES.**

| | Claude Cowork | Claude Code |
|---|---|---|
| Propósito | Trabajo de conocimiento agéntico (investigar, redactar, operar con conectores MCP) | Programación agéntica: escribe, edita, prueba y hace commits de código real en tu repo |
| Rol en Auto Post | **Operación diaria**: generar contenido con las skills de marca, usar Canva/Metricool/Meta Ads MCP mientras la app no existe (y después, como copiloto) | **Construcción**: crear el repo, las funciones serverless, el dashboard, el esquema de Netlify DB, los tests y los deploys |
| Analogía | Tu asistente de agencia | Tu desarrollador |

**Flujo recomendado:**
1. **Hoy mismo, en Cowork**: crea las skills de identidad de marca por cliente y opera manualmente-asistido (Fase 0-A). Esto factura desde ya.
2. **En paralelo, en Claude Code**: construye Auto Post fase por fase (Fases 0-B a 4). Instálalo con `npm install -g @anthropic-ai/claude-code` (requiere Node.js 18+) o usa la pestaña Code de la app de escritorio. Docs: https://docs.claude.com/en/docs/claude-code/overview
3. **Al final**: Cowork y el dashboard de Auto Post conviven — Cowork para decisiones creativas, Auto Post para el pipeline automatizado.

**Regla práctica**: si la tarea termina en un commit de Git → Claude Code. Si termina en un post, un reporte o una decisión → Cowork.

---

## 1. Problema y Visión

**Problema**: Hoy cada campaña requiere trabajo manual en Meta Ads, Canva/Affinity/Photoshop y CapCut, sin un sistema central que guarde la identidad de cada cliente ni automatice generación, publicación y análisis. Eso limita cuántos clientes puedes atender.

**Visión**: Auto Post es una aplicación web propia (repo privado en GitHub, desplegada en Netlify) donde:
- Cada cliente tiene un **perfil de marca** persistente (voz, colores, público, ofertas, ejemplos).
- Claude genera **copy por lotes** y Gemini/Nano Banana genera **imágenes on-brand**.
- Un **pipeline con aprobación humana** programa y publica vía Postiz (OAuth oficial, sin riesgo de baneo).
- Un **dashboard** muestra todo el proceso: borrador → imagen → aprobación → programado → publicado → métricas.
- Metricool/Graph API alimentan el **análisis de posts virales y métricas** que retroalimenta la generación.

## 2. Objetivos y No-Objetivos

**Objetivos (v1):**
1. Reducir el tiempo de producción de un lote semanal de contenido por cliente de horas a <30 minutos de revisión.
2. Soportar 5 clientes activos con identidad de marca aislada.
3. Cero credenciales en el código: todo en variables de entorno de Netlify y OAuth.
4. Ningún post sale sin aprobación humana (human-in-the-loop obligatorio en v1).

**No-Objetivos (v1):**
- No editar video automáticamente (CapCut sigue manual; v2+ con ElevenLabs para voces).
- No gestionar presupuesto de Meta Ads automáticamente (solo lectura/insights; escritura de campañas queda en PAUSED y manual).
- No app móvil; solo web responsive.
- No multiusuario/equipos; un solo operador (tú).
- No reemplazar Affinity/Photoshop para piezas premium; Auto Post cubre el volumen, no el arte fino.

## 3. Arquitectura General

```
┌──────────────────────────── AUTO POST ────────────────────────────┐
│                                                                    │
│  FRONTEND (Netlify)                BACKEND (Netlify Functions)     │
│  ┌──────────────────┐              ┌──────────────────────────┐    │
│  │ Dashboard React  │───llama────▶│ /api/generate  (Claude)   │    │
│  │ - Kanban pipeline│              │ /api/image     (Gemini)   │    │
│  │ - Perfiles marca │              │ /api/schedule  (Postiz)   │    │
│  │ - Calendario     │              │ /api/metrics   (Metricool)│    │
│  │ - Métricas       │              │ /api/analyze   (Claude)   │    │
│  └──────────────────┘              └──────────┬───────────────┘    │
│                                               │                    │
│                          ┌────────────────────┼─────────────┐      │
│                          ▼                    ▼             ▼      │
│              NETLIFY DB + BLOBS         CLAUDE API   GEMINI API   │
│              marcas, posts, cola,       copy/análisis  imágenes   │
│              métricas, activos                                    │
└───────────────────────────────┬───────────────────────────────────┘
                                │ API/OAuth
                 ┌──────────────┼──────────────────┐
                 ▼              ▼                  ▼
          POSTIZ (VPS)    METRICOOL MCP     META ADS MCP
          publica en      métricas, posts   insights de
          IG/FB/TikTok…   virales, horarios campañas
```

**Principios de diseño:**
- **Serverless-first**: Netlify Functions en TypeScript (tu stack Node.js). Sin servidor propio salvo Postiz.
- **Postiz como capa de publicación**: nunca hablas directo con la Graph API para publicar; Postiz maneja OAuth, tokens y límites (100 posts/24h en IG).
- **Claude como orquestador**: cada función que "piensa" (copy, análisis, briefs) llama a Claude API; las skills de marca viven como archivos de contexto versionados en el repo.
- **Human-in-the-loop**: estado `pending_approval` obligatorio antes de `scheduled`.

## 4. Stack Técnico

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend | React + Vite + Tailwind | Rápido, desplegable estático en Netlify |
| Backend | Netlify Functions (TypeScript) | Tu perfil Node.js; credenciales en env vars |
| Base de datos | Netlify DB (Postgres, Neon) + Netlify Blobs | Nativo de Netlify: auto-provisión en el deploy, sin cuenta/OAuth adicional; Blobs para activos generados |
| IA — texto/análisis | Claude API (Sonnet para volumen; Haiku para tareas simples) | Tu motor preferido |
| IA — imágenes | Gemini API (Nano Banana) + Imagen 4 Fast como opción barata | ~$0.02–0.13/imagen |
| Publicación | Postiz self-hosted (Docker en VPS Hetzner ~$4-8/mes u Oracle free tier) | OAuth oficial, API + MCP, 30+ redes |
| Métricas | Metricool MCP (plan gratis para empezar) + Postiz analytics | Posts virales, mejores horarios, competidores |
| Meta Ads | MCP oficial de Meta (si `is_ads_mcp_enabled`) o Pipeboard meta-ads-mcp | Insights y campañas en PAUSED |
| Diseño asistido | Canva MCP (brand kits) | Variantes on-brand desde Cowork |
| Emails | Resend (ya conectado) | Aprobaciones y reportes semanales a clientes |
| CI/CD | GitHub → Netlify auto-deploy | Push a `main` = deploy |

## 5. Modelo de Datos (Netlify DB)

DDL versionado como migración en `netlify/database/migrations/20260721000000_initial_schema/migration.sql`, se aplica sola en cada deploy — no se activa RLS (innecesario: solo las Netlify Functions acceden a la base, nunca el frontend directo).

```sql
-- Clientes/marcas
create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  voice_profile jsonb,        -- tono, vocabulario, emojis, idioma
  visual_profile jsonb,       -- colores hex, fuentes, estilo de imagen
  audience jsonb,             -- público objetivo, dolores, deseos
  hashtag_sets jsonb,         -- grupos de hashtags por tema
  canva_brand_kit_id text,
  postiz_integration_ids jsonb, -- ids de cuentas conectadas en Postiz
  created_at timestamptz default now()
);

-- Posts del pipeline
create table posts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  status text not null default 'draft',
  -- draft | image_pending | pending_approval | approved | scheduled | published | failed | archived
  platform text[],            -- ['instagram','facebook',...]
  copy_text text,
  copy_variants jsonb,        -- variantes A/B generadas
  image_prompt text,
  image_urls text[],          -- Netlify Blobs
  scheduled_at timestamptz,
  postiz_post_id text,
  published_at timestamptz,
  batch_id uuid,              -- agrupa lotes generados juntos
  created_at timestamptz default now()
);

-- Métricas por post
create table post_metrics (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  captured_at timestamptz default now(),
  likes int, comments int, shares int, saves int,
  reach int, impressions int, engagement_rate numeric
);

-- Insights de análisis (posts virales, aprendizajes)
create table brand_insights (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  insight_type text,          -- 'viral_pattern' | 'best_time' | 'top_hashtags' | 'audience_feedback'
  content jsonb,
  source text,                -- 'metricool' | 'graph_api' | 'claude_analysis'
  created_at timestamptz default now()
);

-- Cola de trabajos (generación por lotes)
create table jobs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id),
  job_type text,              -- 'generate_batch' | 'generate_images' | 'sync_metrics' | 'weekly_report'
  status text default 'queued', -- queued | running | done | failed
  payload jsonb, result jsonb,
  created_at timestamptz default now(), finished_at timestamptz
);
```

Todo el acceso a estas tablas ocurre exclusivamente desde Netlify Functions vía `@netlify/database` (`getDatabase()` / `getConnectionString()`); el frontend nunca se conecta directo a la base, por lo que no hace falta RLS ni una key separada para el cliente.

## 6. Estructura del Repositorio

```
auto-post/
├── CLAUDE.md                  # Contexto para Claude Code: arquitectura, convenciones, comandos
├── netlify.toml               # Build + redirects + funciones programadas
├── package.json
├── .env.example               # Nombres de variables SIN valores (el real nunca se commitea)
├── src/                       # Frontend React
│   ├── pages/                 # Dashboard, Brands, Pipeline, Calendar, Metrics
│   └── components/
├── netlify/
│   ├── functions/
│   │   ├── generate-batch.ts      # Claude: genera N posts para una marca
│   │   ├── generate-image.ts      # Gemini/Nano Banana desde image_prompt → Netlify Blobs
│   │   ├── approve-post.ts        # Cambia estado y dispara schedule
│   │   ├── schedule-post.ts       # Llama API de Postiz
│   │   ├── sync-metrics.ts        # Scheduled function (diaria): Metricool/Postiz → post_metrics
│   │   ├── analyze-brand.ts       # Claude: posts virales → brand_insights
│   │   └── weekly-report.ts       # Scheduled (lunes): reporte por Resend
│   └── database/migrations/       # Migraciones SQL de Netlify DB, se aplican solas en cada deploy
├── brands/                    # Identidad de marca versionada (fuente de verdad)
│   ├── _TEMPLATE/brand.md     # Plantilla de skill de marca
│   └── cliente-x/brand.md     # Se sincroniza a Netlify DB con un script
├── scripts/
│   └── sync-brands.ts
└── tests/
```

**El archivo `CLAUDE.md` es clave**: Claude Code lo lee automáticamente al iniciar sesión en el repo. Documenta ahí la arquitectura, el esquema de la DB, los estados del pipeline y las convenciones — así cada sesión de construcción arranca con contexto completo.

## 7. Variables de Entorno (Netlify → Site settings → Environment variables)

```
ANTHROPIC_API_KEY=            # Claude API
GEMINI_API_KEY=               # Imágenes
POSTIZ_API_URL=               # https://postiz.tudominio.com/api
POSTIZ_API_KEY=
METRICOOL_USER_TOKEN=         # si usas su API además del MCP
RESEND_API_KEY=
APP_PASSWORD_HASH=            # protección simple del dashboard en v1
```

Netlify DB y Netlify Blobs se auto-provisionan en el deploy — no requieren variables de entorno manuales (`@netlify/database` resuelve la conexión sola).

**Reglas de seguridad:**
1. Nada de esto entra jamás al repo ni al bundle del frontend.
2. Tokens de Meta viven DENTRO de Postiz/Metricool vía OAuth — Auto Post nunca los toca ni los almacena.
3. Marca las keys sensibles como *secret* en Netlify para que no aparezcan en logs.
4. El dashboard en v1 se protege con contraseña (Netlify Identity, Basic Auth o un login simple contra `APP_PASSWORD_HASH`); no lo dejes público.
5. Postiz en el VPS: expón solo el puerto 443 tras Caddy/Nginx con SSL; base de datos y Redis solo en red interna de Docker (o Cloudflare Tunnel).

## 8. Plan por Fases

### Fase 0-A — Operación inmediata en Cowork (Semana 1, en paralelo a todo)
**Objetivo**: facturar y validar el flujo antes de escribir código.
- [ ] Crear la plantilla de identidad de marca (`brand.md`) — ver §9.
- [ ] Llenarla para tus 2 clientes principales como skills en Cowork.
- [ ] Conectar Metricool MCP (plan gratis) y analizar los últimos 90 días de cada cliente: top 10 posts por engagement, mejores horarios, hashtags ganadores.
- [ ] Generar el primer lote de 10 posts/cliente en Cowork usando la skill + Canva MCP, publicando manualmente.
- **Criterio de éxito**: un lote semanal completo generado en <1 hora con calidad aprobable.

### Fase 0-B — Fundación técnica (Semana 1–2, en Claude Code)
- [x] Crear repo privado `auto-post` en GitHub; inicializar Vite+React+TS+Tailwind y `netlify/functions`.
- [x] Escribir `CLAUDE.md` con la arquitectura de este documento.
- [x] Migración inicial de Netlify DB escrita (esquema de §5, sin RLS) — se aplica sola en el primer deploy.
- [x] Conectar repo a Netlify (auto-post-abrinay.netlify.app, deploy continuo confirmado); pendiente cargar `ANTHROPIC_API_KEY` para probar `/api/health` en vivo.
- [ ] Levantar Postiz en el VPS (Docker Compose), conectar por OAuth las cuentas IG/FB de UN cliente piloto, verificar publicación de prueba desde su API. (Se deja para cuando haya cliente piloto listo.)
- **Entregable**: URL de Netlify viva ✅ + Postiz publicando un post de prueba vía API (pendiente).

### Fase 1 — Identidad de marca en la app (Semana 2–3)
- [x] CRUD de marcas en el dashboard: `netlify/functions/brands.ts` (GET/POST/PUT) + página `src/pages/Brands.tsx` (crear/listar; edición de voice/visual/audience pendiente de pulir).
- [x] Script `sync-brands.ts`: `brands/*/brand.md` ⇄ Netlify DB.
- [x] Función `generate-batch.ts` v1: recibe `brand_id` + brief → Claude devuelve N posts (copy + `image_prompt` + plataformas + hashtags) en JSON → inserta en `posts` con estado `draft`. (Código listo, pendiente probar en vivo con `ANTHROPIC_API_KEY`.)
- **Criterio de aceptación**: dado un brief de 3 líneas, se generan 10 borradores coherentes con la voz de la marca en <2 min. (Pendiente de validar en vivo.)

### Fase 2 — Generación multimedia por lotes (Semana 3–4)
- [x] `generate-image.ts`: toma `image_prompt` + `visual_profile` (colores, estilo) → Gemini (`gemini-2.5-flash-image`) → guarda en Netlify Blobs (`images.ts` la sirve) → estado `pending_approval`. (Pendiente probar en vivo con `GEMINI_API_KEY`.)
- [x] Vista Kanban del pipeline (`src/pages/Pipeline.tsx`) con preview de imagen + copy editable inline, columnas Borrador/Pendiente/Aprobado/Descartado.
- [x] Botones Aprobar / Regenerar copy (`regenerate-copy.ts`) / Regenerar imagen / Descartar.
- [ ] Generación de variantes A/B de copy por post — el campo `copy_variants` ya se genera y guarda, falta UI para elegir entre variantes (se deja para un pase de pulido).
- **Criterio**: lote completo (copy+imagen) de 10 posts listo para revisión en <10 min de cómputo. (Pendiente de validar en vivo con las API keys.)

### Fase 3 — Programación y publicación (Semana 5–6)
- [ ] `approve-post.ts` + `schedule-post.ts`: al aprobar, se envía a Postiz con fecha/hora (sugerida por los mejores horarios de `brand_insights`).
- [ ] Vista calendario mensual por marca.
- [ ] Webhook/polling de Postiz → actualizar a `published` con `published_at`.
- [ ] Manejo de errores y reintentos; respetar límite IG (100 posts/24h — irrelevante a tu volumen, pero valida).
- **Criterio**: post aprobado en dashboard aparece publicado en IG del cliente piloto sin tocar nada más.

### Fase 4 — Métricas y análisis viral (Semana 7–8)
- [ ] `sync-metrics.ts` (scheduled diaria): Metricool/Postiz → `post_metrics`.
- [ ] `analyze-brand.ts` (semanal): Claude analiza top posts, comentarios y patrones → escribe `brand_insights` → esos insights se inyectan en el prompt de `generate-batch` (el sistema aprende).
- [ ] `weekly-report.ts`: reporte HTML por cliente vía Resend cada lunes.
- [ ] Panel de métricas en dashboard (engagement por post, evolución, mejores horarios).
- **Criterio**: el prompt de generación de la semana N+1 cita automáticamente qué funcionó en la semana N.

### Fase 5 — v2 (backlog, no ahora)
Meta Ads escritura asistida (campañas en PAUSED desde insights), ElevenLabs para voz de videos, portal de aprobación para clientes, multi-operador, Reels automatizados.

## 9. Plantilla de Identidad de Marca (`brands/cliente/brand.md`)

```markdown
# Marca: {Nombre}
## Voz
- Tono: (ej. cercano, profesional, juvenil panameño)
- Vocabulario propio / palabras prohibidas:
- Uso de emojis: | Idioma(s): es / es+en
- 3 ejemplos de posts REALES que representan la voz perfecta:
## Visual
- Colores (hex): | Fuentes: | Estilo de imagen: (ej. fotografía cálida, flat, 3D)
- Estilo de prompt base para Nano Banana:
## Público
- Quién es, dolores, deseos, objeciones:
## Oferta
- Productos/servicios, promos vigentes, CTA preferidos:
## Hashtags
- Set principal / sets por tema:
## Aprendizajes (lo llena analyze-brand)
- Qué formatos/temas/horarios funcionan:
```

Este mismo archivo sirve como **skill en Cowork** (Fase 0-A) y como **contexto en Netlify DB** para las functions — una sola fuente de verdad.

## 10. Costos Estimados Mensuales (5 clientes)

| Concepto | Costo |
|---|---|
| Claude API (Sonnet, ~200 lotes+análisis) | $20–60 |
| Imágenes (~400–600/mes) | $10–40 |
| VPS Postiz (Hetzner) | $4–8 (o $0 en Oracle free tier) |
| Netlify | $0 (free tier alcanza en v1) |
| Netlify DB + Blobs | Incluido en el plan de Netlify (free tier al inicio) |
| Metricool | $0 (free) → $18–45 al escalar |
| Dominio | ~$1/mes (ya tienes GoDaddy) |
| **Total** | **~$35–180/mes** |

## 11. Riesgos y Mitigaciones

| Riesgo | Mitigación |
|---|---|
| Cambios en límites de Meta API | Postiz absorbe la integración; mantenerlo actualizado |
| Rechazo de calidad por clientes | Human-in-the-loop obligatorio + skill de marca con ejemplos reales |
| Sobre-ingeniería antes de facturar | Fase 0-A opera en Cowork desde el día 1 |
| Fuga de credenciales | §7 completo; OAuth siempre; nada en el repo |
| Postiz caído (VPS) | Backups semanales del volumen Docker; los posts quedan en Netlify DB y se re-programan |
| Costos de imagen se disparan | Imagen 4 Fast (~$0.02) para volumen; Nano Banana solo para piezas clave |

## 12. Primeros Prompts para Claude Code (copiar/pegar)

**Sesión 1 (Fase 0-B):** ✅ hecho — scaffold Vite+React+TS+Tailwind, `netlify/functions/health.ts`, `netlify.toml`, `CLAUDE.md`, `.env.example`/`.gitignore`.

**Sesión 2:** ✅ hecho — migración inicial de Netlify DB (`netlify/database/migrations/20260721000000_initial_schema/migration.sql`) con las tablas brands, posts, post_metrics, brand_insights y jobs según la sección 5 del plan (sin RLS: solo las Functions acceden a la base).

**Sesión 3:**
> Implementa netlify/functions/generate-batch.ts: recibe brand_id y brief, carga el perfil de la marca desde Netlify DB (vía `@netlify/database`), construye el prompt para Claude pidiendo respuesta SOLO en JSON con un array de posts (copy, copy_variants, image_prompt, platform, hashtags), valida el JSON e inserta en la tabla posts con status draft y un batch_id común.

…y así sucesivamente, una función por sesión, siguiendo las fases.

---

**Siguiente paso inmediato**: llena la plantilla de §9 para tu primer cliente y créala como skill en Cowork (Fase 0-A), y en Claude Code ejecuta el prompt de la Sesión 1.
