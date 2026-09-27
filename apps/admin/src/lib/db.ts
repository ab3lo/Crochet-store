/**
 * SQLite access layer — the shop's only datastore.
 *
 * Twelve rows today, a few hundred at most. Written by one person on one
 * machine, read by `astro build` from a committed JSON file. None of that needs
 * a server, a pool, a service-role key or a monthly bill.
 *
 * This is the port of `apps/api/src/db.ts`, deleted with the API. Same columns,
 * same contracts, same mappers — so `catalog.json` still exports the same
 * `ProductView` / `BannerView` objects and the storefront cannot tell.
 *
 * ## Why `node:sqlite` and not `bun:sqlite`
 *
 * Vite loads SSR modules through Node's ESM resolver, which does not
 * understand the `bun:` scheme and fails with `ERR_UNSUPPORTED_ESM_URL_SCHEME`
 * before this code runs. Running the dev server under Bun does not help — the
 * failure is in Vite's loader, not the shell. `node:sqlite` is stable in Node
 * 24, needs no `node-gyp`, and behaves identically under Bun, so the panel runs
 * under whichever is on the PATH. For the file that holds the shop's data,
 * "works under both" beats "requires Bun".
 *
 * It is not quite the `bun:sqlite` API, so the adapter below supplies the three
 * things used here: `db.query(sql)` with `.all`/`.get`/`.run`, `db.exec`, and
 * `db.transaction`. Statements are cached — the panel re-runs the same queries
 * on every keystroke, and re-preparing is waste.
 *
 * ## Four Postgres features with no SQLite equivalent
 *
 * 1. **Arrays.** `images` and `product_ids` are `TEXT` holding a JSON array.
 *    Reads go through `parseJsonArray` and writes through the stringify helper;
 *    both fail loudly rather than defaulting, because a corrupt array silently
 *    becoming `[]` would empty a gallery with no error anywhere.
 * 2. **jsonb.** `details` and `tint` are `TEXT` holding JSON, same reason.
 * 3. **Timestamps.** `TEXT` in ISO-8601 UTC, which the mappers already
 *    produced. Comparison semantics matter: ISO-8601 with a `Z` sorts
 *    lexicographically in the same order it sorts chronologically, which is
 *    what `activeBanners` relies on. True only while every row is written
 *    through `nowIso()` — a hand-inserted local time would break it.
 * 4. **Regex CHECKs.** Postgres could enforce `url ~ '^https?://'` in the
 *    schema. SQLite has no regex in CHECK, so these moved to Zod, which reports
 *    *which* field failed — stricter than before.
 *
 * Also gone deliberately: `pg_trgm` (a trigram index to search twelve rows) and
 * the partial index on `hidden = false`; and the `touch_updated_at()` trigger,
 * which becomes an assignment in the write path.
 *
 * ## Concurrency
 *
 * One process, one writer, WAL mode. A single-user tool on a single machine has
 * no second writer to lose an update to.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AppliedSale,
  Banner,
  BannerTint,
  BannerView,
  Category,
  ImageCredit,
  ParsedProductImage,
  Product,
  ProductView,
} from '@crochet/shared';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The database file, outside the app directory on purpose.
 *
 * It is gitignored (`*.sqlite`) and it is a working file, not source. Keeping
 * it at the workspace root also means the path is stable no matter which entry
 * point opens it, so the dev server and the CLI scripts cannot disagree about
 * which file they are talking to.
 */
export const DB_PATH =
  process.env.CROCHET_DB ?? join(here, '..', '..', '..', '..', 'data', 'catalog.sqlite');

mkdirSync(dirname(DB_PATH), { recursive: true });

const sqlite = new DatabaseSync(DB_PATH);

/* ── Adapter ──────────────────────────────────────────────────────────────
   The `bun:sqlite`-shaped surface the rest of this file is written against. */

type Param = string | number | bigint | null | Uint8Array;

const statements = new Map<string, ReturnType<DatabaseSync['prepare']>>();

/** `node:sqlite` rejects `undefined` as a bound value; `null` means the same. */
const normalise = (params: unknown[]): Param[] =>
  params.map((p) => (p === undefined ? null : (p as Param)));

function prepare(sql: string) {
  let statement = statements.get(sql);
  if (!statement) {
    statement = sqlite.prepare(sql);
    statements.set(sql, statement);
  }
  return statement;
}

