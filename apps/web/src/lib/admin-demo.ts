/**
 * Demo mode for the admin panel.
 *
 * The admin talks to exactly one function, `adminFetch`. This module
 * intercepts that function when there is nothing to talk to, and answers
 * from the committed catalogue snapshot instead. That means the whole panel —
 * catalogue, promotion editor with its live preview, enquiry queue — can be
 * opened in a browser with no database, no API and no `.env`.
 *
 * Writes mutate an in-memory copy, so the product editor and the banner
 * builder actually do something within a session. Nothing is persisted and
 * nothing leaves the browser.
 *
 * ── It is impossible to ship this ──────────────────────────────────────
 *
 * Demo mode requires `import.meta.env.DEV`. A production build has that
 * false, so the flag is hard off there and the panel falls back to talking to
 * the real API (or reporting that there is none). There is no environment
 * variable that can turn it on in production.
 */

import { API_ROUTES, type BannerView, type CustomOrder, type ProductView } from '@crochet/shared';
import SNAPSHOT from '../data/catalog.json';

/** True only in a dev build with no API configured. */
export const isDemo: boolean =
  import.meta.env.DEV && !import.meta.env.PUBLIC_API_URL && !import.meta.env.PUBLIC_AUTH_URL;

interface Snapshot {
  generatedAt: string;
  products: ProductView[];
  banners: BannerView[];
}

const snapshot = SNAPSHOT as unknown as Snapshot;

/* ── Seed data ───────────────────────────────────────────────────────── */

const clone = <T,>(v: T): T => structuredClone(v);

/** Products and banners start from the snapshot, then diverge in memory. */
let products: ProductView[] = clone(snapshot.products);
let banners: BannerView[] = clone(snapshot.banners);

/** A few enquiries so the queue is not empty. */
let orders: CustomOrder[] = [
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    name: 'Ayesha Khan',
    email: 'ayesha@example.com',
    contact: '@ayesha.knits',
    category: 'purses',
    quantity: 2,
    brief:
      'I would like two of the chain strap purses in sage and cream, for my sister and me. No deadline — whenever they are next on the list.',
    budgetCents: 8000,
    neededBy: 'No rush',
    status: 'new',
    adminNote: null,
    createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000002',
    name: 'Bilal Raza',
    email: 'bilal@example.com',
    contact: '0300-1234567',
    category: 'bouquets',
    quantity: 1,
    brief:
      'Wedding on the 14th, need three small posies in blush and ivory. Happy to pay the deposit today if you can turn them around in two weeks.',
    budgetCents: 15000,
    neededBy: '14th',
    status: 'in-progress',
    adminNote: 'Quoted Rs 12,000 for three posies. Deposit received.',
    createdAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000003',
    name: 'Sana Malik',
    email: 'sana@example.com',
    contact: null,
    category: 'custom',
    quantity: 1,
    brief: 'Something for a newborn — a blanket with the baby name in it, if that is possible?',
    budgetCents: null,
    neededBy: null,
    status: 'new',
    adminNote: null,
    createdAt: new Date(Date.now() - 9 * 86_400_000).toISOString(),
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000004',
    name: 'Fatima Noor',
    email: 'fatima@example.com',
    contact: null,
    category: 'keychains',
    quantity: 4,
    brief: 'Four heart keychains for my book club, in whatever colours you think look best together.',
    budgetCents: 4000,
    neededBy: 'Next week',
    status: 'shipped',
    adminNote: 'Posted, tracking shared.',
    createdAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
  },
];

const DEMO_USER = { id: 'demo', name: 'Shop owner', email: 'owner@example.com', role: 'admin' as const };

/** The session the admin panel sees in demo mode. */
export const demoUser = DEMO_USER;

/* ── Router ──────────────────────────────────────────────────────────── */

export interface DemoResult {
  status: number;
  data?: unknown;
  error?: string;
  fields?: Record<string, string>;
}

const uuid = () =>
  'd' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);

const revalidateSale = (product: ProductView): ProductView => {
  // Recompute the sale from whatever is live, so publishing a promotion in
  // demo mode visibly moves prices — that is the whole point of previewing it.
  const best = banners
    .filter((b) => b.productIds.includes(product.id) && b.status === 'live')
    .sort((a, b) => b.percentOff - a.percentOff)[0];

  if (!best || best.percentOff === 0) return { ...product, sale: null };
  return {
    ...product,
    sale: {
      bannerId: best.id,
      bannerSlug: best.slug,
      bannerName: best.name,
      headline: best.headline,
      template: best.template,
      percentOff: best.percentOff,
      code: best.code,
      salePriceCents: Math.round(product.priceCents * (1 - best.percentOff / 100)),
      endsAt: best.endsAt,
    },
  };
};

