# What you need to connect

Photos/videos are stored in PostgreSQL (`media.file_data`). No API key.

## Required

| Item | Env var | Example |
|------|---------|---------|
| Postgres connection string | `DATABASE_URL` | `postgresql://postgres:PASSWORD@localhost:5432/your_db` |

## Optional

| Item | Env var |
|------|---------|
| Absolute file URLs | `API_PUBLIC_URL` |
| CORS | `CORS_ORIGIN` (`*` by default) |

## SQL

1. Revert old schema (if needed): `api/migrations/000_rollback_media.sql`
2. Create updated tables: `api/schema.sql`
