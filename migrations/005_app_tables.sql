-- =============================================================================
-- 005: App data tables (move Firestore collections → Postgres)
-- Schema: utsav_seva  (keeps public.media / public.albums untouched)
-- IDs are TEXT so Firestore document ids can be preserved on migrate.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS utsav_seva;

-- ---------------------------------------------------------------------------
-- Users (Firebase Auth uid is the primary key — Auth itself stays on Firebase)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS utsav_seva.users (
  uid           TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL,
  phone_number  TEXT,
  photo_url     TEXT,
  street_id     TEXT,
  street_name   TEXT,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'superAdmin')),
  fcm_token     TEXT,
  removed       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email_active
  ON utsav_seva.users (lower(email))
  WHERE removed = FALSE;

CREATE INDEX IF NOT EXISTS idx_users_role
  ON utsav_seva.users (role)
  WHERE removed = FALSE;

-- ---------------------------------------------------------------------------
-- Streets / festivals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS utsav_seva.streets (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        TEXT NOT NULL,
  description TEXT,
  created_by  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS utsav_seva.festivals (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        TEXT NOT NULL,
  year        INTEGER NOT NULL,
  date        TEXT,
  emoji       TEXT,
  image_url   TEXT,
  created_by  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, year)
);

-- ---------------------------------------------------------------------------
-- Events (1 per street + year)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS utsav_seva.events (
  id                       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  street_id                TEXT NOT NULL,
  street_name              TEXT NOT NULL,
  festival_name            TEXT NOT NULL,
  year                     INTEGER NOT NULL,
  event_name               TEXT NOT NULL,
  description              TEXT,
  cover_image_url          TEXT,
  primary_organizer_id     TEXT NOT NULL,
  primary_organizer_name   TEXT NOT NULL DEFAULT '',
  organizer_ids            TEXT[] NOT NULL DEFAULT '{}',
  member_count             INTEGER NOT NULL DEFAULT 1,
  status                   TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'completed', 'cancelled')),
  slot                     INTEGER NOT NULL DEFAULT 1,
  total_expenses           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_donations          NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_street_donations   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sub_event_count          INTEGER NOT NULL DEFAULT 0,
  gallery_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_street_year
  ON utsav_seva.events (street_id, year);

CREATE INDEX IF NOT EXISTS idx_events_primary
  ON utsav_seva.events (primary_organizer_id);

CREATE INDEX IF NOT EXISTS idx_events_year
  ON utsav_seva.events (year DESC);

-- ---------------------------------------------------------------------------
-- Members / join requests / sub-events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS utsav_seva.event_members (
  event_id      TEXT NOT NULL REFERENCES utsav_seva.events (id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL,
  display_name  TEXT,
  photo_url     TEXT,
  role          TEXT NOT NULL CHECK (role IN ('member', 'organizer', 'primary_organizer')),
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by      TEXT,
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_members_user
  ON utsav_seva.event_members (user_id);

CREATE TABLE IF NOT EXISTS utsav_seva.join_requests (
  event_id      TEXT NOT NULL REFERENCES utsav_seva.events (id) ON DELETE CASCADE,
  uid           TEXT NOT NULL,
  display_name  TEXT NOT NULL DEFAULT '',
  photo_url     TEXT,
  email         TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected')),
  message       TEXT,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at   TIMESTAMPTZ,
  reviewed_by   TEXT,
  PRIMARY KEY (event_id, uid)
);

CREATE INDEX IF NOT EXISTS idx_join_requests_uid
  ON utsav_seva.join_requests (uid);

CREATE TABLE IF NOT EXISTS utsav_seva.sub_events (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id         TEXT NOT NULL REFERENCES utsav_seva.events (id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  date             TEXT NOT NULL,
  time             TEXT,
  location         TEXT,
  cover_image_url  TEXT,
  created_by       TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_events_event
  ON utsav_seva.sub_events (event_id);

-- ---------------------------------------------------------------------------
-- Expenses / donations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS utsav_seva.expenses (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id         TEXT NOT NULL REFERENCES utsav_seva.events (id) ON DELETE CASCADE,
  title            TEXT NOT NULL DEFAULT '',
  amount           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  category         TEXT,
  other_category   TEXT,
  description      TEXT,
  date             TEXT,
  sub_event_id     TEXT,
  receipt_urls     TEXT[] NOT NULL DEFAULT '{}',
  uploaded_by      TEXT NOT NULL,
  uploaded_by_name TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by       TEXT,
  updated_by_name  TEXT,
  deleted          BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at       TIMESTAMPTZ,
  deleted_by       TEXT,
  deleted_by_name  TEXT,
  deletion_reason  TEXT
);

CREATE INDEX IF NOT EXISTS idx_expenses_event
  ON utsav_seva.expenses (event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS utsav_seva.donations (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id         TEXT NOT NULL REFERENCES utsav_seva.events (id) ON DELETE CASCADE,
  donor_name       TEXT NOT NULL DEFAULT '',
  amount           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  note             TEXT,
  date             TEXT,
  photo_url        TEXT,
  status           TEXT NOT NULL DEFAULT 'given' CHECK (status IN ('given', 'pending')),
  uploaded_by      TEXT NOT NULL,
  uploaded_by_name TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ,
  updated_by       TEXT,
  updated_by_name  TEXT,
  deleted          BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at       TIMESTAMPTZ,
  deleted_by       TEXT,
  deleted_by_name  TEXT,
  deletion_reason  TEXT
);

CREATE INDEX IF NOT EXISTS idx_donations_event
  ON utsav_seva.donations (event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS utsav_seva.street_donations (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id         TEXT NOT NULL REFERENCES utsav_seva.events (id) ON DELETE CASCADE,
  donor_name       TEXT NOT NULL DEFAULT '',
  amount           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  note             TEXT,
  date             TEXT,
  photo_url        TEXT,
  status           TEXT NOT NULL DEFAULT 'given' CHECK (status IN ('given', 'pending')),
  uploaded_by      TEXT NOT NULL,
  uploaded_by_name TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ,
  updated_by       TEXT,
  updated_by_name  TEXT,
  deleted          BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at       TIMESTAMPTZ,
  deleted_by       TEXT,
  deleted_by_name  TEXT,
  deletion_reason  TEXT
);

CREATE INDEX IF NOT EXISTS idx_street_donations_event
  ON utsav_seva.street_donations (event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS utsav_seva.donation_likes (
  donation_id TEXT NOT NULL REFERENCES utsav_seva.donations (id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  PRIMARY KEY (donation_id, user_id)
);

CREATE TABLE IF NOT EXISTS utsav_seva.street_donation_likes (
  donation_id TEXT NOT NULL REFERENCES utsav_seva.street_donations (id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  PRIMARY KEY (donation_id, user_id)
);

-- Registration OTPs already exist in public.registration_otps (004).
-- Password OTPs for in-app change (optional; Cloud Functions may still handle Auth).
CREATE TABLE IF NOT EXISTS utsav_seva.password_otps (
  uid         TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  otp_hash    TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allow Firestore-style album ids on public.albums
DO $$ BEGIN
  ALTER TABLE public.albums ALTER COLUMN id DROP DEFAULT;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.albums ALTER COLUMN id TYPE TEXT USING id::text;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.albums ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS cover_url TEXT;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version     TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.schema_migrations (version, name)
VALUES ('005', 'app_tables')
ON CONFLICT (version) DO NOTHING;
