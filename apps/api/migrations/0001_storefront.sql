-- Crochet & Co. — storefront tables.
--
-- Better Auth creates its own tables ("user", "session", "account",
-- "verification") via `bun run auth:migrate`. Run this file first.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Catalogue ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text        NOT NULL UNIQUE,
  name             text        NOT NULL,
  tagline          text        NOT NULL DEFAULT '',
  description      text        NOT NULL DEFAULT '',
  price_cents      integer     NOT NULL CHECK (price_cents >= 0),
  compare_at_cents integer     CHECK (compare_at_cents IS NULL OR compare_at_cents >= 0),
  category         text        NOT NULL CHECK (
                     category IN ('keychains', 'bags', 'purses', 'bouquets', 'custom')
                   ),
  images           text[]      NOT NULL DEFAULT '{}',
  details          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  stock            integer     NOT NULL DEFAULT 0 CHECK (stock >= 0),
  made_to_order    boolean     NOT NULL DEFAULT false,
  hidden           boolean     NOT NULL DEFAULT false,
  sort_order       integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- The storefront filters by category and sorts deliberately; give it an index.
CREATE INDEX IF NOT EXISTS products_category_sort_idx
  ON products (category, sort_order, created_at DESC)
  WHERE hidden = false;

-- Free-text search over the copy. Trigram, so partial words still hit.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS products_search_idx
  ON products USING gin ((lower(name || ' ' || tagline || ' ' || description)) gin_trgm_ops);

-- Keep updated_at honest without relying on every writer to remember.
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_touch ON products;
CREATE TRIGGER products_touch BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── Banners ────────────────────────────────────────────────────────────
--
-- The product link is an ordered array of ids rather than a join table:
-- the order the admin picked them in is meaningful (it drives the
-- editorial banner's product rail), and an array keeps a single row to
-- read. At a few hundred ids per campaign that is comfortably cheaper
-- than a join.

CREATE TABLE IF NOT EXISTS banners (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text        NOT NULL UNIQUE,
  name         text        NOT NULL,
  template     text        NOT NULL CHECK (
                 template IN ('bloom', 'marquee', 'ribbon', 'stitch-strip', 'editorial')
               ),
  status       text        NOT NULL DEFAULT 'draft' CHECK (
                 status IN ('draft', 'scheduled', 'live', 'archived')
               ),
  headline     text        NOT NULL,
  subhead      text        NOT NULL DEFAULT '',
  cta_label    text        NOT NULL DEFAULT 'Shop the drop',
  cta_href     text        NOT NULL DEFAULT '/',
  percent_off  integer     NOT NULL DEFAULT 0 CHECK (percent_off BETWEEN 0 AND 90),
  code         text        CHECK (code IS NULL OR code ~ '^[A-Z0-9-]{3,24}$'),
  tint         jsonb       CHECK (tint IS NULL OR jsonb_typeof(tint) = 'object'),
  product_ids  uuid[]      NOT NULL DEFAULT '{}',
  starts_at    timestamptz,
  ends_at      timestamptz,
  revision     integer     NOT NULL DEFAULT 0,
  rationale    text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS banners_touch ON banners;
CREATE TRIGGER banners_touch BEFORE UPDATE ON banners
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Supports "which banners are live right now, newest first".
CREATE INDEX IF NOT EXISTS banners_live_idx
  ON banners (status, starts_at DESC)
  WHERE status IN ('live', 'scheduled');

-- A code must be unique across live banners, or checkout is ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS banners_code_unique_idx
  ON banners (lower(code)) WHERE code IS NOT NULL;

-- ── Custom orders ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS custom_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  email         text        NOT NULL,
  contact       text,
  category      text        NOT NULL,
  quantity      integer     NOT NULL DEFAULT 1 CHECK (quantity > 0),
  brief         text        NOT NULL,
  budget_cents integer     CHECK (budget_cents IS NULL OR budget_cents >= 0),
  needed_by     text,
  status        text        NOT NULL DEFAULT 'new' CHECK (
                  status IN ('new', 'in-progress', 'shipped', 'delivered', 'declined')
                ),
  admin_note    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS custom_orders_status_idx
  ON custom_orders (status, created_at DESC);

-- ── Newsletter ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS newsletter (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text        NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Storefront cache invalidation ──────────────────────────────────────
--
-- A tiny outbox the storefront build can poll. Rows are advisory only;
-- nothing depends on them being present.

CREATE TABLE IF NOT EXISTS cache_invalidations (
  id         bigserial PRIMARY KEY,
  scope      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cache_invalidations_recent_idx
  ON cache_invalidations (scope, created_at DESC);
