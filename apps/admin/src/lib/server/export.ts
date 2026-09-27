/**
 * Regenerate `apps/web/src/data/catalog.json` from SQLite.
 *
 * The boundary between the admin panel and the storefront: the panel owns a
 * database, `astro build` owns a JSON file, this is the only thing that crosses.
 *
 * ## Why JSON and not the database
 *
 * The build container has no reason to have a SQLite driver, the shop's
 * catalogue, or the ability to run migrations. A committed JSON file means the
 * build cannot fail because a datastore is unavailable — which was why the
 * original design had a `catalog.json` *fallback*, now promoted from fallback to
 * the only input — and that a catalogue change shows up in `git diff` as
 * reviewable JSON whose merge conflicts name the product that disagrees.
 *
 * The `.sqlite` file is gitignored and never committed; that is deliberate.
 *
 * ## Determinism
 *
 * `generatedAt` changes every run, which would make every commit dirty even
 * when the catalogue is unchanged. It is only refreshed when the content
 * actually differs, so publishing an unchanged database is a genuine no-op and
 * the git log means something.
 */

import { readFile, writeFile } from 'node:fs/promises';
import type { BannerView, ProductView } from '@crochet/shared';
import { activeBanners, listProducts, toBannerViews } from '../db';
import { CATALOG_PATH, CATALOG_REL } from '../paths';

export interface CatalogPayload {
  generatedAt: string;
  products: ProductView[];
  banners: BannerView[];
}

export function buildPayload(): CatalogPayload {
  return {
    generatedAt: new Date().toISOString(),
    products: listProducts({ includeHidden: true }),
    banners: toBannerViews(activeBanners()),
  };
}

export interface ExportResult {
  path: string;
  changed: boolean;
  products: number;
  banners: number;
}

export async function exportCatalog(opts: { force?: boolean } = {}): Promise<ExportResult> {
  const payload = buildPayload();
  const next = `${JSON.stringify(payload, null, 2)}\n`;

  let previous: string | null = null;
  try {
    previous = await readFile(CATALOG_PATH, 'utf8');
  } catch {
    // No snapshot yet — a fresh clone before the first publish.
  }

  if (previous !== null && !opts.force) {
    // Compare everything *except* `generatedAt`. Two payloads that differ
    // only in their timestamp describe the same shop.
    const withoutTimestamp = (s: string): unknown => {
      const parsed = JSON.parse(s) as { generatedAt?: string };
      delete parsed.generatedAt;
      return parsed;
    };

    if (JSON.stringify(withoutTimestamp(previous)) === JSON.stringify(withoutTimestamp(next))) {
      return {
        path: CATALOG_PATH,
        changed: false,
        products: payload.products.length,
        banners: payload.banners.length,
      };
    }
  }

  await writeFile(CATALOG_PATH, next, 'utf8');

  return {
    path: CATALOG_PATH,
    changed: true,
    products: payload.products.length,
    banners: payload.banners.length,
  };
}

export { CATALOG_PATH, CATALOG_REL };
