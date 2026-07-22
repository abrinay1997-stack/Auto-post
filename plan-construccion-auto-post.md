# Auto Post — Plan de Construcción Detallado

**Sistema de automatización de contenido y campañas para agencia de publicidad, con Claude como motor.**
Versión 1.0 · Julio 2026 · Autor: Abrinay

> **Actualización 2026-07-21:** se descartó Supabase como capa de datos. Se usa **Netlify DB (Postgres, powered by Neon) + Netlify Blobs**, nativo de la plataforma donde ya vive el resto del proyecto: se auto-provisiona en cada deploy, sin cuenta ni OAuth adicional, sin RLS (innecesario porque solo las Netlify Functions tocan la base). El resto de este documento queda actualizado en consecuencia; las menciones a Supabase son historia de la decisión original.
>
> **Actualización 2026-07-22:** se descartó Postiz/VPS como capa de publicación. La capacidad Always Free de Oracle resultó agotada en la región disponible (y la cuenta quedó limitada a 1 sola región), y el usuario decidió no pagar un VPS. Se reemplazó por **integración directa con la Graph API de Meta** desde las propias Netlify Functions — cero servidor adicional. Limitación aceptada: Instagram no soporta programación nativa vía API, así que una scheduled function propia (`publish-due-posts.ts`) publica en el momento programado para ambas plataformas. El usuario debe renovar el Page Access Token de Meta manualmente cada ~60 días. Las menciones a Postiz que quedan abajo son historia de la decisión original.

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
- Un **pipeline con aprobación humana** programa y publica directo vía la Graph API de Meta (Instagram/Facebook).
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
│  │ - Perfiles marca │              │ /api/schedule  (Meta)     │    │
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
       GRAPH API DE META  METRICOOL MCP     META ADS MCP
       publica en         métricas, posts   insights de
       Instagram/Facebook virales, horarios campañas
```

**Principios de diseño:**
- **Serverless-first**: Netlify Functions en TypeScript (tu stack Node.js). Cero servidor propio — ni siquiera para publicar (ver actualización 2026-07-22).
- **Meta directo como capa de publicación**: `netlify/functions/lib/meta.ts` llama la Graph API de Meta para Instagram/Facebook; tú generas y renuevas el Page Access Token manualmente cada ~60 días desde Meta for Developers.
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
| Publicación | Graph API de Meta directo (Instagram/Facebook), sin servidor propio | Cero VPS; solo Instagram/Facebook importan en la práctica. Limitación: Instagram no soporta programación nativa vía API, la maneja `publish-due-posts.ts` |
| Métricas | Metricool (requiere plan Advanced/Custom para acceso a API — bloqueado en free tier, ver §11) | Posts virales, mejores horarios, competidores |
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

Este es el esquema inicial (migración `20260721000000_initial_schema`). Migraciones posteriores agregaron: `brands.metricool_blog_id` (Fase 4) y `brands.meta_page_id` / `meta_ig_user_id` / `meta_page_access_token` (Fase 3, reemplazo de Postiz — `postiz_integration_ids` y `posts.postiz_post_id` quedaron sin uso, no se borraron).

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
│   │   ├── posts.ts               # Cambia estado (aprobar/descartar) — reemplaza approve-post.ts
│   │   ├── schedule-post.ts       # Valida y marca 'scheduled', sin llamar nada externo
│   │   ├── publish-due-posts.ts   # Scheduled (cada 10 min): publica vía lib/meta.ts cuando llega scheduled_at
│   │   ├── lib/meta.ts            # Llamadas directas a la Graph API de Meta (Instagram/Facebook)
│   │   ├── sync-metrics.ts        # Scheduled function (diaria): Metricool → post_metrics
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
METRICOOL_USER_TOKEN=         # requiere plan Advanced/Custom de Metricool, ver §11
METRICOOL_USER_ID=
RESEND_API_KEY=
APP_PASSWORD_HASH=            # protección simple del dashboard en v1
APP_SESSION_SECRET=           # firma los tokens de sesión de /api/login
MCP_API_TOKEN=                # credencial fija del servidor MCP (/api/mcp) para Cowork
```

Netlify DB y Netlify Blobs se auto-provisionan en el deploy — no requieren variables de entorno manuales (`@netlify/database` resuelve la conexión sola). Las credenciales de Meta (`meta_page_id`, `meta_ig_user_id`, `meta_page_access_token`) NO son variables de entorno — viven por marca en la tabla `brands`, porque cada cliente tiene su propia página/cuenta de Meta.