/**
 * Handles one admin request. Mirrors the real API's shape and status codes
 * closely enough that the panels cannot tell the difference — including the
 * validation failures, because a preview that never shows an error state is
 * not a useful preview.
 */
/**
 * The fields a demo request may carry. Declared rather than typed as
 * `Record<string, unknown>`, so a typo in a handler is a compile error
 * instead of a silent `undefined` at runtime.
 */
interface DemoBody {
  // product
  name?: string;
  slug?: string;
  tagline?: string;
  description?: string;
  priceCents?: number;
  compareAtCents?: number | null;
  category?: ProductView['category'];
  images?: string[];
  details?: Record<string, string>;
  stock?: number;
  madeToOrder?: boolean;
  hidden?: boolean;
  sortOrder?: number;
  // banner
  template?: BannerView['template'];
  /** Banner and enquiry statuses overlap, so accept the union and narrow. */
  status?: BannerView['status'] | CustomOrder['status'];
  headline?: string;
  subhead?: string;
  ctaLabel?: string;
  ctaHref?: string;
  percentOff?: number;
  code?: string | null;
  tint?: BannerView['tint'];
  productIds?: string[];
  startsAt?: string | null;
  endsAt?: string | null;
  rationale?: string | null;
  // order
  adminNote?: string | null;
}

/** Pull the banner-owned keys out of a body, as a typed partial. */
function bannerPatch(body: DemoBody): Partial<BannerView> {
  const out: Partial<BannerView> = {};
  if (body.name !== undefined) out.name = body.name;
  if (body.slug !== undefined) out.slug = body.slug;
  if (body.template !== undefined) out.template = body.template;
  if (body.status !== undefined) out.status = body.status as BannerView['status'];
  if (body.headline !== undefined) out.headline = body.headline;
  if (body.subhead !== undefined) out.subhead = body.subhead;
  if (body.ctaLabel !== undefined) out.ctaLabel = body.ctaLabel;
  if (body.ctaHref !== undefined) out.ctaHref = body.ctaHref;
  if (body.percentOff !== undefined) out.percentOff = body.percentOff;
  if (body.code !== undefined) out.code = body.code;
  if (body.tint !== undefined) out.tint = body.tint;
  if (body.productIds !== undefined) out.productIds = body.productIds;
  if (body.startsAt !== undefined) out.startsAt = body.startsAt;
  if (body.endsAt !== undefined) out.endsAt = body.endsAt;
  if (body.rationale !== undefined) out.rationale = body.rationale;
  return out;
}

/** Pull the product-owned keys out of a body, as a typed partial. */
function productPatch(body: DemoBody): Partial<ProductView> {
  const out: Partial<ProductView> = {};
  if (body.name !== undefined) out.name = body.name;
  if (body.slug !== undefined) out.slug = body.slug;
  if (body.tagline !== undefined) out.tagline = body.tagline;
  if (body.description !== undefined) out.description = body.description;
  if (body.priceCents !== undefined) out.priceCents = body.priceCents;
  if (body.compareAtCents !== undefined) out.compareAtCents = body.compareAtCents;
  if (body.category !== undefined) out.category = body.category;
  if (body.images !== undefined) out.images = body.images;
  if (body.details !== undefined) out.details = body.details;
  if (body.stock !== undefined) out.stock = body.stock;
  if (body.madeToOrder !== undefined) out.madeToOrder = body.madeToOrder;
  if (body.hidden !== undefined) out.hidden = body.hidden;
  if (body.sortOrder !== undefined) out.sortOrder = body.sortOrder;
  return out;
}

const ORDER_STATUSES: readonly CustomOrder['status'][] = [
  'new',
  'in-progress',
  'shipped',
  'delivered',
  'declined',
];

