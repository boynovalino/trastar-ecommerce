import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pool } from '../lib/db.js';
const dir = resolve('db');
const files = readdirSync(dir).filter(x => /^[0-9]+_.*\.sql$/.test(x)).sort();
const client = await pool.connect();
try {
  for (const file of files) {
    await client.query('BEGIN');
    try {
      await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
      const existing = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [file]);
      if (existing.rowCount === 0) {
        await client.query(readFileSync(resolve(dir, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [file]);
        process.stdout.write('APPLIED ' + file + '\n');
      } else process.stdout.write('ALREADY ' + file + '\n');
      await client.query('COMMIT');
    } catch(e) { await client.query('ROLLBACK'); throw e; }
  }
} finally { client.release(); await pool.end(); }
