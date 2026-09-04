import { config } from 'dotenv';
config();
import { getDb } from '../lib/db.js';

const sql = getDb();
const r = await sql`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_name = 'media' AND column_name = 'file_data'
`;
console.log(r.length ? 'file_data: YES' : 'file_data: MISSING — run migrations/002_store_media_in_postgres.sql');
process.exit(0);
