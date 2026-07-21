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