let inTransaction = false;

export const db = {
  exec: (sql: string): void => sqlite.exec(sql),

  query: (sql: string) => ({
    all: <T,>(...params: unknown[]): T[] =>
      prepare(sql).all(...normalise(params)) as T[],
    get: <T,>(...params: unknown[]): T | undefined =>
      prepare(sql).get(...normalise(params)) as T | undefined,
    run: (...params: unknown[]): { changes: number } => {
      const r = prepare(sql).run(...normalise(params));
      return { changes: Number(r.changes) };
    },
  }),

  /**
   * Run `fn` in a transaction, rolling back on any throw.
   *
   * `node:sqlite` has no `transaction()` helper, so this is the explicit form.
   * The nesting guard matters: `deleteProduct` rewrites banner rows, and a
   * nested `BEGIN` inside an open transaction is an error in SQLite.
   */
  transaction: <T,>(fn: () => T): T => {
    if (inTransaction) return fn();

    sqlite.exec('BEGIN');
    inTransaction = true;
    try {
      const result = fn();
      sqlite.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        sqlite.exec('ROLLBACK');
      } catch {
        // SQLite already aborted it; the original error is the one to surface.
      }
      throw err;
    } finally {
      inTransaction = false;
    }
  },
};

/**
 * WAL, so a read (the export) never blocks behind the panel's writes, and
 * `foreign_keys` on, which SQLite leaves **off by default** — a genuine trap,
 * because without it `product_images` rows survive their product and the
 * gallery renders a broken thumbnail.
 */
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

/* ── Schema ───────────────────────────────────────────────────────────────
   Created on boot rather than by a migration runner. There is one file, one
   process and one owner; a `schema_version` row covers the only case a
   migration system would have handled — adding a column later.            */

const SCHEMA_VERSION = 1;

db.exec(`
  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id               TEXT    PRIMARY KEY,
    slug             TEXT    NOT NULL UNIQUE,
    name             TEXT    NOT NULL,
    tagline          TEXT    NOT NULL DEFAULT '',
    description      TEXT    NOT NULL DEFAULT '',
    price_cents      INTEGER NOT NULL CHECK (price_cents >= 0),
    compare_at_cents INTEGER CHECK (compare_at_cents IS NULL OR compare_at_cents >= 0),
    category         TEXT    NOT NULL
                     CHECK (category IN ('keychains','bags','purses','bouquets','custom')),

    -- JSON array of URLs. See the note at the top of this file.
    images           TEXT    NOT NULL DEFAULT '[]',

    -- JSON object. Same.
    details          TEXT    NOT NULL DEFAULT '{}',

    stock            INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    made_to_order    INTEGER NOT NULL DEFAULT 0 CHECK (made_to_order IN (0,1)),
    hidden           INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0,1)),
    sort_order       INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT    NOT NULL,
    updated_at       TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS products_category_sort_idx
    ON products (category, sort_order, created_at DESC);

  CREATE TABLE IF NOT EXISTS product_images (
    id          TEXT    PRIMARY KEY,
    product_id  TEXT    NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    url         TEXT    NOT NULL,
    source      TEXT    NOT NULL DEFAULT 'self-hosted'
                CHECK (source IN ('stock','self-hosted','external','legacy')),
    source_id   TEXT,
    credit_name TEXT,
    credit_url  TEXT,
    alt         TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL,
    CONSTRAINT product_images_url_per_product UNIQUE (product_id, url)
  );

  CREATE INDEX IF NOT EXISTS product_images_product_sort_idx
    ON product_images (product_id, sort_order);

  CREATE TABLE IF NOT EXISTS banners (
    id          TEXT    PRIMARY KEY,
    slug        TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL,
    template    TEXT    NOT NULL
                CHECK (template IN ('bloom','marquee','ribbon','stitch-strip','editorial')),
    status      TEXT    NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','scheduled','live','archived')),
    headline    TEXT    NOT NULL,
    subhead     TEXT    NOT NULL DEFAULT '',
    cta_label   TEXT    NOT NULL DEFAULT 'Shop the drop',
    cta_href    TEXT    NOT NULL DEFAULT '/',
    percent_off INTEGER NOT NULL DEFAULT 0 CHECK (percent_off BETWEEN 0 AND 90),
    code        TEXT,
    tint        TEXT,
    product_ids TEXT    NOT NULL DEFAULT '[]',
    starts_at   TEXT,
    ends_at     TEXT,
    revision    INTEGER NOT NULL DEFAULT 0,
    rationale   TEXT,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS banners_live_idx
    ON banners (status, starts_at DESC);

  CREATE UNIQUE INDEX IF NOT EXISTS banners_code_unique_idx
    ON banners (lower(code)) WHERE code IS NOT NULL;
`);

