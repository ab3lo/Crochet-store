/**
 * Postgres access layer.
 *
 * Deliberately raw SQL through `pg` — the queries here are simple and
 * parameterised, and skipping an ORM keeps the runtime surface small.
 * Better Auth manages its own tables separately (see `migrations/`).
 */

import { Pool, type QueryResultRow } from 'pg';
import {
  type AppliedSale,
  type Banner,
  type BannerTint,
  type BannerView,
  type Category,
  type CustomOrder,
  type ImageCredit,
  type ImageSource,
  type OrderStatus,
  type Product,
  type ParsedProductImage,
  type ProductView,
} from '@crochet/shared';
import { env } from './env.ts';

/* ── Pool ────────────────────────────────────────────────────────────── */

/**
 * TLS is required for Supabase and anything on a real network; it is
 * actively harmful against a local socket, where the server has no cert.
 * Detect loopback explicitly rather than sniffing the hostname, so
 * `127.0.0.1` and `postgres://` (unix socket) both work in development.
 */
const isLocalConnection = (url: string): boolean => {
  if (url.startsWith('postgres://') && url.slice('postgres://'.length).includes('@/')) {
    return true; // unix socket
  }
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
};

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: isLocalConnection(env.DATABASE_URL) ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  // An idle client blew up. Log it; the pool will replace the client.
  console.error('[db] idle client error:', err.message);
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(text, params as never[]);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/* ── Row shapes ──────────────────────────────────────────────────────── */

export interface ProductRow extends QueryResultRow {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  price_cents: number;
  compare_at_cents: number | null;
  category: Category;
  images: string[];
  details: Record<string, string>;
  stock: number;
  made_to_order: boolean;
  hidden: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * One row of `product_images` — see migration 0003. Carries the attribution
 * that a bare URL in `products.images` cannot.
 */
export interface ProductImageRow extends QueryResultRow {
  id: string;
  product_id: string;
  url: string;
  source: ImageSource;
  source_id: string | null;
  credit_name: string | null;
  credit_url: string | null;
  alt: string | null;
  sort_order: number;
}

export interface BannerRow extends QueryResultRow {
  id: string;
  slug: string;
  name: string;
  template: Banner['template'];
  status: Banner['status'];
  headline: string;
  subhead: string;
  cta_label: string;
  cta_href: string;
  percent_off: number;
  code: string | null;
  tint: BannerTint | null;
  product_ids: string[];
  starts_at: Date | null;
  ends_at: Date | null;
  revision: number;
  rationale: string | null;
  created_at: Date;
  updated_at: Date;
}

/* ── Mappers (row → contract) ────────────────────────────────────────── */

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const isoReq = (d: Date): string => d.toISOString();

export function toProduct(r: ProductRow): Product {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    tagline: r.tagline,
    description: r.description,
    priceCents: r.price_cents,
    compareAtCents: r.compare_at_cents,
    category: r.category,
    images: r.images ?? [],
    details: r.details ?? {},
    stock: r.stock,
    madeToOrder: r.made_to_order,
    hidden: r.hidden,
    sortOrder: r.sort_order,
    createdAt: isoReq(r.created_at),
    updatedAt: isoReq(r.updated_at),
    // Overwritten by attachImageCredits. Left undefined here so a product that
    // has never been through the 0003 backfill carries no empty array that
    // every reader would have to null-check around.
  };
}

/**
 * Attach attribution to each product's images, positionally.
 *
 * `product_images` is the source of truth for *where an image came from*;
 * `products.images` remains the ordered list the storefront renders. They are
 * kept in step by `replaceProductImages` on write and by the 0003 backfill, so
 * index N of one lines up with index N of the other.
 *
 * Done as one query for the whole page rather than per product — a category
 * page is a dozen products and this is the difference between one round trip
 * and a dozen.
 */
async function attachImageCredits(products: Product[]): Promise<Product[]> {
  if (products.length === 0) return products;

  const rows = await query<ProductImageRow>(
    `SELECT id, product_id, url, source, source_id, credit_name, credit_url, alt, sort_order
       FROM product_images
      WHERE product_id = ANY($1::uuid[])
      ORDER BY product_id, sort_order, created_at`,
    [products.map((p) => p.id)],
  );

  const byProduct = new Map<string, ProductImageRow[]>();
  for (const row of rows) {
    const list = byProduct.get(row.product_id);
    if (list) list.push(row);
    else byProduct.set(row.product_id, [row]);
  }

  for (const product of products) {
    const images = byProduct.get(product.id);
    if (!images || images.length === 0) continue;

    // Index by URL rather than trusting array order to line up: the two arrays
    // are written together, but a hand-edited products.images row should not
    // be able to attach the wrong photographer's name to a photo.
    const creditByUrl = new Map(
      images.map((i) => [
        i.url,
        {
          source: i.source,
          name: i.credit_name,
          url: i.credit_url,
          sourceId: i.source_id,
        } satisfies ImageCredit,
      ]),
    );

    product.imageCredits = product.images.map((u) => creditByUrl.get(u) ?? null);
  }

  return products;
}