**Reglas de seguridad:**
1. Nada de esto entra jamás al repo ni al bundle del frontend.
2. El Page Access Token de Meta se genera manualmente en Meta for Developers y se guarda en la fila de la marca en `brands` — Auto Post nunca hace el flujo OAuth completo en v1, tú lo renuevas a mano cada ~60 días.
3. Marca las keys sensibles como *secret* en Netlify para que no aparezcan en logs.
4. El dashboard se protege con contraseña + token firmado (`APP_PASSWORD_HASH` + `APP_SESSION_SECRET`, ver `CLAUDE.md` → Autenticación); no lo dejes público.

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
- [x] Conectar repo a Netlify (auto-post-abrinay.netlify.app, deploy continuo confirmado); `ANTHROPIC_API_KEY` cargada y `/api/health` probado en vivo con éxito.
- [x] ~~Levantar Postiz en el VPS~~ — descartado 2026-07-22 (capacidad Always Free agotada + usuario no quiso pagar VPS). Reemplazado por Graph API de Meta directo, ver Fase 3.
- **Entregable**: URL de Netlify viva ✅ + generación de contenido probada en vivo con Claude real ✅.

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

### Fase 3 — Programación y publicación (Semana 5–6) — rediseñada 2026-07-22, sin Postiz/VPS
- [x] "Aprobar" ya lo cubre `posts.ts` PATCH (Fase 2); `schedule-post.ts` valida que el post esté `approved` y que la marca tenga `meta_page_id`/`meta_ig_user_id`/`meta_page_access_token` configurados, y marca `scheduled` — sin llamar nada externo todavía.
- [x] `publish-due-posts.ts` (scheduled cada 10 min): busca posts `scheduled` con `scheduled_at` ya cumplido y los publica de verdad vía `lib/meta.ts` (Graph API de Meta), actualizando a `published`/`failed`. Necesario porque Instagram no soporta programación nativa vía API.
- [x] Vista calendario mensual por marca (`src/pages/Calendar.tsx`): grilla del mes con posts programados/publicados, lista de aprobados pendientes de programar con selector de fecha/hora.
- [x] Manejo de errores básico: si Meta responde error, el post pasa a `failed` y el detalle queda en los logs de la function (no se pierde el post).
- **Criterio**: post aprobado en dashboard aparece publicado en IG del cliente piloto sin tocar nada más. (No probado en vivo — falta que el usuario cree una Meta App y genere el Page Access Token de un cliente piloto.)

### Fase 4 — Métricas y análisis viral (Semana 7–8)
- [x] `sync-metrics.ts` (scheduled diaria, `0 6 * * *`): Metricool (`/explore/posts/{blogId}`, auth `X-Mc-Auth`) → `post_metrics`, matching por fecha de publicación. Requiere columna nueva `brands.metricool_blog_id` (migración `20260722000000_add_metricool_blog_id`). Endpoint/campos de Metricool no verificados en vivo — ajustar si la respuesta real difiere de lo documentado en su Swagger.
- [x] `analyze-brand.ts` (scheduled semanal, lunes `0 8 * * 1`): Claude analiza top posts de los últimos 7 días por `engagement_rate` → escribe `brand_insights`. `generate-batch.ts` ahora inyecta los últimos 3 insights de la marca en el prompt.
- [x] `weekly-report.ts` (scheduled lunes `0 9 * * 1`): reporte HTML por marca vía Resend (`WEEKLY_REPORT_TO`/`WEEKLY_REPORT_FROM` — el remitente debe ser un dominio verificado en Resend).
- [x] Panel de métricas real en `src/pages/Metrics.tsx`: engagement por post, mejores horarios, aprendizajes recientes.
- **Criterio**: el prompt de generación de la semana N+1 cita automáticamente qué funcionó en la semana N. ✅ implementado (pendiente validar en vivo con datos reales de Metricool).

### Fase 5 — v2 (backlog, no ahora)
Meta Ads escritura asistida (campañas en PAUSED desde insights), ElevenLabs para voz de videos, portal de aprobación para clientes, multi-operador, Reels automatizados.

### Fase 4.5 — Servidor MCP para Cowork (2026-07-22) ✅
Adelantada del backlog a pedido del usuario: Auto Post expone `/api/mcp` como custom connector remoto (`list_brands`, `list_posts`, `get_post`, `update_post_status`), para que desde una conversación de Cowork se pueda traer contenido aprobado y pasarlo al conector de Meta Ads (que vive en Cowork, no en Auto Post) para armar campañas — siempre en PAUSED/manual, sin que Auto Post publique anuncios por su cuenta. Ver detalle en `CLAUDE.md` → "Servidor MCP".

