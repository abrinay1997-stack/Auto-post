-- Se reemplaza Postiz por integración directa con la Graph API de Meta (Instagram/Facebook).
-- postiz_integration_ids queda sin uso (no se borra por si se retoma Postiz más adelante).
ALTER TABLE brands ADD COLUMN meta_page_id text;
ALTER TABLE brands ADD COLUMN meta_ig_user_id text;
ALTER TABLE brands ADD COLUMN meta_page_access_token text;
