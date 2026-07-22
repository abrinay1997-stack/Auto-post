-- Guarda el resultado de publicación por plataforma (éxito/error/postId) para poder diagnosticar
-- fallos parciales (ej. Facebook publica bien pero Instagram falla) sin depender solo de logs.
alter table posts add column platform_results jsonb;