const metaVersion = db
  .query(`SELECT value FROM meta WHERE key = ?`)
  .get<{ value: string }>('schema_version');

if (!metaVersion) {
  db.query(`INSERT INTO meta (key, value) VALUES ('schema_version', ?)`).run(
    String(SCHEMA_VERSION),
  );
} else if (Number(metaVersion.value) > SCHEMA_VERSION) {
  // The file was written by a newer build. Refusing to open it is the only
  // safe move: an older build would happily write rows the newer one cannot
  // read, and the damage would not show up until a build.
  throw new Error(
    `catalog.sqlite is schema v${metaVersion.value}, this build understands v${SCHEMA_VERSION}. ` +
      `Update the admin app, or delete data/catalog.sqlite and re-seed.`,
  );
}

/* ── The publish record ────────────────────────────────────────────────────
   A row in `meta`, written by `publish()` and read by the dashboard. It exists
   because "has the site seen this catalogue?" cannot be answered by looking at
   `catalog.json`.

   It used to be answered by that file's own `generatedAt`, which is wrong in a
   way that stays invisible until it matters. `generatedAt` says when the *file*
   was written, and the file is written by two different things: a publish, and
   `bun run export`. So running the export script — a documented command, and
   the obvious way to see what would ship — stamped the file with "now", the
   dashboard read that as "published just now", and the panel reported **the
   shop is in sync** with a catalogue the shop had never seen.

   Worse, the same export left `catalog.json` already matching the database, so
   the next publish found nothing to write, answered "nothing to publish", and
   the change could not be shipped at all without a hand-written commit.

   A publish is the only thing that makes the site change, so it is the only
   thing that gets a say here. State derived from the file cannot tell "someone
   looked" from "someone shipped". */

const PUBLISHED_KEY = 'published_at';

function readMeta(key: string): string | null {
  const row = db.query(`SELECT value FROM meta WHERE key = ?`).get<{ value: string }>(key);
  return row?.value ?? null;
}

