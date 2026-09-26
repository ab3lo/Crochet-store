/**
 * Admin API. Every route below `/api/admin` sits behind `requireAdmin`
 * in `index.ts`, so nothing here re-checks the session itself.
 */

import { Hono } from 'hono';
import {
  bannerInputSchema,
  orderFilterSchema,
  orderUpdateSchema,
  productInputSchema,
  uuidParamSchema,
  type Banner,
  type Category,
  type PublishState,
} from '@crochet/shared';
import {
  activeBanners,
  listBanners,
  listCustomOrders,
  listProducts,
  query,
  queryOne,
  replaceProductImages,
  toBanner,
  toBannerViews,
  type BannerRow,
} from '../db.ts';
import { fail, isUniqueViolation, ok, parse, unexpected } from '../lib/http.ts';
import { generateBanner } from '../lib/banner-engine.ts';
import { uploadProductImage, UploadError } from '../lib/storage.ts';
import { triggerRebuild } from '../lib/deploy.ts';

/**
 * Ask the storefront to rebuild, and report whether it happened.
 *
 * Every catalogue write ends with this. The reason order and enquiry updates
 * do *not* is budget, not principle: Cloudflare's free plan allows a few
 * hundred builds a month, and a rebuild takes a couple of minutes. Firing one
 * per status change on an enquiry would spend the whole allowance in a week
 * and publish nothing, because a status change does not alter a single byte of
 * the static site. Stock and visibility do, and those go through the product
 * routes below like any other product edit.
 */
async function publish<T>(data: T): Promise<T & { publish: PublishState }> {
  return { ...data, publish: await triggerRebuild() };
}

export const adminRoutes = new Hono();

/* ── Products ────────────────────────────────────────────────────────── */

adminRoutes.get('/products', async (c) => {
  try {
    const raw = c.req.query();
    const filter: { includeHidden: boolean; category?: Category; search?: string } = {
      includeHidden: raw.includeHidden !== 'false',
    };
    if (raw.category) filter.category = raw.category as Category;
    if (raw.q) filter.search = raw.q.slice(0, 80);

    return ok(c, await listProducts(filter));
  } catch (err) {
    return unexpected(c, err);
  }
});

adminRoutes.get('/products/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const row = await queryOne(
      `SELECT * FROM products WHERE id = $1`,
      [id],
    );
    if (!row) return fail(c, 404, 'No such product.');
    return ok(c, row);
  } catch (err) {
    return unexpected(c, err);
  }
});

