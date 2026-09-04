-- =============================================================================
-- 002: Store photo/video bytes in Postgres (no Vercel Blob)
-- Run in Neon SQL Editor AFTER deploying the updated API.
-- Safe to run if 001 already applied.
-- =============================================================================

-- Binary payload
ALTER TABLE media
  ADD COLUMN IF NOT EXISTS file_data BYTEA;

-- Prefer DB storage; url becomes the API file path (optional absolute base later)
ALTER TABLE media
  ALTER COLUMN url DROP NOT NULL;

ALTER TABLE media
  ALTER COLUMN url SET DEFAULT '';

COMMENT ON COLUMN media.file_data IS
  'Raw photo/video bytes stored in Postgres. Served via GET /api/media/:id/file';

COMMENT ON COLUMN media.blob_pathname IS
  'Deprecated when using Postgres storage. Kept for backward compatibility.';

-- Optional: reject empty uploads going forward (enforced in API; soft DB check)
-- Not adding CHECK here so old rows without file_data remain valid.

INSERT INTO schema_migrations (version, name)
VALUES ('002', 'store_media_in_postgres')
ON CONFLICT (version) DO NOTHING;
