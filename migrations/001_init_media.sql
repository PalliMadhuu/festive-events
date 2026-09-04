-- =============================================================================
-- Festive Events — Postgres media schema
-- File: api/migrations/001_init_media.sql
-- Run this ONCE in Neon SQL Editor (or: psql "$DATABASE_URL" -f ...)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE media_purpose AS ENUM (
    'gallery',   -- event gallery photos/videos
    'donation',  -- donation proof photo
    'receipt',   -- expense receipt image
    'avatar',    -- user profile photo
    'cover'      -- event / sub-event cover image
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE media_kind AS ENUM ('photo', 'video');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Albums (optional grouping under an event)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Media (photos + videos) with ID-based mapping
-- ---------------------------------------------------------------------------
-- Fetch patterns the app will use:
--   GET /api/media?eventId=...&purpose=gallery
--   GET /api/media?eventId=...&subEventId=...
--   GET /api/media?eventId=...&albumId=...
--   GET /api/media?eventId=...&purpose=donation
--   GET /api/media?eventId=...&purpose=receipt
--   GET /api/media?userId=...&purpose=avatar
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What this file is for
  purpose          media_purpose NOT NULL,
  kind             media_kind NOT NULL DEFAULT 'photo',

  -- Mapping IDs (from the mobile app / Firebase event IDs, etc.)
  event_id         TEXT,
  sub_event_id     TEXT,
  album_id         UUID,
  user_id          TEXT,
  -- Optional link back to donation / expense docs in your app
  donation_id      TEXT,
  expense_id       TEXT,

  -- File metadata
  file_name        TEXT NOT NULL,
  content_type     TEXT NOT NULL,
  size_bytes       BIGINT NOT NULL DEFAULT 0,
  duration_seconds NUMERIC(10, 2),
  width            INTEGER,
  height           INTEGER,

  -- Storage
  url              TEXT,
  blob_pathname    TEXT,
  thumbnail_url    TEXT,
  file_data        BYTEA,

  -- Audit
  uploaded_by      TEXT NOT NULL,
  uploaded_by_name TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Soft delete (still visible / auditable if you choose)
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

-- Helpful indexes for fetch-by-ID mapping
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

-- Optional FK once albums exist (album_id is UUID)
DO $$ BEGIN
  ALTER TABLE media
    ADD CONSTRAINT fk_media_album
    FOREIGN KEY (album_id) REFERENCES albums (id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Keep albums.cover_media_id loosely linked (no hard FK cycle required)
COMMENT ON TABLE media IS
  'Photos/videos stored in Vercel Blob; mapped by event_id / sub_event_id / album_id / user_id / purpose.';

COMMENT ON COLUMN media.event_id IS 'App event id (e.g. Firestore event document id).';
COMMENT ON COLUMN media.sub_event_id IS 'Optional sub-event id under the event.';
COMMENT ON COLUMN media.album_id IS 'Optional album UUID from albums table.';
COMMENT ON COLUMN media.user_id IS 'Required when purpose = avatar.';
COMMENT ON COLUMN media.donation_id IS 'Optional donation record id this photo belongs to.';
COMMENT ON COLUMN media.expense_id IS 'Optional expense record id this receipt belongs to.';
