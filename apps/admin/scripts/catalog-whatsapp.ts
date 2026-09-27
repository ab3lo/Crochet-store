/**
 * Export the catalogue as a CSV for a WhatsApp Business catalog.
 *
 * ## Why this exists
 *
 * A WhatsApp Business **catalog** is free: set it up once, and customers browse
 * the products inside WhatsApp and forward their cart to you as an ordinary
 * message. No Business Platform API, no BSP, no approved templates, no
 * per-message fees, nothing running on a server. For a shop that already takes
 * orders over WhatsApp, that is the whole channel — and it is the only version
 * of WhatsApp commerce that does not break this project's "no online compute"
 * constraint.
 *
 * This script produces the rows so that setup is a copy-paste rather than an
 * hour of typing. Re-run it after any publish that changes products or prices.
 *
 * ## The one thing that will bite
 *
 * **The product images in this repo are SVG placeholders, and WhatsApp will not
 * accept SVG as a catalog image.** Until real photographs are uploaded (they go
 * in `apps/web/public/images/products/` and are committed, so a publish puts
 * them on a real URL), the `image_link` column below points at `.svg` files
 * that will render as a broken image in the customer's WhatsApp.
 *
 * The CSV is still worth generating now — names, descriptions, prices and links
 * are all correct, and those are the fields that take the typing. Only the
 * images need replacing, and they are a filename change once the photos exist.
 *
 * ## Format
 *
 * Column names follow Meta Commerce Manager's product feed spec, which is what
 * the catalog import expects. Prices are decimal with two places, in PKR.
 *
 *   bun run catalog:whatsapp
 */

import { readFile, writeFile } from 'node:fs/promises';
import { CURRENCY } from '@crochet/shared';
import { CATALOG_PATH } from '../src/lib/server/export';

const OUT = new URL('../catalog-whatsapp.csv', import.meta.url).pathname;

interface Row {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  priceCents: number;
  compareAtCents: number | null;
  images: string[];
  stock: number;
  madeToOrder: boolean;
  hidden: boolean;
}

/** RFC 4180: quote everything, double any embedded quote. */
const cell = (v: string | number): string => `"${String(v).replace(/"/g, '""')}"`;

/** Strip newlines — a description with a hard line break breaks the row. */
const flat = (s: string): string => s.replace(/\s+/g, ' ').trim();

const money = (cents: number): string => (cents / 100).toFixed(2);

const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8')) as { products: Row[] };

// Hidden products stay out: a WhatsApp catalog is a shop window, and a piece the
// shop has deliberately unlisted should not be browsable there either.
const rows = catalog.products.filter((p) => !p.hidden);

const header = [
  'id',
  'title',
  'description',
  'price',
  'currency',
  'link',
  'image_link',
  'availability',
  'condition',
  'brand',
];

const site = 'https://crochet-and-co.pages.dev';

const lines = [
  header.map(cell).join(','),
  ...rows.map((p) =>
    [
      p.slug,
      p.name,
      // The tagline is the pitch; the description is the detail. Together they
      // are what a customer reads in the chat before deciding to message you.
      flat([p.tagline, p.description].filter(Boolean).join(' — ')),
      money(p.compareAtCents ?? p.priceCents),
      CURRENCY,
      `${site}/product/${p.slug}/`,
      // Absolute URL, or WhatsApp shows nothing. The first image is the one
      // the grid shows on the storefront, so it is the one that should lead.
      p.images[0] ? `${site}${p.images[0]}` : '',
      p.madeToOrder || p.stock > 0 ? 'in stock' : 'out of stock',
      'new',
      'Crochet & Co.',
    ]
      .map(cell)
      .join(','),
  ),
];

await writeFile(OUT, `${lines.join('\n')}\n`, 'utf8');

const svg = rows.filter((p) => p.images[0]?.endsWith('.svg')).length;

console.log(`\n  wrote ${OUT}`);
console.log(`  ${rows.length} products (${catalog.products.length - rows.length} hidden, excluded)`);
console.log(`  currency: ${CURRENCY}`);

if (svg > 0) {
  console.log(
    `\n  ! ${svg} of ${rows.length} image links point at .svg placeholders.` +
      `\n    WhatsApp will not render SVG. Upload real photographs to` +
      `\n    apps/web/public/images/products/ and publish — the links will update` +
      `\n    themselves, because they are built from the catalogue.`,
  );
}

console.log(
  `\n  Import at Meta Commerce Manager → Catalogs → your catalog → Import →\n` +
    `  "Upload CSV". WhatsApp caps a catalog at 500 products, one catalog per\n` +
    `  business account, so this fits many times over.\n`,
);
