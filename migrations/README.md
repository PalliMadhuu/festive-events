# Database migrations

## Order

1. `000_migrations_table.sql`
2. `001_init_media.sql`
3. `001_init_media_mark.sql`
4. **`002_store_media_in_postgres.sql`** ← run this if you already created tables (adds `file_data BYTEA`)
5. `003_album_id_text.sql`
6. `004_registration_otps.sql`
7. **`005_app_tables.sql`** ← users, events, donations, expenses (Firestore replacement)

Then copy existing Firestore data:

```bash
npm run db:apply -- migrations/005_app_tables.sql
npm run db:migrate-firestore
```

Add future changes as `003_*.sql`, `004_*.sql`, …

## Storage note

Media bytes live in Postgres (`media.file_data`). No object storage required.
