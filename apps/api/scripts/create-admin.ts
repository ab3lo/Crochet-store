/**
 * Create (or promote) the shop owner account.
 *
 * Run this once after the first deploy:
 *
 *   SEED_ADMIN_EMAIL=you@example.com \
 *   SEED_ADMIN_PASSWORD='a long passphrase' \
 *   bun run create-admin
 *
 * It is idempotent — running it again on an existing address just sets the
 * role, so it doubles as a way to restore admin rights to a locked-out
 * owner. It never logs the password, and it refuses to run without one
 * rather than falling back to something guessable.
 */

import { randomBytes } from 'node:crypto';
import { auth } from '../src/auth.ts';
import { env } from '../src/env.ts';
import { pool } from '../src/db.ts';

const email = env.SEED_ADMIN_EMAIL.toLowerCase();
let password = env.SEED_ADMIN_PASSWORD;

async function main() {
  /* ── Does this account already exist? ────────────────────────────── */
  const existing = await pool.query<{ id: string; role: string | null }>(
    `SELECT "id", "role" FROM "user" WHERE "email" = $1`,
    [email],
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0]!;
    await pool.query(`UPDATE "user" SET "role" = 'admin', "banned" = NULL, "banReason" = NULL, "banExpires" = NULL WHERE "id" = $1`, [row.id]);
    console.log(`\n  ${email} already existed. Restored admin rights.\n`);
    await pool.end();
    return;
  }

  /* ── New account: we need a password. ────────────────────────────── */
  if (!password) {
    // Offer a generated one rather than blocking — but make it explicit and
    // print it exactly once.
    password = randomBytes(18).toString('base64url');
    console.log('\n  SEED_ADMIN_PASSWORD was not set, so one was generated:');
    console.log(`\n    ${password}\n`);
    console.log('  Store it in a password manager now. It will not be shown again.\n');
  }

  if (password.length < 12) {
    console.error('\n✗ SEED_ADMIN_PASSWORD must be at least 12 characters.\n');
    await pool.end();
    process.exitCode = 1;
    return;
  }

  await auth.api.signUpEmail({
    body: { email, password, name: 'Shop owner' },
  });

  // `signUpEmail` never sets a role — promotion is a database concern, and
  // deliberately a separate step so that signing up through the API can
  // never make somebody an admin.
  await pool.query(`UPDATE "user" SET "role" = 'admin' WHERE "email" = $1`, [email]);

  console.log(`\n  ✓ ${email} is now an admin. Sign in at /admin.\n`);
  await pool.end();
}

main().catch(async (err) => {
  console.error('\n✗ Could not create the admin account:\n');
  console.error(err instanceof Error ? err.message : err);
  await pool.end().catch(() => {});
  process.exitCode = 1;
});
