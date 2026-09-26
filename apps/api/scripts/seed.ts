/**
 * Seed the catalogue with a believable starting inventory, plus a demo
 * banner so the storefront is not empty on first run.
 *
 *   bun run seed          # only if the products table is empty
 *   bun run seed -- --force   # wipe products/banners and re-seed
 */

import type { Product } from '@crochet/shared';
import { pool, query, queryOne } from '../src/db.ts';
import { generateBanner } from '../src/lib/banner-engine.ts';
import { PRODUCTS } from './seed-data.ts';

const force = process.argv.includes('--force');

const existing = await queryOne<{ n: number }>('SELECT count(*)::int AS n FROM products');
const existingCount = existing?.n ?? 0;

if (existingCount > 0 && !force) {
  console.log(
    `\n  ${existingCount} product(s) already in the database. Nothing to do.` +
      `\n  Use \`bun run seed -- --force\` to replace them.\n`,
  );
} else {
  if (force) {
    console.log('\n  Clearing products and banners…');
    await query('DELETE FROM banners');
    await query('DELETE FROM products');
  }

  for (const p of PRODUCTS) {
    await query(
      `INSERT INTO products
         (id, slug, name, tagline, description, price_cents, compare_at_cents,
          category, images, details, stock, made_to_order, hidden, sort_order,
          created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,$13, now() - ($14 || ' days')::interval)
       ON CONFLICT (slug) DO NOTHING`,
      [
        p.id,
        p.slug,
        p.name,
        p.tagline,
        p.description,
        p.priceCents,
        p.compareAtCents,
        p.category,
        p.images,
        JSON.stringify(p.details),
        p.stock,
        p.madeToOrder,
        p.sortOrder,
        String(p.ageDays),
      ],
    );
  }
  console.log(`\n  Seeded ${PRODUCTS.length} products.`);

  /* ── One demo banner, produced by the real generator ─────────────── */
  const asProducts: Product[] = PRODUCTS.map((p) => ({
    ...p,
    createdAt: new Date(Date.now() - p.ageDays * 86_400_000).toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  const generated = generateBanner(asProducts, { maxProducts: 4 });
  if (generated) {
    await query(
      `INSERT INTO banners
         (slug, name, template, status, headline, subhead, cta_label, cta_href,
          percent_off, code, product_ids, starts_at, ends_at, rationale)
       VALUES ($1,$2,$3,'live',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        generated.input.slug,
        generated.input.name,
        generated.input.template,
        generated.input.headline,
        generated.input.subhead,
        generated.input.ctaLabel,
        generated.input.ctaHref,
        generated.input.percentOff,
        generated.input.code,
        generated.input.productIds,
        generated.input.startsAt,
        generated.input.endsAt,
        generated.rationale,
      ],
    );
    console.log(`  Demo banner: "${generated.input.headline}" (${generated.input.template}).`);
  }
}

await pool.end();
console.log('\n  Done.\n');
