import { config } from 'dotenv';
config();

import { getDb } from '../lib/db.js';

async function main() {
  const sql = getDb();
  const rows = await sql`SELECT current_database() AS db, current_user AS usr`;
  console.log('Connected:', rows[0]);
  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('media', 'albums', 'schema_migrations')
    ORDER BY table_name
  `;
  console.log(
    'Tables:',
    tables.map((t: { table_name: string }) => t.table_name)
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('Connection failed:', err.message);
  process.exit(1);
});
