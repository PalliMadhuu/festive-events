# Database migrations

## Order

1. `000_migrations_table.sql`
2. `001_init_media.sql`
3. `001_init_media_mark.sql`
4. **`002_store_media_in_postgres.sql`** ← run this if you already created tables (adds `file_data BYTEA`)

Add future changes as `003_*.sql`, `004_*.sql`, …

## Storage note

Media bytes live in Postgres (`media.file_data`). No object storage required.