/**
 * Replace a product's images and their attribution in one shot.
 *
 * Both tables are written together on purpose. `products.images` is the
 * ordered list the storefront renders and `product_images` is where the
 * attribution lives; if they were written separately a partial failure would
 * leave a photo on the page with the wrong photographer's name beside it.
 *
 * A site-relative path (the bundled SVG placeholders) is kept in
 * `products.images` but skipped here — it is not an external image and there is
 * nothing to attribute.
 */
export async function replaceProductImages(
  productId: string,
  images: ParsedProductImage[],
): Promise<void> {
  const external = images.filter((i) => /^https?:\/\//i.test(i.url));
  const ordered = [...external].sort((a, b) => a.sortOrder - b.sortOrder);

  await query('DELETE FROM product_images WHERE product_id = $1', [productId]);

  for (const [index, image] of ordered.entries()) {
    await query(
      `INSERT INTO product_images
         (product_id, url, source, source_id, credit_name, credit_url, alt, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (product_id, url) DO UPDATE
         SET source = EXCLUDED.source,
             source_id = EXCLUDED.source_id,
             credit_name = EXCLUDED.credit_name,
             credit_url = EXCLUDED.credit_url,
             alt = EXCLUDED.alt,
             sort_order = EXCLUDED.sort_order`,
      [
        productId,
        image.url,
        image.source,
        image.sourceId ?? null,
        image.creditName ?? null,
        image.creditUrl ?? null,
        image.alt ?? null,
        index,
      ],
    );
  }
}

export function toBanner(r: BannerRow): Banner {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    template: r.template,
    status: r.status,
    headline: r.headline,
    subhead: r.subhead,
    ctaLabel: r.cta_label,
    ctaHref: r.cta_href,
    percentOff: r.percent_off,
    code: r.code,
    tint: r.tint,
    productIds: r.product_ids ?? [],
    startsAt: iso(r.starts_at),
    endsAt: iso(r.ends_at),
    revision: r.revision,
    rationale: r.rationale,
    createdAt: isoReq(r.created_at),
    updatedAt: isoReq(r.updated_at),
  };
}

const PRODUCT_COLUMNS = `
  id, slug, name, tagline, description, price_cents, compare_at_cents,
  category, images, details, stock, made_to_order, hidden, sort_order,
  created_at, updated_at
`;

/* ── Sale resolution ─────────────────────────────────────────────────── */

/**
 * A banner counts as live when its status is `live` and we are inside its
 * optional window. Kept in one place so the storefront, the admin preview
 * and the cart all agree on what "on sale" means.
 */
export function isBannerLive(
  b: Pick<Banner, 'status' | 'startsAt' | 'endsAt'>,
  now = new Date(),
): boolean {
  if (b.status !== 'live' && b.status !== 'scheduled') return false;
  if (b.startsAt && new Date(b.startsAt) > now) return false;
  if (b.endsAt && new Date(b.endsAt) <= now) return false;
  return true;
}

/** Reduce a price by a percentage, clamped at zero. */
const salePrice = (priceCents: number, percentOff: number): number =>
  Math.max(0, Math.round(priceCents * (1 - percentOff / 100)));

/** All banners that are live right now, newest window first. */
export async function activeBanners(now = new Date()): Promise<Banner[]> {
  const rows = await query<BannerRow>(
    `SELECT * FROM banners
      WHERE status IN ('live', 'scheduled')
        AND (starts_at IS NULL OR starts_at <= $1)
        AND (ends_at   IS NULL OR ends_at   >  $1)
      ORDER BY COALESCE(starts_at, created_at) DESC`,
    [now],
  );
  return rows.map(toBanner);
}

/**
 * Reduce a set of live banners to at most one applied sale per product.
 * The most generous discount wins, so a 40%-off flash banner beats a
 * standing 10%-off nudge on the same item.
 */
export function applySalesToProducts(
  products: Product[],
  banners: Banner[],
): ProductView[] {
  // id -> the winning banner for that product
  const winner = new Map<string, Banner>();

  for (const banner of banners) {
    for (const id of banner.productIds) {
      const current = winner.get(id);
      if (!current || banner.percentOff > current.percentOff) winner.set(id, banner);
    }
  }

  return products.map((product) => {
    const banner = winner.get(product.id);
    if (!banner) return { ...product, sale: null };

    const sale: AppliedSale = {
      bannerId: banner.id,
      bannerSlug: banner.slug,
      bannerName: banner.name,
      headline: banner.headline,
      template: banner.template,
      percentOff: banner.percentOff,
      code: banner.code,
      salePriceCents: salePrice(product.priceCents, banner.percentOff),
      endsAt: banner.endsAt,
    };
    return { ...product, sale };
  });
}

