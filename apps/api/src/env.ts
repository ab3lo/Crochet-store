/**
 * Fail-fast environment validation.
 *
 * Nothing else in the API reads `process.env` directly, so a missing or
 * malformed variable produces one clear error at boot instead of a
 * confusing 500 three hours later.
 */

import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),

  BETTER_AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_TRUSTED_ORIGINS: z.string().default(''),

  DATABASE_URL: z.string().min(1, 'Supabase connection string is required'),

  SUPABASE_URL: z.url(),

  /**
   * Server-only. An elevated key that bypasses RLS and can write to the
   * public image bucket, so it must never reach a client — the storefront
   * reads image URLs out of the database and needs no credential at all.
   *
   * Holds either the current `sb_secret_...` key or the deprecated
   * `service_role` JWT; both are accepted and mean the same thing here.
   */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_STORAGE_BUCKET: z.string().default('product-images'),

  /**
   * Honour cf-connect-ip / x-real-ip / x-forwarded-for for rate-limit keys.
   * Only enable when the API is unreachable except through Cloudflare or a
   * reverse proxy that overwrites those headers. Off by default, because
   * those headers are client-spoofable otherwise.
   */
  TRUSTED_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  SEED_ADMIN_EMAIL: z.email().default('owner@example.com'),
  SEED_ADMIN_PASSWORD: z.string().min(12).optional(),

  /**
   * Cloudflare Pages deploy hook. Optional, and the API is fully functional
   * without it — see `lib/deploy.ts` for what is lost (edits do not publish
   * on their own).
   *
   * Deliberately a bare URL with no project ID or environment branching, so
   * the same build is portable: a second API is a second `.env`, not a
   * second deployment of this code.
   */
  PAGES_DEPLOY_HOOK: z.url().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Every problem at once, not the first one. This function runs at most once
  // per process start, so the cost of a second attempt is a restart — and a
  // restart-per-typo loop is exactly what someone hits when they are moving
  // the API to a new machine and filling in `.env` for the first time.
  const detail = parsed.error.issues
    .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
    .join('\n');

  console.error(
    `\n✗ Invalid environment — copy .env.example to .env and fill it in.\n${detail}\n` +
      `  ${parsed.error.issues.length} problem(s) above. All of them are listed on purpose.\n`,
  );
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProd: raw.NODE_ENV === 'production',
  trustProxy: raw.TRUSTED_PROXY,
  /** Storefront + admin origins allowed to call this API from a browser. */
  trustedOrigins: raw.BETTER_AUTH_TRUSTED_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
} as const;

/**
 * What this process can and cannot do, printed once at boot.
 *
 * Value names only, never values — a readiness line that echoed a connection
 * string or a key would put a credential in whatever collects the logs, which
 * is the same mistake as committing one.
 *
 * The reason this exists is migration. Nothing about the admin panel is bound
 * to a machine, so "move it to the new laptop" is a real operation someone
 * will do, and the failure mode without this is a blank 500 from the browser
 * while the actual cause is three lines up in a terminal they have not looked
 * at. A boot report names the missing piece directly.
 */
export function bootReport(): void {
  const lines: string[] = [];
  const warn: string[] = [];

  if (env.PAGES_DEPLOY_HOOK) {
    lines.push('publish      deploy hook set — edits go live automatically');
  } else {
    warn.push(
      'publish      NO deploy hook — edits save to the database but will not\n' +
        '             appear on the site until the next deploy. Set\n' +
        '             PAGES_DEPLOY_HOOK to fix (Cloudflare Pages → your\n' +
        '             project → Settings → Builds → Deploy hooks).',
    );
  }

  if (env.isProd && !env.trustProxy) {
    warn.push(
      'proxy        TRUSTED_PROXY is off, so every visitor shares one rate-limit\n' +
        '             bucket. Fine behind a tunnel, wrong behind a raw port.',
    );
  }

  if (env.SEED_ADMIN_PASSWORD) {
    warn.push(
      'seed         SEED_ADMIN_PASSWORD is set. It is only used to create the first\n' +
        '             admin account — remove it once you have signed in.',
    );
  }

  console.log('\n  Crochet & Co. API — ready\n');
  for (const l of lines) console.log(`  ✓ ${l}`);
  for (const w of warn) console.log(`  ! ${w}`);
  if (warn.length === 0) console.log('  ✓ nothing needs attention');
  console.log('');
}