adminRoutes.post('/products', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = await parse(c, body, productInputSchema);
  if (parsed instanceof Response) return parsed;

  try {
    const clash = await queryOne(
      `SELECT 1 FROM products WHERE slug = $1`,
      [parsed.slug],
    );
    if (clash) {
      return fail(c, 409, 'That URL slug is already taken.', {
        slug: 'Already in use — add something to the end',
      });
    }

    const row = await queryOne<{ id: string }>(
      `INSERT INTO products
         (slug, name, tagline, description, price_cents, compare_at_cents,
          category, images, details, stock, made_to_order, hidden, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        parsed.slug,
        parsed.name,
        parsed.tagline,
        parsed.description,
        parsed.priceCents,
        parsed.compareAtCents,
        parsed.category,
        // The column is text[]; the objects carry the attribution and live in
        // product_images. Same list, two shapes — see replaceProductImages.
        parsed.images.map((i) => i.url),
        JSON.stringify(parsed.details),
        parsed.stock,
        parsed.madeToOrder,
        parsed.hidden,
        parsed.sortOrder,
      ],
    );

    // A create with images should not leave them unattributed.
    if (parsed.images.length > 0) {
      await replaceProductImages(row!.id as string, parsed.images);
    }

    return ok(c, await publish({ id: row!.id }), 201);
  } catch (err) {
    return unexpected(c, err);
  }
});

adminRoutes.patch('/products/:id', async (c) => {
  const body = await c.req.json().catch(() => null);
  // Partial update: validate only the keys that were actually sent.
  const shape = productInputSchema.partial();
  const parsed = await parse(c, body, shape);
  if (parsed instanceof Response) return parsed;

  const entries = Object.entries(parsed);
  if (entries.length === 0) return fail(c, 400, 'Nothing to change.');

  const columns: Record<string, string> = {
    slug: 'slug',
    name: 'name',
    tagline: 'tagline',
    description: 'description',
    priceCents: 'price_cents',
    compareAtCents: 'compare_at_cents',
    category: 'category',
    images: 'images',
    details: 'details',
    stock: 'stock',
    madeToOrder: 'made_to_order',
    hidden: 'hidden',
    sortOrder: 'sort_order',
  };

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of entries) {
    const column = columns[key];
    if (!column) continue; // Ignore unknown keys rather than 500.
    // `images` parses to objects; the column only stores the URLs.
    if (key === 'images') {
      values.push((value as { url: string }[]).map((i) => i.url));
    } else {
      values.push(key === 'details' ? JSON.stringify(value) : value);
    }
    sets.push(`${column} = $${values.length}`);
  }
  values.push(c.req.param('id'));

  try {
    if (parsed.slug) {
      const clash = await queryOne(`SELECT 1 FROM products WHERE slug = $1 AND id <> $2`, [
        parsed.slug,
        c.req.param('id'),
      ]);
      if (clash) {
        return fail(c, 409, 'That URL slug is already taken.', {
          slug: 'Already in use — add something to the end',
        });
      }
    }

    const row = await queryOne(
      `UPDATE products SET ${sets.join(', ')}, updated_at = now()
        WHERE id = $${values.length} RETURNING id`,
      values,
    );
    if (!row) return fail(c, 404, 'No such product.');

    // Images and their attribution are stored in two places, so they are
    // written together — see replaceProductImages. Only when this request
    // actually touched the image list, so a rename does not wipe provenance.
    if (parsed.images) {
      await replaceProductImages(row.id as string, parsed.images);
    }

    return ok(c, await publish({ id: row.id }));
  } catch (err) {
    return unexpected(c, err);
  }
});

adminRoutes.delete('/products/:id', async (c) => {
  try {
    const id = c.req.param('id');
    // Banners reference products; clear those links first.
    await query(`UPDATE banners SET product_ids = product_ids - $1::uuid[] WHERE $1 = ANY(product_ids)`, [id]);
    const row = await queryOne(`DELETE FROM products WHERE id = $1 RETURNING id`, [id]);
    if (!row) return fail(c, 404, 'No such product.');
    return ok(c, await publish({ deleted: true }));
  } catch (err) {
    return unexpected(c, err);
  }
});

/* ── Image upload ────────────────────────────────────────────────────── */

adminRoutes.post('/upload', async (c) => {
  // Reject an oversized body from the Content-Length header *before* calling
  // formData(), which would otherwise buffer the whole thing into memory.
  // 8 MB of image plus multipart overhead.
  const MAX_BODY = 9 * 1024 * 1024;
  const declared = Number(c.req.header('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BODY) {
    return fail(c, 413, 'That image is too large. Keep it under 8 MB.');
  }

  const form = await c.req.formData().catch(() => null);
  if (!form) return fail(c, 400, 'Expected a file upload.');

  const file = form.get('file');
  const productId = form.get('productId');

  if (!(file instanceof File)) return fail(c, 400, 'No file in the upload.');
  if (typeof productId !== 'string' || !productId) {
    return fail(c, 400, 'Missing productId.');
  }
  // productId goes into a storage path, so keep it boring.
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(productId)) {
    return fail(c, 400, 'Invalid productId.');
  }

  try {
    return ok(c, await uploadProductImage(file, productId), 201);
  } catch (err) {
    if (err instanceof UploadError) return fail(c, 422, err.message);
    return unexpected(c, err);
  }
});

/* ── Banners ─────────────────────────────────────────────────────────── */

adminRoutes.get('/banners', async (c) => {
  try {
    return ok(c, await toBannerViews(await listBanners()));
  } catch (err) {
    return unexpected(c, err);
  }
});

/**
 * The auto-generator. Returns a **draft** plus the reasoning behind it so
 * the admin can see why these products were chosen. Writes nothing.
 */
adminRoutes.post('/banners/generate', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    category?: string;
    maxProducts?: number;
    forceTemplate?: string;
    noOccasion?: boolean;
  };

  try {
    const [products, existing] = await Promise.all([
      listProducts({ includeHidden: false }),
      listBanners(),
    ]);

    const result = generateBanner(products, {
      ...(body.category ? { category: body.category } : {}),
      ...(body.maxProducts ? { maxProducts: body.maxProducts } : {}),
      ...(body.forceTemplate ? { forceTemplate: body.forceTemplate as Banner['template'] } : {}),
      ...(body.noOccasion ? { noOccasion: true } : {}),
      // So the generated code cannot collide with a campaign already running.
      takenCodes: existing.map((b) => b.code).filter((c): c is string => Boolean(c)),
    });

    if (!result) {
      return fail(
        c,
        422,
        'Nothing to promote — add a few products, or widen the category filter.',
      );
    }
    return ok(c, result, 201);
  } catch (err) {
    return unexpected(c, err);
  }
});

adminRoutes.post('/banners', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = await parse(c, body, bannerInputSchema);
  if (parsed instanceof Response) return parsed;

  try {
    const missing = await missingProductIds(parsed.productIds);
    if (missing.length > 0) {
      return fail(c, 422, 'Some of those products no longer exist.', {
        productIds: `${missing.length} selected product(s) were deleted. Pick again.`,
      });
    }

    const row = await queryOne<{ id: string }>(
      `INSERT INTO banners
         (slug, name, template, status, headline, subhead, cta_label, cta_href,
          percent_off, code, tint, product_ids, starts_at, ends_at, rationale)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id`,
      [
        parsed.slug,
        parsed.name,
        parsed.template,
        parsed.status,
        parsed.headline,
        parsed.subhead,
        parsed.ctaLabel,
        parsed.ctaHref,
        parsed.percentOff,
        parsed.code,
        parsed.tint ? JSON.stringify(parsed.tint) : null,
        parsed.productIds,
        parsed.startsAt,
        parsed.endsAt,
        parsed.rationale,
      ],
    );
    return ok(c, await publish({ id: row!.id }), 201);
  } catch (err) {
    // A duplicate code is a normal admin mistake, not a server fault.
    if (isUniqueViolation(err)) {
      return fail(c, 409, 'That discount code is already in use.', {
        code: 'Another promotion already uses this code',
      });
    }
    return unexpected(c, err);
  }
});

adminRoutes.patch('/banners/:id', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = await parse(c, body, bannerInputSchema.partial());
  if (parsed instanceof Response) return parsed;

  const columns: Record<string, string> = {
    name: 'name',
    slug: 'slug',
    template: 'template',
    status: 'status',
    headline: 'headline',
    subhead: 'subhead',
    ctaLabel: 'cta_label',
    ctaHref: 'cta_href',
    percentOff: 'percent_off',
    code: 'code',
    tint: 'tint',
    productIds: 'product_ids',
    startsAt: 'starts_at',
    endsAt: 'ends_at',
    rationale: 'rationale',
  };

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    const column = columns[key];
    if (!column) continue;
    values.push(key === 'tint' ? (value ? JSON.stringify(value) : null) : value);
    sets.push(`${column} = $${values.length}`);
  }
  if (sets.length === 0) return fail(c, 400, 'Nothing to change.');

  values.push(c.req.param('id'));
  sets.push('revision = revision + 1');

  try {
    if (parsed.productIds) {
      const missing = await missingProductIds(parsed.productIds);
      if (missing.length > 0) {
        return fail(c, 422, 'Some of those products no longer exist.', {
          productIds: `${missing.length} selected product(s) were deleted. Pick again.`,
        });
      }
    }

    const row = await queryOne<BannerRow>(
      `UPDATE banners SET ${sets.join(', ')}, updated_at = now()
        WHERE id = $${values.length} RETURNING *`,
      values,
    );
    if (!row) return fail(c, 404, 'No such banner.');

    if (parsed.status === 'live' && row.status === 'live') {
      // Two live banners on the same product is fine — the best discount
      // wins — but an expired one should not linger as a storefront strip.
      await pruneExpired();
    }
    return ok(c, await publish(toBanner(row)));
  } catch (err) {
    if (isUniqueViolation(err)) {
      return fail(c, 409, 'That discount code is already in use.', {
        code: 'Another promotion already uses this code',
      });
    }
    return unexpected(c, err);
  }
});

adminRoutes.delete('/banners/:id', async (c) => {
  try {
    const row = await queryOne(`DELETE FROM banners WHERE id = $1 RETURNING id`, [
      c.req.param('id'),
    ]);
    if (!row) return fail(c, 404, 'No such banner.');
    return ok(c, await publish({ deleted: true }));
  } catch (err) {
    return unexpected(c, err);
  }
});

/* ── Orders ──────────────────────────────────────────────────────────── */

adminRoutes.get('/orders', async (c) => {
  const parsed = orderFilterSchema.safeParse(c.req.query('status') ?? 'all');
  if (!parsed.success) return fail(c, 400, 'Unknown status filter.');

  try {
    return ok(c, await listCustomOrders(parsed.data));
  } catch (err) {
    return unexpected(c, err);
  }
});

adminRoutes.patch('/orders/:id', async (c) => {
  const id = uuidParamSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 400, 'Invalid enquiry id.');

  const body = (await c.req.json().catch(() => ({}))) as unknown;
  const parsed = await parse(c, body, orderUpdateSchema);
  if (parsed instanceof Response) return parsed;

  if (parsed.status === undefined && parsed.adminNote === undefined) {
    return fail(c, 400, 'Nothing to change.');
  }

  try {
    const row = await queryOne(
      `UPDATE custom_orders
          SET status = COALESCE($1, status),
              admin_note = COALESCE($2, admin_note)
        WHERE id = $3 RETURNING id`,
      [parsed.status ?? null, parsed.adminNote ?? null, id.data],
    );
    if (!row) return fail(c, 404, 'No such enquiry.');
    return ok(c, { updated: true });
  } catch (err) {
    return unexpected(c, err);
  }
});

/* ── Dashboard counters ──────────────────────────────────────────────── */

adminRoutes.get('/stats', async (c) => {
  try {
    const [counts, live] = await Promise.all([
      queryOne<{
        products: number;
        new_orders: number;
        subscribers: number;
        live_banners: number;
      }>(
        `SELECT
           (SELECT count(*) FROM products WHERE hidden = false)::int AS products,
           (SELECT count(*) FROM custom_orders WHERE status = 'new')::int AS new_orders,
           (SELECT count(*) FROM newsletter)::int AS subscribers,
           (SELECT count(*) FROM banners
             WHERE status = 'live'
               AND (ends_at IS NULL OR ends_at > now()))::int AS live_banners`,
      ),
      activeBanners(),
    ]);
    return ok(c, { ...counts, active_banners: live.length });
  } catch (err) {
    return unexpected(c, err);
  }
});

/* ── helpers ─────────────────────────────────────────────────────────── */

/** Returns the ids that do not exist, so callers can report a 422. */
async function missingProductIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await query<{ id: string }>(
    `SELECT id FROM products WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  const found = new Set(rows.map((r) => r.id));
  return ids.filter((id) => !found.has(id));
}

/** Flip finished banners to archived so they stop occupying the rail. */
async function pruneExpired(): Promise<void> {
  await query(
    `UPDATE banners SET status = 'archived'
      WHERE status IN ('live', 'scheduled') AND ends_at IS NOT NULL AND ends_at <= now()`,
  );
}
