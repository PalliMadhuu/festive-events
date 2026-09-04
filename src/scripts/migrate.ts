console.log(`
Apply the Postgres schema in pgAdmin / Neon SQL Editor:

  1. (optional revert) api/migrations/000_rollback_media.sql
  2. api/schema.sql

Then set only DATABASE_URL in api/.env and run: npm run dev
`);