export function demoFetch(path: string, init: RequestInit & { json?: unknown }): DemoResult {
  const method = (init.method ?? 'GET').toUpperCase();
  const body = (init.json ?? {}) as DemoBody;
  const [pathname, query] = path.split('?');
  const params = new URLSearchParams(query ?? '');

  const bad = (field: string, message: string): DemoResult => ({
    status: 422,
    error: 'Please fix the highlighted fields.',
    fields: { [field]: message },
  });

  /* ── Products ────────────────────────────────────────────────────── */

  if (pathname === '/api/admin/products' && method === 'GET') {
    const category = params.get('category');
    const q = params.get('q')?.toLowerCase();
    const includeHidden = params.get('includeHidden') !== 'false';

    let list = products.map(revalidateSale);
    if (!includeHidden) list = list.filter((p) => !p.hidden);
    if (category) list = list.filter((p) => p.category === category);
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
    return { status: 200, data: list };
  }

  if (pathname === '/api/admin/products' && method === 'POST') {
    if (!body.name) return bad('name', 'Give the product a name');
    if (!body.slug) return bad('slug', 'Use lowercase words joined by dashes');
    if (products.some((p) => p.slug === body.slug)) {
      return { status: 409, error: 'That URL slug is already taken.', fields: { slug: 'Already in use — add something to the end' } };
    }

    const now = new Date().toISOString();
    const product: ProductView = {
      id: uuid(),
      slug: body.slug,
      name: body.name,
      tagline: body.tagline ?? '',
      description: body.description ?? '',
      priceCents: Number(body.priceCents ?? 0),
      compareAtCents: body.compareAtCents ?? null,
      category: body.category ?? 'keychains',
      images: body.images ?? [],
      details: body.details ?? {},
      stock: Number(body.stock ?? 0),
      madeToOrder: Boolean(body.madeToOrder),
      hidden: Boolean(body.hidden),
      sortOrder: Number(body.sortOrder ?? 0),
      createdAt: now,
      updatedAt: now,
      sale: null,
    };
    products.push(product);
    return { status: 201, data: { id: product.id } };
  }

  const productMatch = pathname?.match(/^\/api\/admin\/products\/([^/]+)$/);
  if (productMatch) {
    const id = productMatch[1]!;
    const i = products.findIndex((p) => p.id === id);

    if (i === -1) return { status: 404, error: 'No such product.' };

    if (method === 'PATCH') {
      const next = { ...products[i]!, ...productPatch(body), updatedAt: new Date().toISOString() };
      if (body.slug && products.some((p) => p.slug === body.slug && p.id !== id)) {
        return { status: 409, error: 'That URL slug is already taken.', fields: { slug: 'Already in use — add something to the end' } };
      }
      products[i] = next as ProductView;
      return { status: 200, data: { id } };
    }

    if (method === 'DELETE') {
      products.splice(i, 1);
      // Keep promotions from pointing at something that no longer exists.
      for (const b of banners) b.productIds = b.productIds.filter((p) => p !== id);
      return { status: 200, data: { deleted: true } };
    }
  }

  /* ── Banners ─────────────────────────────────────────────────────── */

  if (pathname === '/api/admin/banners' && method === 'GET') {
    return { status: 200, data: banners };
  }

  if (pathname === '/api/admin/banners/generate' && method === 'POST') {
    // Mimics the real engine closely enough to exercise the preview: pick the
    // lowest-stock, most-recently-added products and draft a scarcity nudge.
    const ranked = [...products]
      .filter((p) => !p.hidden)
      .sort((a, b) => a.stock - b.stock || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 4);

    if (ranked.length === 0) {
      return { status: 422, error: 'Nothing to promote — add a few products, or widen the category filter.' };
    }

    const noun = ranked.length === 1 ? ranked[0]!.name : `${ranked.length} pieces`;
    const ends = new Date();
    ends.setDate(ends.getDate() + 7);
    ends.setHours(23, 59, 59, 999);

    // The same explanation the real engine produces, in the same shape, so a
    // demo preview shows what the panel will really look like.
    const rationale =
      `No dated occasion in range, so this is driven by catalogue signals. ` +
      `Top item **${ranked[0]!.name}** has only ${ranked[0]!.stock} left, which is the ` +
      `strongest signal available. Using the **Marquee** component. ` +
      `Discount clamped to 20% — this is a demo draft, so the figures are illustrative.`;

    return {
      status: 201,
      data: {
        trigger: 'low-stock',
        rationale,
        input: {
          name: `Scarcity — ${noun}`,
          slug: `scarcity-${Date.now().toString(36).slice(-4)}`,
          template: 'marquee',
          status: 'draft',
          headline: 'Last few left',
          subhead: `When these are gone they take a while to remake. ${noun}, hand-worked to order.`,
          ctaLabel: 'See what is left',
          ctaHref: `/product/${ranked[0]!.slug}/`,
          percentOff: 20,
          code: 'DEMO20',
          tint: null,
          productIds: ranked.map((p) => p.id),
          startsAt: new Date().toISOString(),
          endsAt: ends.toISOString(),
          // Saved with the banner so the audit trail survives; the panel shows
          // the same text while editing.
          rationale,
        },
      },
    };
  }

  if (pathname === '/api/admin/banners' && method === 'POST') {
    if (!body.headline) return bad('headline', 'The banner needs a headline');
    const code = body.code?.trim().toUpperCase() ?? null;
    if (code && banners.some((b) => b.code?.toUpperCase() === code)) {
      return { status: 409, error: 'That discount code is already in use.', fields: { code: 'Another promotion already uses this code' } };
    }

    const now = new Date().toISOString();
    const banner: BannerView = {
      id: uuid(),
      name: body.name ?? 'Untitled promotion',
      slug: body.slug ?? `banner-${Date.now().toString(36)}`,
      template: body.template ?? 'stitch-strip',
      status: (body.status as BannerView['status']) ?? 'draft',
      headline: body.headline ?? '',
      subhead: body.subhead ?? '',
      ctaLabel: body.ctaLabel ?? 'Shop the drop',
      ctaHref: body.ctaHref ?? '/',
      percentOff: Number(body.percentOff ?? 0),
      code,
      tint: body.tint ?? null,
      productIds: body.productIds ?? [],
      startsAt: body.startsAt ?? null,
      endsAt: body.endsAt ?? null,
      revision: 1,
      rationale: body.rationale ?? null,
      createdAt: now,
      updatedAt: now,
      isLive: body.status === 'live',
      salePriceCents: null,
      products: (body.productIds ?? []).flatMap((id) => {
        const p = products.find((x) => x.id === id);
        return p
          ? [{ id: p.id, slug: p.slug, name: p.name, priceCents: p.priceCents, compareAtCents: p.compareAtCents, images: p.images }]
          : [];
      }),
    };
    banners.unshift(banner);
    return { status: 201, data: { id: banner.id } };
  }

  const bannerMatch = pathname?.match(/^\/api\/admin\/banners\/([^/]+)$/);
  if (bannerMatch) {
    const id = bannerMatch[1]!;
    const i = banners.findIndex((b) => b.id === id);
    if (i === -1) return { status: 404, error: 'No such banner.' };

    if (method === 'PATCH') {
      const next: BannerView = {
        ...banners[i]!,
        ...bannerPatch(body),
        revision: banners[i]!.revision + 1,
      };
      const code = body.code?.trim().toUpperCase() ?? null;
      if (code && banners.some((b) => b.id !== id && b.code?.toUpperCase() === code)) {
        return { status: 409, error: 'That discount code is already in use.', fields: { code: 'Another promotion already uses this code' } };
      }
      next.isLive = next.status === 'live' || next.status === 'scheduled';
      banners[i] = next;
      return { status: 200, data: next };
    }

    if (method === 'DELETE') {
      banners.splice(i, 1);
      return { status: 200, data: { deleted: true } };
    }
  }

  /* ── Orders ──────────────────────────────────────────────────────── */

  if (pathname === '/api/admin/orders' && method === 'GET') {
    const status = params.get('status');
    return {
      status: 200,
      data: status && status !== 'all' ? orders.filter((o) => o.status === status) : orders,
    };
  }

  const orderMatch = pathname?.match(/^\/api\/admin\/orders\/([^/]+)$/);
  if (orderMatch && method === 'PATCH') {
    const order = orders.find((o) => o.id === orderMatch[1]);
    if (!order) return { status: 404, error: 'No such enquiry.' };
    if (body.status && ORDER_STATUSES.includes(body.status as CustomOrder['status'])) {
      order.status = body.status as CustomOrder['status'];
    }
    if (body.adminNote !== undefined) order.adminNote = body.adminNote;
    return { status: 200, data: { updated: true } };
  }

  /* ── Stats ───────────────────────────────────────────────────────── */

  if (pathname === '/api/admin/stats' && method === 'GET') {
    return {
      status: 200,
      data: {
        products: products.filter((p) => !p.hidden).length,
        new_orders: orders.filter((o) => o.status === 'new').length,
        subscribers: 41,
        active_banners: banners.filter((b) => b.status === 'live').length,
        live_banners: banners.filter((b) => b.status === 'live').length,
      },
    };
  }

  /* ── Uploads ─────────────────────────────────────────────────────── */

  if (pathname === '/api/admin/upload') {
    return { status: 422, error: 'Image upload needs a real API. Everything else works in demo mode.' };
  }

  /* ── Public API, as called by the storefront ─────────────────────── */

  if (pathname === API_ROUTES.products && method === 'GET') {
    return { status: 200, data: products.filter((p) => !p.hidden).map(revalidateSale) };
  }
  if (pathname === API_ROUTES.activeBanners && method === 'GET') {
    return { status: 200, data: banners.filter((b) => b.status === 'live') };
  }

  return { status: 404, error: `Demo mode has no handler for ${method} ${pathname}.` };
}

/** Put everything back, for a page reload during a long preview session. */
export function resetDemo(): void {
  products = clone(snapshot.products);
  banners = clone(snapshot.banners);
  orders = [];
}