function writeMeta(key: string, value: string): void {
  db.query(
    `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

/**
 * When the catalogue last reached the live site, or null if it never has.
 *
 * Null is a real state rather than a missing value: a fresh database has
 * products and no publish behind them, and the dashboard has to be able to say
 * exactly that.
 */
export function lastPublishedAt(): string | null {
  return readMeta(PUBLISHED_KEY);
}

/**
 * Record a successful publish.
 *
 * Called *after* the push rather than before, so a crash or a failed push leaves
 * the panel under-reporting instead of over-reporting. Being told "not published"
 * when it might be sends the owner to press the button again, which is harmless.
 * Being told "published" when it is not is the exact lie this row exists to
 * prevent.
 */
export function markPublished(at: string = nowIso()): void {
  writeMeta(PUBLISHED_KEY, at);
}

/* ── JSON column helpers ──────────────────────────────────────────────────
   Fail loudly. A corrupt array silently becoming `[]` would empty a product's
   gallery with no error anywhere, which is the kind of bug that is only
   noticed by a customer.                                                       */

function parseJsonArray(raw: string, column: string, rowId: string): string[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(
      `[db] ${column} on ${rowId} is not valid JSON. Repair it by hand — ` +
        `this is not something to guess at.`,
    );
  }
  if (!Array.isArray(value)) {
    throw new Error(`[db] ${column} on ${rowId} is not an array.`);
  }
  return value as string[];
}

function parseJsonObject<T>(raw: string | null, column: string, rowId: string): T {
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`[db] ${column} on ${rowId} is not valid JSON.`);
  }
}

const stringify = (v: unknown): string => JSON.stringify(v ?? null);

/** A v4 UUID, generated here because SQLite has no `gen_random_uuid()`. */
export function uuid(): string {
  return crypto.randomUUID();
}

export const nowIso = (): string => new Date().toISOString();

/* ── Row shapes ─────────────────────────────────────────────────────────── */

/** SQLite has no boolean type; 0/1 arrives as a number and must be coerced. */
interface ProductRow {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  price_cents: number;
  compare_at_cents: number | null;
  category: Category;
  images: string;
  details: string;
  stock: number;
  made_to_order: number;
  hidden: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface ProductImageRow {
  id: string;
  product_id: string;
  url: string;
  source: ImageCredit['source'];
  source_id: string | null;
  credit_name: string | null;
  credit_url: string | null;
  alt: string | null;
  sort_order: number;
}

interface BannerRow {
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
  tint: string | null;
  product_ids: string;
  starts_at: string | null;
  ends_at: string | null;
  revision: number;
  rationale: string | null;
  created_at: string;
  updated_at: string;
}

const PRODUCT_COLUMNS = `
  id, slug, name, tagline, description, price_cents, compare_at_cents,
  category, images, details, stock, made_to_order, hidden, sort_order,
  created_at, updated_at
`;

/* ── Mappers (row → contract) ───────────────────────────────────────────── */

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
    images: parseJsonArray(r.images, 'images', r.id),
    details: parseJsonObject<Record<string, string>>(r.details, 'details', r.id),
    stock: r.stock,
    madeToOrder: r.made_to_order === 1,
    hidden: r.hidden === 1,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    // Overwritten by attachImageCredits — see the note there.
  };
}

/**
 * Attach attribution to each product's images, positionally.
 *
 * `product_images` is the source of truth for *where an image came from*;
 * `products.images` remains the ordered list the storefront renders. They are
 * written together by `replaceProductImages`, so index N of one lines up with
 * index N of the other.
 *
 * Indexed by URL rather than trusting array order to line up: the two are
 * written together, but a hand-edited `products.images` row must not be able
 * to attach the wrong photographer's name to a photo. This logic is unchanged
 * from the Postgres version and is the part most worth keeping verbatim.
 */
function attachImageCredits(products: Product[]): Product[] {
  if (products.length === 0) return products;

  const placeholders = products.map(() => '?').join(', ');
  const rows = db
    .query(
      `SELECT id, product_id, url, source, source_id, credit_name, credit_url, alt, sort_order
         FROM product_images
        WHERE product_id IN (${placeholders})
        ORDER BY product_id, sort_order, created_at`,
    )
    .all<ProductImageRow>(...products.map((p) => p.id));

  const byProduct = new Map<string, ProductImageRow[]>();
  for (const row of rows) {
    const list = byProduct.get(row.product_id);
    if (list) list.push(row);
    else byProduct.set(row.product_id, [row]);
  }

  for (const product of products) {
    const images = byProduct.get(product.id);
    if (!images || images.length === 0) continue;

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
    tint: r.tint ? parseJsonObject<BannerTint>(r.tint, 'tint', r.id) : null,
    productIds: parseJsonArray(r.product_ids, 'product_ids', r.id),
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    revision: r.revision,
    rationale: r.rationale,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/* ── Sale resolution ───────────────────────────────────────────────────────
   Unchanged from the Postgres version. The storefront, the admin preview and
   the cart all have to agree on what "on sale" means, so it lives in exactly
   one place.                                                             */

/**
 * A banner counts as live when its status is `live` or `scheduled` and we are
 * inside its optional window.
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
export function activeBanners(now = new Date()): Banner[] {
  const at = now.toISOString();
  const rows = db
    .query(
      `SELECT * FROM banners
        WHERE status IN ('live', 'scheduled')
          AND (starts_at IS NULL OR starts_at <= ?)
          AND (ends_at   IS NULL OR ends_at   >  ?)
        ORDER BY COALESCE(starts_at, created_at) DESC`,
    )
    .all<BannerRow>(at, at);
  return rows.map(toBanner);
}

/**
 * Reduce a set of live banners to at most one applied sale per product. The
 * most generous discount wins, so a 40%-off flash banner beats a standing
 * 10%-off nudge on the same item.
 */
export function applySalesToProducts(
  products: Product[],
  banners: Banner[],
): ProductView[] {
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

/* ── Product queries ───────────────────────────────────────────────────── */

export interface ProductFilter {
  category?: Category;
  /** Include products flagged `hidden`. Admin only. */
  includeHidden?: boolean;
  search?: string;
}

export function listProducts(f: ProductFilter = {}): ProductView[] {
  const where: string[] = [];
  const params: unknown[] = [];

  if (!f.includeHidden) where.push('p.hidden = 0');
  if (f.category) {
    params.push(f.category);
    where.push(`p.category = ?`);
  }
  if (f.search) {
    // SQLite binds positionally and has no numbered parameters, so a
    // placeholder repeated three times needs the value bound three times.
    // Getting this wrong binds only the first `?` and leaves the other two
    // as literal NULLs, which matches nothing — so the search silently
    // returns zero rows rather than erroring. Hence the explicit triple.
    const needle = `%${f.search.toLowerCase()}%`;
    params.push(needle, needle, needle);
    where.push(
      `(lower(p.name) LIKE ?
        OR lower(p.tagline) LIKE ?
        OR lower(p.description) LIKE ?)`,
    );
  }

  const sql = `
    SELECT ${PRODUCT_COLUMNS.split(',').map((c) => `p.${c.trim()}`).join(', ')}
      FROM products p
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY p.sort_order ASC, p.created_at DESC`;

  const rows = db.query(sql).all<ProductRow>(...params);
  const products = attachImageCredits(rows.map(toProduct));
  return applySalesToProducts(products, activeBanners());
}

/** One product by id. The admin path — no `hidden` filter, by design. */
export function getProductById(id: string): ProductView | null {
  const row = db
    .query(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = ?`)
    .get<ProductRow>(id);
  if (!row) return null;
  const [view] = applySalesToProducts(attachImageCredits([toProduct(row)]), activeBanners());
  return view ?? null;
}

