import { config } from 'dotenv';
config();
import { getDb } from '../lib/db.js';

const sql = getDb();
await sql`ALTER TABLE media DROP CONSTRAINT IF EXISTS fk_media_album`;
await sql`ALTER TABLE media ALTER COLUMN album_id TYPE TEXT USING album_id::text`;
console.log('album_id -> TEXT OK');
process.exit(0);
