/**
 * Bun + Hono API for the Crochet & Co. storefront.
 *
 * Responsibilities:
 *   /api/auth/*   Better Auth (sign-in, session, sign-out)
 *   /api/*        Public catalogue, banners, custom-order enquiries
 *   /api/admin/*  Auth-guarded CRUD + the banner auto-generator
 *
 * The storefront is a separate static deploy; this process only ever
 * returns JSON.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { compress } from 'hono/compress';
import { env, bootReport } from './env.ts';
import { auth } from './auth.ts';
import { pool } from './db.ts';
import { fail, rateLimit, clientIp, unexpected } from './lib/http.ts';
import { publicRoutes } from './routes/public.ts';
import { adminRoutes } from './routes/admin.ts';

const app = new Hono();

/* ── Platform middleware ─────────────────────────────────────────────── */

app.use('*', logger());
app.use('*', compress());

app.use(
  '*',
  cors({
    // Same-origin in production (Pages proxying /api), explicit list in dev.
    origin: (origin) => {
      if (!origin) return origin ?? null; // curl / server-to-server
      if (env.trustedOrigins.includes(origin)) return origin;
      // Better Auth's own base URL is always allowed (it is the API itself).
      if (origin === env.BETTER_AUTH_URL) return origin;
      return null;
    },
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Length'],
    credentials: true,
    maxAge: 86_400,
  }),
);

// Baseline abuse guard for anonymous traffic. Admin routes are separately
// protected by the session guard, which is the real gate.
app.use('*', async (c, next) => {
  const guard = rateLimit(`hit:${clientIp(c)}`, { limit: 600, windowMs: 60_000 });
  if (!guard.ok) {
    c.header('Retry-After', String(guard.retryAfter));
    return fail(c, 429, 'Slow down a moment.');
  }
  await next();
});

/* ── Better Auth ─────────────────────────────────────────────────────── */

app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

/** Cheap "am I signed in and an admin" probe for the admin SPA. */
app.get('/api/session', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return fail(c, 401, 'Not signed in.');
  return c.json({
    ok: true as const,
    data: {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: (session.user as { role?: string }).role === 'admin' ? 'admin' : 'user',
      },
    },
  });
});

/* ── API surface ─────────────────────────────────────────────────────── */

app.route('/api', publicRoutes);

/**
 * Session guard for the admin area.
 *
 * Three layers, cheapest first:
 *
 *   1. **Origin check on mutations.** A browser always sends `Origin` on a
 *      cross-site POST/PATCH/DELETE, and never on a same-origin one. If the
 *      origin is not in the allowlist, the request is refused. This is CSRF
 *      defence that does not rely on the cookie's SameSite attribute alone.
 *   2. **Session.** No cookie, no access.
 *   3. **Role.** `role === 'admin'`, enforced server-side. Hiding the admin
 *      UI in the browser is not a security control and is not relied on.
 */
app.use('/api/admin/*', async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const origin = c.req.header('origin');
    // A missing Origin means a non-browser client (curl, server-to-server).
    // Those still need a valid session below, so allow it through rather than
    // breaking legitimate scripted access.
    if (origin && !env.trustedOrigins.includes(origin)) {
      return fail(c, 403, 'Request blocked: unexpected origin.');
    }
  }

  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return fail(c, 401, 'Sign in to the admin panel first.');

  const role = (session.user as { role?: string }).role;
  if (role !== 'admin') {
    return fail(c, 403, 'This area is for the shop owner.');
  }

  await next();
});

app.route('/api/admin', adminRoutes);

/* ── Errors ──────────────────────────────────────────────────────────── */

app.notFound((c) => fail(c, 404, 'No such endpoint.'));
app.onError((err, c) => unexpected(c, err));

/* ── Boot ────────────────────────────────────────────────────────────── */

const port = env.PORT;
console.log(`\n  Crochet & Co. API  →  http://localhost:${port}`);
console.log(`  storefront origins  →  ${env.trustedOrigins.join(', ') || '(none set)'}`);

// Names only, never values — see the note on the function. This is the line
// that makes "moved it to a new machine and something is broken" a readable
// sentence instead of a blank 500 in the browser.
bootReport();

// Deliberately NOT `export default app`. Bun treats a default-exported
// `fetch`-shaped object as a server config and would start a *second*
// listener on the same port, which fails with EADDRINUSE. Named exports
// keep the app importable for tests without that side effect.
const fetchHandler = app.fetch;

Bun.serve({
  port,
  fetch: (request) => fetchHandler(request),
  // Fail fast on a dead pool rather than hanging a request forever.
  idleTimeout: 60,
});

async function shutdown(signal: string) {
  console.log(`\n[api] ${signal} — closing the pool.`);
  await pool.end().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

export { app, auth };
