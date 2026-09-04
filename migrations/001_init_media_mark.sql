-- =============================================================================
-- Festive Events — mark 001 applied (run AFTER 001_init_media.sql succeeds)
-- File: api/migrations/001_init_media_mark.sql
-- =============================================================================

INSERT INTO schema_migrations (version, name)
VALUES ('001', 'init_media')
ON CONFLICT (version) DO NOTHING;