/* ── Product queries ─────────────────────────────────────────────────── */

export interface ProductFilter {
  category?: Category;
  /** Include products flagged `hidden`. Admin only. */
  includeHidden?: boolean;
  onSale?: boolean;
  search?: string;
  limit?: number;
}

export async function listProducts(f: ProductFilter = {}): Promise<ProductView[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (!f.includeHidden) where.push('p.hidden = false');
  if (f.category) {
    params.push(f.category);
    where.push(`p.category = $${params.length}`);
  }
  if (f.search) {
    params.push(`%${f.search.toLowerCase()}%`);
    where.push(
      `(lower(p.name) LIKE $${params.length}
        OR lower(p.tagline) LIKE $${params.length}
        OR lower(p.description) LIKE $${params.length})`,
    );
  }

  // `limit` is a trusted number from our own route handler, but clamp it
  // anyway rather than interpolating an arbitrary string.
  const limit = f.limit ? Math.max(1, Math.min(200, Math.trunc(f.limit))) : null;

  const sql = `
    SELECT ${PRODUCT_COLUMNS.split(',').map((c) => `p.${c.trim()}`).join(', ')}
      FROM products p
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY p.sort_order ASC, p.created_at DESC
     ${limit ? `LIMIT ${limit}` : ''}`;

  const products = (await query<ProductRow>(sql, params)).map(toProduct);
  await attachImageCredits(products);
  return applySalesToProducts(products, await activeBanners());
}

/**
 * One product by slug, for the public storefront.
 *
 * `hidden = false` is not optional here. `listProducts` has always filtered
 * unlisted products out, and without the same predicate on this path a hidden
 * product was still readable by guessing its slug — which defeats the point of
 * hiding it, since slugs are visible in the admin and in old links.
 *
 * Callers that legitimately need a hidden product (the admin panel) should
 * query by id through the admin route rather than widening this.
 */
export async function getProductBySlug(
  slug: string,
): Promise<ProductView | null> {
  const row = await queryOne<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS} FROM products p
      WHERE p.slug = $1 AND p.hidden = false
      LIMIT 1`,
    [slug],
  );
  if (!row) return null;
  const [view] = applySalesToProducts(
    await attachImageCredits([toProduct(row)]),
    await activeBanners(),
  );
  return view ?? null;
}

/* ── Banner queries ──────────────────────────────────────────────────── */

/** Hydrate banners with the product rows they point at, in order. */
export async function toBannerViews(banners: Banner[]): Promise<BannerView[]> {
  if (banners.length === 0) return [];
  const now = new Date();

  const ids = [...new Set(banners.flatMap((b) => b.productIds))];
  if (ids.length === 0) {
    return banners.map((b) => ({
      ...b,
      products: [],
      isLive: isBannerLive(b, now),
      salePriceCents: b.percentOff > 0 ? salePrice(0, b.percentOff) : null,
    }));
  }

  const rows = await query<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  const byId = new Map(rows.map((r) => [r.id, toProduct(r)]));

  return banners.map((b) => ({
    ...b,
    products: b.productIds
      .map((id) => byId.get(id))
      .filter((p): p is Product => Boolean(p))
      .map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        priceCents: p.priceCents,
        compareAtCents: p.compareAtCents,
        images: p.images,
      })),
    isLive: isBannerLive(b, now),
    salePriceCents: b.percentOff > 0 ? salePrice(0, b.percentOff) : null,
  }));
}

export async function listBanners(): Promise<Banner[]> {
  const rows = await query<BannerRow>(
    `SELECT * FROM banners ORDER BY created_at DESC`,
  );
  return rows.map(toBanner);
}

/* ── Enquiries ───────────────────────────────────────────────────────── */

interface OrderRow extends QueryResultRow {
  id: string;
  name: string;
  email: string;
  contact: string | null;
  category: Category;
  quantity: number;
  brief: string;
  budget_cents: number | null;
  needed_by: string | null;
  status: OrderStatus;
  admin_note: string | null;
  created_at: Date;
}

/** snake_case row → the `CustomOrder` contract. The only place it happens. */
export function toCustomOrder(r: OrderRow): CustomOrder {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    contact: r.contact,
    category: r.category,
    quantity: r.quantity,
    brief: r.brief,
    budgetCents: r.budget_cents,
    neededBy: r.needed_by,
    status: r.status,
    adminNote: r.admin_note,
    createdAt: r.created_at.toISOString(),
  };
}

export async function listCustomOrders(
  status: OrderStatus | 'all',
): Promise<CustomOrder[]> {
  const rows =
    status === 'all'
      ? await query<OrderRow>(`SELECT * FROM custom_orders ORDER BY created_at DESC`)
      : await query<OrderRow>(
          `SELECT * FROM custom_orders WHERE status = $1 ORDER BY created_at DESC`,
          [status],
        );
  return rows.map(toCustomOrder);
}
