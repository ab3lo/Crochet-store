/**
 * Reading the catalogue, from the committed snapshot and nothing else.
 *
 * ## What changed, and why it is simpler
 *
 * This module used to have three layers of fallback: try the live API at build
 * time, fall back to `data/catalog.json`, fall back to an empty shop. It also
 * exported `revalidate()` for two islands that re-fetched their data in the
 * browser.
 *
 * All of that is gone, and the reason is the point of the whole migration:
 * there is no API any more. The admin panel writes to a local SQLite file and
 * publishes by committing `data/catalog.json`, so **that file is not a
 * fallback — it is the only input**. `astro build` reads it, synchronously,
 * with no network and no credentials, which is why a build can no longer fail
 * because a database is down or an API is asleep.
 *
 * The `source` field on the result is retained, and still earns its place: it
 * is how `index.astro` reports an empty catalogue honestly rather than
 * rendering a bare page that looks like a shop with no stock.
 *
 * ## What the islands lost
 *
 * `BannerRail` and `CatalogGrid` used to call `revalidate()` on mount, so a
 * promotion saved in the admin panel could appear without a redeploy. Both
 * already degraded gracefully — they kept their build-time list when the
 * request failed — so deleting the calls changed nothing about how they render
 * at build time and only removed a network round trip per page view.
 *
 * The honest consequence: **a catalogue change now always requires a publish.**
 * That is the intended design. It is also the one behavioural change a
 * shopper could notice, and it is why the admin panel's publish bar is a
 * permanent status strip rather than a toast.
 */

import {
  CATEGORY_META,
  type BannerView,
  type Category,
  type ProductView,
} from '@crochet/shared';
import SNAPSHOT from '../data/catalog.json';

/**
 * The snapshot is generated JSON, so its inferred literal type is far more
 * specific than the contract (and includes `undefined` for absent keys).
 * A double assertion is the honest way to say "trust the generator".
 */
interface Snapshot {
  generatedAt: string;
  products: ProductView[];
  banners: BannerView[];
}

const snapshot = SNAPSHOT as unknown as Snapshot;

/**
 * When `catalog.json` was last regenerated — i.e. when the catalogue was last
 * published. Surfaced on the home page so a stale build is visible rather than
 * silently authoritative.
 */
export const snapshotAge = snapshot.generatedAt;

export interface Catalogue {
  products: ProductView[];
  banners: BannerView[];
  /** Where the numbers came from. Shown in the admin footer. */
  source: 'snapshot' | 'empty';
}

/**
 * The full catalogue, read from the committed snapshot.
 *
 * Synchronous, because there is nothing to wait for. Every page that needs
 * products calls this in its frontmatter, and Astro bakes the result into
 * static HTML — including `getStaticPaths` in `product/[slug].astro`, which is
 * why a product page exists if and only if the product was in the last
 * publish.
 */
export function getCatalogue(): Catalogue {
  if (snapshot.products.length > 0) {
    return { products: snapshot.products, banners: snapshot.banners, source: 'snapshot' };
  }
  return { products: [], banners: [], source: 'empty' };
}

/* ── Categories ──────────────────────────────────────────────────────── */

export { CATEGORY_META };
export type { Category };

export function productsIn(list: ProductView[], category: Category): ProductView[] {
  return list.filter((p) => p.category === category);
}

export function sortProducts(list: ProductView[]): ProductView[] {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/**
 * Products on sale right now, cheapest effective price first. This is the
 * "reduced" shelf on the home page.
 */
export function onSaleProducts(list: ProductView[]): ProductView[] {
  return list
    .filter((p) => p.sale && p.sale.salePriceCents < p.priceCents)
    .sort((a, b) => a.sale!.salePriceCents - b.sale!.salePriceCents);
}
