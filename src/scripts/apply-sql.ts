import { config } from 'dotenv';
config();

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getPool } from '../lib/db.js';

async function main() {
  const file = process.argv[2] || 'migrations/005_app_tables.sql';
  const sql = readFileSync(resolve(process.cwd(), file), 'utf8');
  const pool = getPool();
  await pool.query(sql);
  console.log(`Applied ${file}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
