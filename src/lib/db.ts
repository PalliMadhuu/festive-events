import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      // Many hosted PG servers (incl. remote IPs) need this off unless SSL is configured
      ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      max: 10,
    });
  }
  return pool;
}

/**
 * Tagged-template style helper compatible with previous neon`...` call sites.
 * Usage: await sql`SELECT * FROM media WHERE id = ${id}`
 */
export function getDb() {
  const pool = getPool();

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
    const result = await pool.query(text, params);
    return result.rows;
  }

  return sql;
}
