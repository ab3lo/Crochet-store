/**
 * Writes `src/data/catalog.json` — the baked snapshot the static build
 * falls back to when the API is unreachable (which is the normal case for
 * a `git push`-to-deploy setup).
 *
 * It reads the API's seed catalogue, so the two never drift, and adds a
 * deterministic demo banner so a fresh clone renders a complete storefront.
 *
 *   bun scripts/snapshot.ts
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BannerView, ProductView } from '@crochet/shared';

const here = dirname(fileURLToPath(import.meta.url));
const api = join(here, '..', '..', 'api', 'scripts', 'seed-data.ts');

/* Import the seed module. It is plain data with no side effects, so this
   is safe — but it does import `@crochet/shared`, so run via bun. */
const { PRODUCTS } = (await import(api)) as {
  PRODUCTS: Array<
    Omit<ProductView, 'createdAt' | 'updatedAt' | 'sale'> & {
      ageDays: number;
    }
  >
};

const now = Date.now();

const products: ProductView[] = PRODUCTS.map(({ ageDays, ...p }) => ({
  ...p,
  createdAt: new Date(now - ageDays * 86_400_000).toISOString(),
  updatedAt: new Date(now).toISOString(),
  sale: null,
}));

/* ── A snapshot banner, matching what the seed would produce ─────────── */

const featured = products
  .filter((p) => !p.hidden && p.stock > 0)
  .sort((a, b) => a.stock - b.stock)
  .slice(0, 4);

const ends = new Date(now);
ends.setDate(ends.getDate() + 7);
ends.setHours(23, 59, 59, 999);

const banners: BannerView[] = featured.length
  ? [
      {
        id: '00000000-0000-4000-8000-000000000001',
        slug: 'scarcity-keychains',
        name: 'Scarcity — keychains',
        template: 'marquee',
        status: 'live',
        headline: 'Last few keychains',
        subhead:
          'When these are gone they take a while to remake. A small handful only, hand-worked to order.',
        ctaLabel: 'See what is left',
        ctaHref: '/category/keychains',
        percentOff: 20,
        code: 'SCARCITY20',
        tint: null,
        productIds: featured.map((p) => p.id),
        startsAt: new Date(now).toISOString(),
        endsAt: ends.toISOString(),
        revision: 1,
        rationale:
          'Auto-generated from the catalogue: these four have the lowest stock in the shop.',
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
        isLive: true,
        salePriceCents: 0,
        products: featured.map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          priceCents: p.priceCents,
          compareAtCents: p.compareAtCents,
          images: p.images,
        })),
      },
    ]
  : [];

/* ── Mirror the sale onto the products, exactly as the API would ─────── */

for (const banner of banners) {
  for (const p of products) {
    if (!banner.productIds.includes(p.id)) continue;
    p.sale = {
      bannerId: banner.id,
      bannerSlug: banner.slug,
      bannerName: banner.name,
      headline: banner.headline,
      template: banner.template,
      percentOff: banner.percentOff,
      code: banner.code,
      salePriceCents: Math.round(p.priceCents * (1 - banner.percentOff / 100)),
      endsAt: banner.endsAt,
    };
  }
}

const payload = {
  generatedAt: new Date(now).toISOString(),
  products,
  banners,
};

const out = join(here, '..', 'src', 'data', 'catalog.json');
await mkdir(dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(
  `✓ ${out}\n  ${products.length} products, ${banners.length} banner(s)` +
    `\n  ${featured.length} product(s) carrying the demo sale`,
);
