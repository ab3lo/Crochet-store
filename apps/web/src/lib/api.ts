/**
 * Reading from the API, with a baked snapshot as the fallback.
 *
 * The storefront is a static build, so at build time the API may be
 * asleep, unreachable, or not deployed yet. Every read therefore follows
 * the same order:
 *
 *   1. try the live API (build time: a real fetch, which is how an admin's
 *      latest edits reach the next deploy)
 *   2. fall back to `data/catalog.json`, a snapshot committed to the repo
 *   3. fall back to an empty set, and let the page say so honestly
 *
 * At runtime the same helpers are called from the Svelte islands, where
 * there is no build-time fetch and the snapshot arrives as props.
 */

import {
  API_ROUTES,
  CATEGORY_META,
  type ApiResult,
  type Category,
  type ProductView,
} from '@crochet/shared';
import { config, hasApi } from './config';
import SNAPSHOT from '../data/catalog.json';

/* ── Build-time data access ──────────────────────────────────────────── */

interface Snapshot {
  generatedAt: string;
  products: ProductView[];
  banners: import('@crochet/shared').BannerView[];
}

// The snapshot is generated JSON, so its inferred literal type is far more
// specific than the contract (and includes `undefined` for absent keys).
// A double assertion is the honest way to say "trust the generator".
const snapshot = SNAPSHOT as unknown as Snapshot;

/** Recorded at build time; surfaced in the admin so staleness is visible. */
export const snapshotAge = snapshot.generatedAt;

export interface Catalogue {
  products: ProductView[];
  banners: import('@crochet/shared').BannerView[];
  /** Where the numbers came from. Shown in the admin footer. */
  source: 'api' | 'snapshot' | 'empty';
}

/**
 * GET a JSON envelope, with a timeout and optional cancellation.
 *
 * Used in two places: at build time, where the API is often asleep and a
 * null return is the normal path rather than an error; and at runtime from
 * an island, where the caller may supersede the request.
 */
async function fetchJson<T>(
  path: string,
  timeoutMs = 4000,
  external?: AbortSignal,
): Promise<T | null> {
  if (!hasApi) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Chain the caller's signal into ours so either can cancel.
  const onAbort = () => controller.abort();
  external?.addEventListener('abort', onAbort, { once: true });

  try {
    const res = await fetch(`${config.apiUrl}${path}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiResult<T>;
    return body.ok ? body.data : null;
  } catch {
    // Offline, timed out, aborted or malformed — all the same to a caller.
    return null;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onAbort);
  }
}

/**
 * Full catalogue. Used by the home page, category pages and the sitemap.
 * Called during `astro build`, so the result is baked into static HTML.
 */
export async function getCatalogue(): Promise<Catalogue> {
  const [products, banners] = await Promise.all([
    fetchJson<ProductView[]>(API_ROUTES.products),
    fetchJson<import('@crochet/shared').BannerView[]>(API_ROUTES.activeBanners),
  ]);

  if (products) {
    return {
      products,
      banners: banners ?? [],
      source: 'api',
    };
  }

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

/* ── Runtime revalidation (islands) ──────────────────────────────────── */

/**
 * Pull a fresh copy of a collection in the browser. Returns null on any
 * failure — including an abort — so a caller can keep showing what it
 * already has rather than blanking the page when the API hiccups.
 *
 * Pass an `AbortSignal` when the caller may issue a newer request before
 * this one settles, or the slower response can win a race.
 */
export async function revalidate<T>(
  path: string,
  init: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T | null> {
  return fetchJson<T>(path, init.timeoutMs ?? 6000, init.signal);
}
