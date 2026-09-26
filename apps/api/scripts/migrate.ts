/**
 * Migration runner.
 *
 * Applies every `migrations/*.sql` file in order, once, inside a
 * transaction, tracked in `_migrations`. Each file is also written to be
 * idempotent (`IF NOT EXISTS`) so a re-run on a fresh database is safe.
 *
 *   bun run db:migrate
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.ts';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'migrations');

const client = await pool.connect();
let applied = 0;

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const done = new Set(
    (await client.query<{ name: string }>('SELECT name FROM _migrations')).rows.map(
      (r) => r.name,
    ),
  );

  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (done.has(file)) {
      console.log(`  – ${file} (already applied)`);
      continue;
    }

    const sql = await readFile(join(dir, file), 'utf8');
    console.log(`  ✓ ${file}`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied++;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }

  console.log(
    applied === 0
      ? '\nNothing new to apply.\n'
      : `\nApplied ${applied} migration(s).\n`,
  );
} catch (err) {
  console.error('\n✗ Migration failed:\n', (err as Error).message, '\n');
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
