/**
 * Small HTTP helpers shared by every route.
 *
 * Every response leaves the API in the same `{ ok, data | error }` envelope
 * so the storefront has exactly one code path for failures.
 */

import type { Context } from 'hono';
import type { ApiResult } from '@crochet/shared';
import type { ZodType } from 'zod';
import { env } from '../env.ts';

/** 200/201 with a success envelope. */
export const ok = <T>(c: Context, data: T, status: 200 | 201 = 200) =>
  c.json<ApiResult<T>>({ ok: true, data }, status);

/** 200 with a CDN-cacheable envelope. */
export const cached = <T>(c: Context, data: T, cacheControl = CACHE_CONTROL) =>
  c.json<ApiResult<T>>({ ok: true, data }, 200, { 'Cache-Control': cacheControl });

/** Short CDN window; admin writes bump `cache_invalidations` to bust it. */
export const CACHE_CONTROL = 'public, max-age=30, s-maxage=60, stale-while-revalidate=300';

/** An error envelope. `fields` carries per-input messages for form UIs. */
export const fail = (
  c: Context,
  status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500,
  error: string,
  fields?: Record<string, string>,
) => c.json<ApiResult<never>>({ ok: false, error, ...(fields && { fields }) }, status);

/**
 * Parse `input` with `schema`, returning either the value or a ready-made
 * 422 response. Use as: `const body = await parse(c, input, schema); if (body instanceof Response) return body;`
 */
export async function parse<T>(
  c: Context,
  input: unknown,
  schema: ZodType<T>,
): Promise<T | Response> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  return fail(c, 422, 'Please fix the highlighted fields.', fields);
}
/**
 * Log the real cause but return something safe. Never let a Postgres error
 * string (which can contain column names and constraint names) reach a
 * browser in production.
 */
export function unexpected(c: Context, err: unknown): Response {
  console.error(`[api] ${c.req.method} ${new URL(c.req.url).pathname}`, err);
  return fail(
    c,
    500,
    env.isProd ? 'Something went wrong on our end.' : String((err as Error)?.message ?? err),
  );
}

/** Postgres unique-violation. */
export const isUniqueViolation = (err: unknown): boolean =>
  (err as { code?: string })?.code === '23505';

/* ── In-memory rate limiting ─────────────────────────────────────────────
   Deliberately simple and per-instance. It is enough to blunt casual form
   spam on a single-node deploy; swap for Redis if this ever runs on more
   than one instance.

   Two things stop it becoming a memory leak, which matters because the key
   is derived from a request header and therefore attacker-controlled:

     1. `MAX_BUCKETS` caps the map. Without a cap, a flood of unique keys
        between sweeps grows the map without bound.
     2. Expired buckets are swept on write as well as on a timer, so the
        map shrinks even if the timer is starved.                                */

const buckets = new Map<string, { count: number; resetAt: number }>();

/** ~a day of hourly-ish clients; beyond this, oldest keys are evicted. */
const MAX_BUCKETS = 10_000;

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (bucket && bucket.resetAt <= now) {
    buckets.delete(key); // Expired: drop it so the slot can be reused.
  } else if (!bucket && buckets.size >= MAX_BUCKETS) {
    // Map is full. Evict expired entries first; if that frees nothing, drop
    // the oldest insertion (Map preserves insertion order).
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k);
    }
    if (buckets.size >= MAX_BUCKETS) {
      const oldest = buckets.keys().next();
      if (!oldest.done) buckets.delete(oldest.value);
    }
  }

  const current = buckets.get(key);
  if (!current) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  current.count += 1;
  if (current.count > limit) {
    return { ok: false, retryAfter: Math.ceil((current.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/** Background sweep. `unref` so a stray timer never holds the process open. */
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}, 60_000);
sweeper.unref?.();

/* Exported for tests: clears every counter. Not called by the app. */
export function _resetRateLimits(): void {
  buckets.clear();
}

/**
 * Client IP for rate-limit keys.
 *
 * Header trust is opt-in. `cf-connect-ip` and `x-real-ip` are trivially
 * spoofed by anyone who can reach the origin directly, so a flood of unique
 * IPs would otherwise walk straight past the limiter. Set
 * `TRUSTED_PROXY=true` only when the API is genuinely unreachable except
 * through Cloudflare or your reverse proxy.
 */
export function clientIp(c: Context): string {
  if (env.trustProxy) {
    const ip =
      c.req.header('cf-connect-ip') ??
      c.req.header('x-real-ip') ??
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (ip) return ip;
  }
  // Untrusted: everyone shares one bucket. Strictly, but it is the safe
  // failure mode — an attacker cannot get a fresh allowance per request.
  return 'untrusted';
}
