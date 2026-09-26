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
  type OrderStatus,
  type Product,
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
  };
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
  return applySalesToProducts(products, await activeBanners());
}

export async function getProductBySlug(
  slug: string,
): Promise<ProductView | null> {
  const row = await queryOne<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS} FROM products p WHERE p.slug = $1 LIMIT 1`,
    [slug],
  );
  if (!row) return null;
  const [view] = applySalesToProducts([toProduct(row)], await activeBanners());
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