export function getProductBySlug(slug: string): ProductView | null {
  // `hidden = 0` is not optional: without it a hidden product stays readable
  // by guessing its slug, which defeats the point of hiding it.
  const row = db
    .query(
      `SELECT ${PRODUCT_COLUMNS} FROM products WHERE slug = ? AND hidden = 0 LIMIT 1`,
    )
    .get<ProductRow>(slug);
  if (!row) return null;
  const [view] = applySalesToProducts(attachImageCredits([toProduct(row)]), activeBanners());
  return view ?? null;
}

/* ── Banner queries ────────────────────────────────────────────────────── */

/** Hydrate banners with the product rows they point at, in order. */
export function toBannerViews(banners: Banner[]): BannerView[] {
  if (banners.length === 0) return [];
  const now = new Date();

  const ids = [...new Set(banners.flatMap((b) => b.productIds))];

  // The `id = ANY($1::uuid[])` of the Postgres version becomes an `IN` list.
  // `product_ids` is a JSON array, so this cannot be a join — and that is fine,
  // because the list is short and this is a single-user tool.
  const byId = new Map<string, Product>();
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(', ');
    const rows = db
      .query(
        `SELECT ${PRODUCT_COLUMNS} FROM products WHERE id IN (${placeholders})`,
      )
      .all<ProductRow>(...ids);
    for (const r of rows) byId.set(r.id, toProduct(r));
  }

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
    // Preserved exactly from the Postgres version, including the fact that
    // this is `salePrice(0, …)` and therefore always 0. It is not read by any
    // renderer; "fixing" it here would be a silent behaviour change.
    salePriceCents: b.percentOff > 0 ? salePrice(0, b.percentOff) : null,
  }));
}

export function listBanners(): Banner[] {
  return db
    .query(`SELECT * FROM banners ORDER BY created_at DESC`)
    .all<BannerRow>()
    .map(toBanner);
}

/* ── Writes ───────────────────────────────────────────────────────────────
   Every catalogue mutation goes through a transaction. Not for concurrency —
   there is none — but so that `replaceProductImages` cannot half-apply and
   leave a photo on the page with the wrong photographer's name beside it.  */

export type Write = () => void;

/** Run `fn` in a transaction, rolling back on any throw. */
export function transact<T>(fn: () => T): T {
  return db.transaction(fn);
}

