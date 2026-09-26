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

  /**
   * Cloudflare R2, for product imagery.
   *
   * The database is Supabase Postgres; the images are not. R2's egress is free
   * and unmetered, which is the whole reason it beat Supabase Storage here.
   *
   * `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` are server-only and are the
   * only credentials in this file that can write to a public bucket. They must
   * never be exposed to a client — the storefront reads image URLs from the
   * database, so it needs no R2 credential at all.
   */
  R2_ACCOUNT_ID: z.string().min(1, 'Cloudflare account id is required'),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().default('product-images'),
  /** Public base the bucket is served from, with no trailing slash. */
  R2_PUBLIC_URL: z
    .url()
    .refine(v => !v.endsWith('/'), 'R2_PUBLIC_URL must not have a trailing slash'),

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
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  console.error(
    `\n✗ Invalid environment — copy .env.example to .env and fill it in.\n${detail}\n`,
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
