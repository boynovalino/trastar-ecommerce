import pg from 'pg';
const { Pool } = pg;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 20000,
  application_name: 'trastar-ecommerce'
});
export function requireDatabase() {
  if (!process.env.DATABASE_URL) {
    const err = new Error('Database not configured');
    err.status = 503; err.code = 'DATABASE_NOT_CONFIGURED'; throw err;
  }
}
export async function withTransaction(fn) {
  requireDatabase();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch(e) {
    await client.query('ROLLBACK');
    throw e;
  } finally { client.release(); }
}