export interface NewProduct {
  /** Omit to generate one. The seed passes a stable id so its data stays recognisable. */
  id?: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  priceCents: number;
  compareAtCents: number | null;
  category: Category;
  images: string[];
  details: Record<string, string>;
  stock: number;
  madeToOrder: boolean;
  hidden: boolean;
  sortOrder: number;
  /**
   * Backdate a product. The promotion generator scores partly on how long a
   * piece has been listed, so a seed that creates everything "now" gives it
   * no signal to work with.
   */
  createdAt?: string;
}

export function createProduct(p: NewProduct): string {
  const id = p.id ?? uuid();
  const at = p.createdAt ?? nowIso();
  db.query(
    `INSERT INTO products
       (id, slug, name, tagline, description, price_cents, compare_at_cents,
        category, images, details, stock, made_to_order, hidden, sort_order,
        created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    p.slug,
    p.name,
    p.tagline,
    p.description,
    p.priceCents,
    p.compareAtCents,
    p.category,
    stringify(p.images),
    stringify(p.details ?? {}),
    p.stock,
    p.madeToOrder ? 1 : 0,
    p.hidden ? 1 : 0,
    p.sortOrder,
    at,
    at,
  );
  return id;
}

/** Columns a partial update may touch, and their contract-side names. */
const PRODUCT_SETTABLE: Record<string, string> = {
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

export function updateProduct(
  id: string,
  patch: Partial<Record<keyof typeof PRODUCT_SETTABLE, unknown>>,
): boolean {
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(patch)) {
    const column = PRODUCT_SETTABLE[key];
    if (!column || value === undefined) continue;

    if (key === 'images') values.push(stringify(value));
    else if (key === 'details') values.push(stringify(value ?? {}));
    else if (key === 'madeToOrder' || key === 'hidden') values.push(value ? 1 : 0);
    else values.push(value);

    sets.push(`${column} = ?`);
  }

  if (sets.length === 0) return false;

  // `updated_at` is set here rather than by a trigger, which is how the
  // Postgres `touch_updated_at()` trigger is reproduced.
  sets.push('updated_at = ?');
  values.push(nowIso(), id);

  const res = db.query(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return res.changes > 0;
}

export function deleteProduct(id: string): boolean {
  return transact(() => {
    // Banners reference products in a JSON array, which no foreign key can
    // reach. Postgres did this with `product_ids - $1::uuid[]`; here it is
    // read, filtered and written back.
    for (const row of db
      .query(`SELECT id, product_ids FROM banners`)
      .all<{ id: string; product_ids: string }>()) {
      const ids = parseJsonArray(row.product_ids, 'product_ids', row.id);
      if (!ids.includes(id)) continue;
      db.query(`UPDATE banners SET product_ids = ?, updated_at = ? WHERE id = ?`).run(
        stringify(ids.filter((p) => p !== id)),
        nowIso(),
        row.id,
      );
    }

    // `product_images` has ON DELETE CASCADE and foreign_keys is ON, so the
    // attribution rows go with it.
    return db.query(`DELETE FROM products WHERE id = ?`).run(id).changes > 0;
  });
}

/**
 * Replace a product's images and their attribution in one shot.
 *
 * Both tables are written together on purpose — see `attachImageCredits`. A
 * site-relative path (the bundled SVG placeholders) is kept in
 * `products.images` but skipped here: it is not an external image and there
 * is nothing to attribute.
 */
export function replaceProductImages(
  productId: string,
  images: ParsedProductImage[],
): void {
  const external = images.filter((i) => /^https?:\/\//i.test(i.url));
  const ordered = [...external].sort((a, b) => a.sortOrder - b.sortOrder);

  db.query(`DELETE FROM product_images WHERE product_id = ?`).run(productId);

  const insert = db.query(
    `INSERT INTO product_images
       (id, product_id, url, source, source_id, credit_name, credit_url, alt,
        sort_order, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  );

  const at = nowIso();
  ordered.forEach((image, index) => {
    insert.run(
      uuid(),
      productId,
      image.url,
      image.source,
      image.sourceId ?? null,
      image.creditName ?? null,
      image.creditUrl ?? null,
      image.alt ?? null,
      index,
      at,
      at,
    );
  });
}

export interface NewBanner {
  /** Omit to generate one. */
  id?: string;
  slug: string;
  name: string;
  template: Banner['template'];
  status: Banner['status'];
  headline: string;
  subhead: string;
  ctaLabel: string;
  ctaHref: string;
  percentOff: number;
  code: string | null;
  tint: BannerTint | null;
  productIds: string[];
  startsAt: string | null;
  endsAt: string | null;
  rationale: string | null;
}

export function createBanner(b: NewBanner): string {
  const id = b.id ?? uuid();
  const at = nowIso();
  db.query(
    `INSERT INTO banners
       (id, slug, name, template, status, headline, subhead, cta_label, cta_href,
        percent_off, code, tint, product_ids, starts_at, ends_at, revision,
        rationale, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    b.slug,
    b.name,
    b.template,
    b.status,
    b.headline,
    b.subhead,
    b.ctaLabel,
    b.ctaHref,
    b.percentOff,
    b.code,
    b.tint ? stringify(b.tint) : null,
    stringify(b.productIds),
    b.startsAt,
    b.endsAt,
    0,
    b.rationale,
    at,
    at,
  );
  return id;
}

const BANNER_SETTABLE: Record<string, string> = {
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

export function updateBanner(
  id: string,
  patch: Partial<Record<keyof typeof BANNER_SETTABLE, unknown>>,
): Banner | null {
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(patch)) {
    const column = BANNER_SETTABLE[key];
    if (!column || value === undefined) continue;

    if (key === 'tint') values.push(value ? stringify(value) : null);
    else if (key === 'productIds') values.push(stringify(value));
    else values.push(value);

    sets.push(`${column} = ?`);
  }

  if (sets.length === 0) return null;

  // Every banner edit bumps `revision`, so the storefront rebuild that follows
  // is traceable to a specific change.
  sets.push('revision = revision + 1', 'updated_at = ?');
  values.push(nowIso(), id);

  const res = db
    .query(`UPDATE banners SET ${sets.join(', ')} WHERE id = ?`)
    .run(...values);
  if (res.changes === 0) return null;

  const row = db.query(`SELECT * FROM banners WHERE id = ?`).get<BannerRow>(id);
  return row ? toBanner(row) : null;
}

export function deleteBanner(id: string): boolean {
  return db.query(`DELETE FROM banners WHERE id = ?`).run(id).changes > 0;
}

/**
 * Flip finished banners to archived so they stop occupying the rail.
 *
 * The Postgres version ran this after every live-banner save. It still does,
 * but it is worth being explicit that it mutates rows the owner did not just
 * touch — so it runs inside the same transaction as the edit, and a failure
 * rolls the whole thing back rather than archiving on its own.
 */
export function pruneExpired(): void {
  db.query(
    `UPDATE banners SET status = 'archived'
      WHERE status IN ('live', 'scheduled')
        AND ends_at IS NOT NULL
        AND ends_at <= ?`,
  ).run(nowIso());
}

/* ── Dashboard counters ────────────────────────────────────────────────── */

export interface Stats {
  products: number;
  live_banners: number;
  hidden_products: number;
  /** When the committed snapshot was last regenerated, or null. */
  publishedAt: string | null;
  /** Newest `updated_at` across the catalogue, or null when empty. */
  lastEditedAt: string | null;
}

export function stats(publishedAt: string | null): Stats {
  const count = (sql: string): number => {
    const row = db.query(sql).get<{ n: number }>();
    return row ? Number(row.n) : 0;
  };

  const newest = db
    .query(
      `SELECT MAX(updated_at) AS t FROM (
         SELECT updated_at FROM products
         UNION ALL SELECT updated_at FROM banners
       )`,
    )
    .get<{ t: string | null }>();

  return {
    products: count(`SELECT count(*) AS n FROM products WHERE hidden = 0`),
    hidden_products: count(`SELECT count(*) AS n FROM products WHERE hidden = 1`),
    live_banners: activeBanners().length,
    publishedAt,
    lastEditedAt: newest?.t ?? null,
  };
}

/* ── Maintenance ───────────────────────────────────────────────────────── */

/** Rows per table, for the panel's status footer. */
export function tableCounts(): Record<string, number> {
  const count = (t: string): number => {
    const row = db.query(`SELECT count(*) AS n FROM ${t}`).get<{ n: number }>();
    return row ? Number(row.n) : 0;
  };
  return { products: count('products'), product_images: count('product_images'), banners: count('banners') };
}
