import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../api/.env' });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const id = 'a3b87a7b-84e2-459e-a3bf-8d6938ecee7e';

const a = await pool.query('SELECT id FROM media WHERE id = $1::uuid', [id]);
const b = await pool.query('SELECT id FROM media WHERE id::text = $1', [id]);
const c = await pool.query('SELECT id FROM media WHERE id = $1', [id]);
console.log('cast uuid', a.rowCount, a.rows[0]);
console.log('text', b.rowCount, b.rows[0]);
console.log('plain', c.rowCount, c.rows[0]);

// Simulate broken tagged template if ::uuid ends up wrong
const broken = await pool.query('SELECT id FROM media WHERE id = $1', [id + '::uuid']).catch((e) => e.message);
console.log('broken param', broken);

await pool.end();
