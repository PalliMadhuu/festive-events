-- =============================================================================
-- REVERT / DROP everything created by the earlier schema.sql
-- Run this ONCE in pgAdmin (Query Tool) to undo the previous bootstrap.
-- WARNING: deletes media + albums data permanently.
-- =============================================================================

DROP TABLE IF EXISTS media CASCADE;
DROP TABLE IF EXISTS albums CASCADE;
DROP TABLE IF EXISTS schema_migrations CASCADE;

DROP TYPE IF EXISTS media_purpose CASCADE;
DROP TYPE IF EXISTS media_kind CASCADE;

-- Optional: only if nothing else in this DB needs it
-- DROP EXTENSION IF EXISTS pgcrypto;
