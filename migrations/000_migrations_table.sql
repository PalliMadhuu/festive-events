-- =============================================================================
-- Festive Events — migration ledger
-- File: api/migrations/000_migrations_table.sql
-- Run FIRST (once), then run numbered migrations in order.
-- =============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
