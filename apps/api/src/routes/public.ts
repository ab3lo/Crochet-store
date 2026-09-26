/**
 * Public storefront API.
 *
 * Everything here is readable without a session. Response bodies are
 * cacheable at the CDN for a short window; admin writes invalidate the
 * relevant cache afterwards to keep the storefront honest.
 */

import { Hono } from 'hono';
import {
  CATEGORY_META,
  categorySchema,
  customOrderInputSchema,
  newsletterInputSchema,
} from '@crochet/shared';
import {
  activeBanners,
  getProductBySlug,
  listProducts,
  query,
  queryOne,
  toBannerViews,
  type ProductFilter,
} from '../db.ts';
import { cached, clientIp, fail, ok, parse, rateLimit, unexpected } from '../lib/http.ts';

export const publicRoutes = new Hono();

publicRoutes.get('/health', (c) =>
  ok(c, { status: 'up', time: new Date().toISOString() }),
);

publicRoutes.get('/categories', (c) => cached(c, CATEGORY_META));

publicRoutes.get('/products', async (c) => {
  const raw = c.req.query();

  const filter: ProductFilter = {};

  if (raw.category) {
    const category = categorySchema.safeParse(raw.category);
    if (!category.success) return fail(c, 400, 'Unknown category.');
    filter.category = category.data;
  }

  if (raw.q) filter.search = raw.q.slice(0, 80);

  if (raw.limit) {
    const limit = Number(raw.limit);
    if (!Number.isFinite(limit)) return fail(c, 400, 'limit must be a number.');
    filter.limit = limit;
  }

  try {
    const products = await listProducts(filter);
    return cached(c, products);
  } catch (err) {
    return unexpected(c, err);
  }
});

publicRoutes.get('/products/:slug', async (c) => {
  try {
    const product = await getProductBySlug(c.req.param('slug'));
    if (!product) return fail(c, 404, 'That piece is not here any more.');
    return cached(c, product);
  } catch (err) {
    return unexpected(c, err);
  }
});

/** Banners the storefront should render right now. */
publicRoutes.get('/banners/active', async (c) => {
  try {
    const banners = await toBannerViews(await activeBanners());
    return cached(c, banners);
  } catch (err) {
    return unexpected(c, err);
  }
});

/* ── Custom order enquiry ────────────────────────────────────────────── */

publicRoutes.post('/orders', async (c) => {
  const limit = rateLimit(`orders:${clientIp(c)}`, { limit: 5, windowMs: 10 * 60_000 });
  if (!limit.ok) {
    c.header('Retry-After', String(limit.retryAfter));
    return fail(c, 429, 'That is a few too many enquiries. Try again shortly.');
  }

  const body = await c.req.json().catch(() => null);
  const parsed = await parse(c, body, customOrderInputSchema);
  if (parsed instanceof Response) return parsed;

  try {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO custom_orders
         (name, email, contact, category, quantity, brief, budget_cents, needed_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'new')
       RETURNING id`,
      [
        parsed.name,
        parsed.email.toLowerCase(),
        parsed.contact,
        parsed.category,
        parsed.quantity,
        parsed.brief,
        parsed.budgetCents,
        parsed.neededBy,
      ],
    );
    return ok(c, { id: row!.id }, 201);
  } catch (err) {
    return unexpected(c, err);
  }
});

/* ── Newsletter ──────────────────────────────────────────────────────── */

publicRoutes.post('/newsletter', async (c) => {
  const limit = rateLimit(`news:${clientIp(c)}`, { limit: 5, windowMs: 60 * 60_000 });
  if (!limit.ok) {
    c.header('Retry-After', String(limit.retryAfter));
    return fail(c, 429, 'You have signed up a few times already. Try later.');
  }

  const body = await c.req.json().catch(() => null);
  const parsed = await parse(c, body, newsletterInputSchema);
  if (parsed instanceof Response) return parsed;

  try {
    // ON CONFLICT makes a repeat signup a harmless no-op instead of a 500.
    await query(
      `INSERT INTO newsletter (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`,
      [parsed.email.toLowerCase()],
    );
    return ok(c, { subscribed: true }, 201);
  } catch (err) {
    return unexpected(c, err);
  }
});
