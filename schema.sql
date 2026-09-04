-- =============================================================================
-- FULL BOOTSTRAP — photos/videos stored IN Postgres (BYTEA)
-- Paste into pgAdmin Query Tool AFTER after running 000_rollback_media.sql
-- (or on a fresh database).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  CREATE TYPE media_purpose AS ENUM (
    'gallery',
    'donation',
    'receipt',
    'avatar',
    'cover'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE media_kind AS ENUM ('photo', 'video');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS albums (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         TEXT NOT NULL,
  name             TEXT NOT NULL,
  cover_media_id   UUID,
  media_count      INTEGER NOT NULL DEFAULT 0,
  created_by       TEXT NOT NULL,
  created_by_name  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted          BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_albums_event
  ON albums (event_id)
  WHERE deleted = FALSE;

CREATE TABLE IF NOT EXISTS media (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose          media_purpose NOT NULL,
  kind             media_kind NOT NULL DEFAULT 'photo',

  -- Mapping IDs from the app
  event_id         TEXT,
  sub_event_id     TEXT,
  album_id         UUID,
  user_id          TEXT,
  donation_id      TEXT,
  expense_id       TEXT,

  -- File metadata
  file_name        TEXT NOT NULL,
  content_type     TEXT NOT NULL,
  size_bytes       BIGINT NOT NULL DEFAULT 0,
  duration_seconds NUMERIC(10, 2),
  width            INTEGER,
  height           INTEGER,

  -- File bytes live HERE (not Vercel Blob / S3)
  file_data        BYTEA,

  -- Convenient path for clients, e.g. /api/media/{id}/file
  url              TEXT,
  blob_pathname    TEXT,          -- unused (legacy); keep nullable
  thumbnail_url    TEXT,

  uploaded_by      TEXT NOT NULL,
  uploaded_by_name TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  deleted          BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at       TIMESTAMPTZ,
  deleted_by       TEXT,
  deleted_by_name  TEXT,
  deletion_reason  TEXT,

  CONSTRAINT media_event_required CHECK (
    purpose = 'avatar' OR event_id IS NOT NULL
  ),
  CONSTRAINT media_avatar_user_required CHECK (
    purpose <> 'avatar' OR user_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_media_event
  ON media (event_id)
  WHERE deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_media_purpose_event
  ON media (purpose, event_id)
  WHERE deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_media_kind_event
  ON media (event_id, kind)
  WHERE deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_media_album
  ON media (album_id)
  WHERE deleted = FALSE AND album_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_media_sub_event
  ON media (sub_event_id)
  WHERE deleted = FALSE AND sub_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_media_user
  ON media (user_id)
  WHERE deleted = FALSE AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_media_donation
  ON media (donation_id)
  WHERE deleted = FALSE AND donation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_media_expense
  ON media (expense_id)
  WHERE deleted = FALSE AND expense_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_media_created
  ON media (created_at DESC);

DO $$ BEGIN
  ALTER TABLE media
    ADD CONSTRAINT fk_media_album
    FOREIGN KEY (album_id) REFERENCES albums (id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO schema_migrations (version, name)
VALUES
  ('001', 'init_media'),
  ('002', 'store_media_in_postgres')
ON CONFLICT (version) DO NOTHING;