### Pendiente — Pulido UX/UI (2026-07-22, feedback del usuario, deliberadamente pospuesto)
El usuario probó el dashboard y encontró varios puntos de fricción reales. Se deja anotado para un pase dedicado DESPUÉS de terminar la integración con Meta y decidir el tema de Metricool (decisión explícita del usuario: primero cerrar la construcción, después pulir UX/UI):
- **Marcas**: no hay forma de editar ni borrar una marca desde el dashboard (solo crear). El campo "slug" no tiene explicación visible para alguien que no conoce el término.
- **Pipeline**: las acciones sobre un post (editar, descartar, descargar la imagen, editar el post completo) no son claras/discoverable — falta affordance visual.
- **Calendario**: no es evidente cómo o cuándo un post queda "adjunto" a una fecha en la grilla, ni si la vista está bien pensada para el flujo real de trabajo.
- **Métricas**: la utilidad y lectura del panel no es evidente todavía (posiblemente porque no hay datos reales aún, pero revisar de todas formas).

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
| Publicación (Graph API de Meta directo) | $0 — sin VPS, sin servicio de terceros |
| Netlify | $0 (free tier alcanza en v1) |
| Netlify DB + Blobs | Incluido en el plan de Netlify (free tier al inicio) |
| Metricool | $0 (free, sin API) → **plan Advanced/Custom obligatorio para tener acceso a API** (precio a confirmar) — bloqueante real de la Fase 4, ver Riesgos |
| Dominio | ~$1/mes (ya tienes GoDaddy) |
| **Total** | **~$30–100/mes + lo que cueste Metricool Advanced si se decide pagarlo** |

## 11. Riesgos y Mitigaciones

| Riesgo | Mitigación |
|---|---|
| Cambios en límites/permisos de la Graph API de Meta | Al ser integración directa (no Postiz), cualquier cambio de Meta nos afecta a nosotros directo — revisar Meta for Developers changelog periódicamente |
| Rechazo de calidad por clientes | Human-in-the-loop obligatorio + skill de marca con ejemplos reales |
| Sobre-ingeniería antes de facturar | Fase 0-A opera en Cowork desde el día 1 |
| Fuga de credenciales | §7 completo; nada en el repo; Page Access Token de Meta vive en la DB, no en el frontend |
| Page Access Token de Meta expira (~60 días) | Renovación manual por el usuario vía Meta for Developers; sin esto, `publish-due-posts.ts` empieza a fallar silenciosamente — falta alerta automática (backlog) |
| Costos de imagen se disparan | Imagen 4 Fast (~$0.02) para volumen; Nano Banana solo para piezas clave |
| **Metricool API bloqueada en free tier** (descubierto 2026-07-22) | Fase 4 queda con código listo pero inactivo hasta decidir pagar el plan Advanced/Custom, o buscar otra fuente de métricas |
| **Oracle Always Free sin capacidad / cuenta limitada a 1 región** (descubierto 2026-07-22) | Causa por la que se abandonó Postiz/VPS; no reintentar esa vía salvo que cambien las circunstancias |

## 12. Primeros Prompts para Claude Code (copiar/pegar)

**Sesión 1 (Fase 0-B):** ✅ hecho — scaffold Vite+React+TS+Tailwind, `netlify/functions/health.ts`, `netlify.toml`, `CLAUDE.md`, `.env.example`/`.gitignore`.

**Sesión 2:** ✅ hecho — migración inicial de Netlify DB (`netlify/database/migrations/20260721000000_initial_schema/migration.sql`) con las tablas brands, posts, post_metrics, brand_insights y jobs según la sección 5 del plan (sin RLS: solo las Functions acceden a la base).

**Sesión 3:**
> Implementa netlify/functions/generate-batch.ts: recibe brand_id y brief, carga el perfil de la marca desde Netlify DB (vía `@netlify/database`), construye el prompt para Claude pidiendo respuesta SOLO en JSON con un array de posts (copy, copy_variants, image_prompt, platform, hashtags), valida el JSON e inserta en la tabla posts con status draft y un batch_id común.

…y así sucesivamente, una función por sesión, siguiendo las fases.

---

**Siguiente paso inmediato**: llena la plantilla de §9 para tu primer cliente y créala como skill en Cowork (Fase 0-A), y en Claude Code ejecuta el prompt de la Sesión 1.
