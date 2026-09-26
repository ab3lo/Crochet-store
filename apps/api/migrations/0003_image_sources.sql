-- Crochet & Co. — externally sourced product imagery.
--
-- `products.images` is a flat text[]: a list of URLs with nothing attached to
-- them. That is fine when every image is a file this shop uploaded, and wrong
-- the moment one is not. A photo from a stock library has a photographer whose
-- name the licence requires you to display, a permalink to the original, and an
-- upstream id you need in order to refetch or replace it. None of that fits in
-- a URL string.
--
-- So images move into their own table, one row per image, carrying that
-- metadata. `products.images` stays as a denormalised copy of the URLs for the
-- storefront's hot path and is kept in sync by the API — see the note in
-- apps/api/src/db.ts. Nothing reads the array for anything except rendering.
--
-- ── Why not Instagram and Pinterest ────────────────────────────────────
--
-- Both block hotlinking. Their CDNs return 403 for third-party referrers and
-- both prohibit it in their terms of service, so an image "hosted on Instagram"
-- renders as a broken image on your storefront and may break again when the CDN
-- rotates the URL. The sources below are ones that explicitly permit a plain
-- <img src> from another origin, which is the only kind that survives contact
-- with a real browser.
--
--   stock        Unsplash / Pexels. Hotlinkable, free commercially, and both
--                expect the photographer to be credited — hence credit_name and
--                credit_url, which the storefront renders.
--   self-hosted  This shop's own uploads. Kept so existing rows keep working
--                and the shop is never forced to outsource its photography.
--   external     Anything else that serves hotlinked images. Permitted, but the
--                operator is on their own: verify the host permits hotlinking
--                before pointing a product at it.
--
-- `legacy` is what the backfill below labels the rows that came out of
-- `products.images`, because at the time of writing we cannot know where those
-- files actually live.

CREATE TABLE IF NOT EXISTS product_images (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid        NOT NULL REFERENCES products (id) ON DELETE CASCADE,

  -- Absolute http(s) URL, exactly as the browser will request it.
  url         text        NOT NULL CHECK (url ~ '^https?://'),

  -- Where it came from. See the list above.
  source      text        NOT NULL DEFAULT 'self-hosted' CHECK (
                source IN ('stock', 'self-hosted', 'external', 'legacy')
              ),

  -- Upstream identifier, so a stock image can be refetched or swapped without
  -- guessing which photo a URL used to point at. Null for our own uploads.
  source_id   text,

  -- Attribution. Both Unsplash and Pexels expect the photographer to be named
  -- and linked when their images are used, so these are not optional metadata
  -- for `source = 'stock'`.
  credit_name text,
  credit_url  text CHECK (credit_url IS NULL OR credit_url ~ '^https?://'),

  -- Alt text. Falls back to the product name at render time when null.
  alt         text,

  sort_order  integer     NOT NULL DEFAULT 0,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- The same image twice on one product is always a mistake, and it would make
  -- the gallery render a duplicate the shopper has to click past.
  CONSTRAINT product_images_url_per_product UNIQUE (product_id, url)
);

-- The storefront reads a product's images in order, always.
CREATE INDEX IF NOT EXISTS product_images_product_sort_idx
  ON product_images (product_id, sort_order);

-- Keep updated_at honest, same helper 0001 already defines.
DROP TRIGGER IF EXISTS product_images_touch ON product_images;
CREATE TRIGGER product_images_touch BEFORE UPDATE ON product_images
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── Backfill ──────────────────────────────────────────────────────────
--
-- Anything already in products.images becomes a 'legacy' row, in array order.
-- Guarded so re-running the migration does not duplicate anything: the unique
-- constraint on (product_id, url) makes the insert idempotent.

INSERT INTO product_images (product_id, url, source, sort_order)
SELECT p.id, img.url, 'legacy', img.ord - 1
FROM products p
CROSS JOIN LATERAL unnest(p.images) WITH ORDINALITY AS img(url, ord)
WHERE img.url ~ '^https?://'
ON CONFLICT (product_id, url) DO NOTHING;

-- Anything in the array that is a site-relative path (the bundled SVG
-- placeholders) is not an external image and does not belong in this table.
-- They keep working through products.images.
