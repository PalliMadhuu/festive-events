import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export type Sql = ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<any[]>) & {
  query: (text: string, params?: unknown[]) => Promise<any[]>;
};

function makeSql(queryable: { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> }): Sql {
  const tagged = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = '';
    const params: unknown[] = [];
    strings.forEach((part, i) => {
      text += part;
      if (i < values.length) {
        params.push(values[i]);
        text += `$${params.length}`;
      }
    });
    const result = await queryable.query(text, params);
    return result.rows;
  };
  (tagged as Sql).query = async (text: string, params: unknown[] = []) => {
    const result = await queryable.query(text, params);
    return result.rows;
  };
  return tagged as Sql;
}

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
  return makeSql(getPool());
}

export async function withTransaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(makeSql(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
