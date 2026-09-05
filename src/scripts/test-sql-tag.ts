import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../api/.env' });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function getDb() {
  async function sql(strings: TemplateStringsArray, ...values: unknown[]) {
    let text = '';
    const params: unknown[] = [];
    strings.forEach((part, i) => {
      text += part;
      if (i < values.length) {
        params.push(values[i]);
        text += `$${params.length}`;
      }
    });
    console.log('SQL:', text.replace(/\s+/g, ' ').trim());
    console.log('PARAMS:', params);
    const result = await pool.query(text, params);
    return result.rows;
  }
  return sql;
}

const sql = getDb();
const id = 'a3b87a7b-84e2-459e-a3bf-8d6938ecee7e';
const rows = await sql`
      SELECT id, file_name, deleted
      FROM media
      WHERE id = ${id}::uuid
    `;
console.log('rows', rows.length, rows[0]);
await pool.end();
