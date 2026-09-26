/**
 * Shared contract between the static storefront (Astro) and the API (Hono).
 *
 * Everything the storefront renders comes from the shapes below, and
 * everything the admin panel submits is validated by the zod schemas at the
 * bottom of this file. Both sides import from `@crochet/shared` so the
 * contract can never drift.
 */

/* ── Money & region ──────────────────────────────────────────────────── */

export const CURRENCY = 'PKR' as const;
export const CURRENCY_LOCALE = 'en-PK' as const;

/**
 * Format integer paise as Pakistani rupees.
 *
 * `en-PK` gives "Rs 1,400.00", which is the local convention. The decimals
 * are dropped for whole rupees: a handmade-goods shop prices in round
 * numbers, and "Rs 1,400.00" on every card is noise. They come back as soon
 * as a price is not a whole rupee.
 */
export const money = (cents: number): string => {
  const rupees = cents / 100;
  return new Intl.NumberFormat(CURRENCY_LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: 0,
    maximumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
  }).format(rupees);
};

/** Just the number, no symbol — for structured data and input fields. */
export const amount = (cents: number): string =>
  (cents / 100).toLocaleString(CURRENCY_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Where this shop actually delivers.
 *
 * The maker sells in one city, so the storefront says so plainly rather than
 * shipping nationwide and disappointing people at checkout. Lives here
 * because the product pages, the cart, the shipping page and the order
 * message all have to agree on it.
 */
export const SALES_REGION = {
  city: 'Bahawalpur',
  province: 'Punjab',
  country: 'Pakistan',
  /** One line, in the shop's voice, for banners and footers. */
  note: 'Collection or local delivery within Bahawalpur.',
  /** Longer form, for the shipping page and the order form. */
  detail:
    'Everything is made to order or finished to order, so the shop is open for ' +
    'collection by appointment. Local delivery inside Bahawalpur is possible for ' +
    'larger pieces — message me and we will work out a day and a price.',
  /** Appended to every outbound order message. */
  orderNote: 'Delivery: collection or local delivery within Bahawalpur only.',
} as const;

/**
 * How an order is actually paid for.
 *
 * Nothing is stocked: every piece is made to order, so the maker wants an
 * advance before buying yarn and starting, and the rest on collection. There
 * is no card checkout, so the advance is sent through a mobile wallet the
 * shop provides per order.
 *
 * This lives beside `SALES_REGION` for the same reason: the product pages,
 * the basket, the shipping page, the custom-order page and the outbound
 * WhatsApp message all quote these terms, and a customer who is told "40%
 * advance" on one page and "pay in full" on another will assume the shop
 * cannot add up.
 */
const ADVANCE_PERCENT = 40;
const PAYMENT_METHODS = ['JazzCash', 'SadaPay'] as const;
const METHODS_TEXT = PAYMENT_METHODS.join(' or ');

export const PAYMENT_TERMS = {
  /** Percentage taken before work starts. */
  advancePercent: ADVANCE_PERCENT,

  /** Named wallets, for the places that have room to be specific. */
  methods: PAYMENT_METHODS,

  /** Headline, for the notice. */
  headline: 'Made to order, paid in advance.',

  /**
   * The notice body. Says who pays, how much and how. Built from the values
   * above rather than repeating them, so the percentage and the wallets
   * cannot drift away from the number and names a customer actually sees.
   */
  detail:
    `Nothing on this site is made until you order it. Message me on WhatsApp to ` +
    `start an order, and I will send you the details for a ` +
    `${ADVANCE_PERCENT}% advance by ${METHODS_TEXT} — or any other mobile ` +
    `wallet I send you. The balance is due when you collect.`,

  /** One line, for a product page or the basket where space is tight. */
  short: `${ADVANCE_PERCENT}% advance by mobile wallet to start. Balance on collection.`,

  /** Appended to every outbound order message, next to `orderNote`. */
  orderNote:
    `Payment: ${ADVANCE_PERCENT}% advance by ${METHODS_TEXT} ` +
    `(or any mobile wallet I send) before I start. Balance on collection.`,
} as const;

/* ── Categories ──────────────────────────────────────────────────────── */

export const CATEGORIES = [
  'keychains',
  'bags',
  'purses',
  'bouquets',
  'custom',
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface CategoryMeta {
  id: Category;
  title: string;
  blurb: string;
  /** Used by the storefront router and the admin category filter. */
  href: string;
}

export const CATEGORY_META: readonly CategoryMeta[] = [
  {
    id: 'keychains',
    title: 'Keychains',
    blurb: 'Tiny crochet charms that clip onto a bag and refuse to stay put.',
    href: '/category/keychains/',
  },
  {
    id: 'bags',
    title: 'Bags',
    blurb: 'Totes and shoulder bags worked in sturdy cotton and raffia yarn.',
    href: '/category/bags/',
  },
  {
    id: 'purses',
    title: 'Purses',
    blurb: 'Structured little bags with chain straps and buttoned flaps.',
    href: '/category/purses/',
  },
  {
    id: 'bouquets',
    title: 'Bouquets & flowers',
    blurb: 'Never-wilt blooms — crocheted roses, daisies and full posies.',
    href: '/category/bouquets/',
  },
  {
    id: 'custom',
    title: 'Custom orders',
    blurb: 'Tell me the colour, the size and the deadline. It gets made.',
    href: '/custom-orders/',
  },
] as const;

/* ── Products ────────────────────────────────────────────────────────── */

export interface Product {
  id: string;
  slug: string;
  name: string;
  /** One-paragraph story shown at the top of the product page. */
  tagline: string;
  description: string;
  priceCents: number;
  /** Struck-through "was" price. null when the item is not discounted. */
  compareAtCents: number | null;
  category: Category;
  /** Absolute URLs, already resolved against the Supabase public bucket. */
  images: string[];
  /** Free-form attributes: yarn weight, dimensions, stitch, care. */
  details: Record<string, string>;
  stock: number;
  /** Show "made to order" messaging instead of an in-stock counter. */
  madeToOrder: boolean;
  /** Hide from the storefront but keep in the admin. */
  hidden: boolean;
  /** Lower sorts first within a category. */
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** A product joined with whatever active banner is currently on it. */
export interface ProductView extends Product {
  /** Active sale attached to this product, if any. */
  sale: AppliedSale | null;
}

export interface AppliedSale {
  bannerId: string;
  bannerSlug: string;
  bannerName: string;
  /** Headline the banner wants the shopper to read. */
  headline: string;
  /** Which pre-made component to render. */
  template: BannerTemplate;
  /** Percentage off, e.g. 20. Already applied to `priceCents`. */
  percentOff: number;
  /** Checkout code the shopper can use. */
  code: string | null;
  /** Fractional effective price, for display only. */
  salePriceCents: number;
  endsAt: string | null;
}

/* ── Banners ─────────────────────────────────────────────────────────── */

/**
 * The pre-made banner components. Each key maps 1:1 to an `.astro`
 * component in `apps/web/src/components/banners/`, so a banner row can
 * never reference a component that does not exist.
 */
export const BANNER_TEMPLATES = [
  'bloom',
  'marquee',
  'ribbon',
  'stitch-strip',
  'editorial',
] as const;

export type BannerTemplate = (typeof BANNER_TEMPLATES)[number];

export const BANNER_TEMPLATE_META: Record<
  BannerTemplate,
  { label: string; blurb: string }
> = {
  bloom: {
    label: 'Bloom',
    blurb: 'Petal-edged hero. Headline over a florals-and-fuzz gradient wash.',
  },
  marquee: {
    label: 'Marquee',
    blurb: 'Endless ticker of yarn balls and the offer. Great for a flash sale.',
  },
  ribbon: {
    label: 'Ribbon',
    blurb: 'Bow-tied announcement bar. Good for shipping or restock news.',
  },
  'stitch-strip': {
    label: 'Stitch strip',
    blurb: 'Crochet-patterned band with a chain-rule. Good for a 10% nudge.',
  },
  editorial: {
    label: 'Editorial',
    blurb: 'Split block, image left, copy right. Good for a curated drop.',
  },
};

export type BannerStatus = 'draft' | 'scheduled' | 'live' | 'archived';

export interface Banner {
  id: string;
  slug: string;
  name: string;
  template: BannerTemplate;
  status: BannerStatus;
  headline: string;
  subhead: string;
  ctaLabel: string;
  ctaHref: string;
  /** 0–100. Applied to linked products when the banner goes live. */
  percentOff: number;
  code: string | null;
  /** Optional palette override so a drop can carry its own colour. */
  tint: BannerTint | null;
  /** Product ids this banner applies to. Order is preserved. */
  productIds: string[];
  startsAt: string | null;
  endsAt: string | null;
  /** Bumped by the auto-generator every time it drafts. */
  revision: number;
  /** Why the generator produced this banner, for the admin to review. */
  rationale: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BannerTint {
  /** Any two CSS colours; the component blends them. */
  from: string;
  to: string;
  /** Overrides the button colour inside the banner. */
  accent: string;
}

export interface BannerView extends Banner {
  /** Resolved products this banner currently applies to. */
  products: Pick<
    Product,
    'id' | 'slug' | 'name' | 'priceCents' | 'compareAtCents' | 'images'
  >[];
  isLive: boolean;
  salePriceCents: number | null;
}

/* ── Custom orders / enquiries ───────────────────────────────────────── */

export type OrderStatus =
  | 'new'
  | 'in-progress'
  | 'shipped'
  | 'delivered'
  | 'declined';

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'new',
  'in-progress',
  'shipped',
  'delivered',
  'declined',
] as const;

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'New',
  'in-progress': 'In progress',
  shipped: 'Shipped',
  delivered: 'Delivered',
  declined: 'Declined',
};

/**
 * One shape for an enquiry, used by the API's response, the admin panel and
 * anything that reads them. The DB rows are snake_case; `toCustomOrder` in
 * `apps/api/src/db.ts` is the single place that maps between the two.
 */
export interface CustomOrder {
  id: string;
  name: string;
  email: string;
  /** Optional handle for a chat app. */
  contact: string | null;
  category: Category;
  quantity: number;
  /** Free-form brief — colours, sizes, deadline, reference photos. */
  brief: string;
  budgetCents: number | null;
  neededBy: string | null;
  status: OrderStatus;
  adminNote: string | null;
  createdAt: string;
}

/* ── Cart (client-side, localStorage — no server session for shoppers) ── */

export interface CartLine {
  productId: string;
  slug: string;
  name: string;
  image: string;
  /** Price captured at add-to-cart time, so the cart cannot be tampered
   *  with into a cheaper total. The server re-validates on checkout. */
  unitPriceCents: number;
  quantity: number;
  /** Banner that discounted this line, if any. */
  bannerId: string | null;
  code: string | null;
  maxQuantity: number;
}

/* ── API envelope ────────────────────────────────────────────────────── */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fields?: Record<string, string> };

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
}

/* ── Endpoint surface (documents the API the storefront expects) ──────── */

export const API_ROUTES = {
  products: '/api/products',
  product: (slug: string) => `/api/products/${slug}`,
  categories: '/api/categories',
  banners: '/api/banners',
  activeBanners: '/api/banners/active',
  orders: '/api/orders',
  newsletter: '/api/newsletter',
  health: '/api/health',
} as const;

/* ── Validation schemas (API-side authority, mirrored in the admin) ──── */

import { z } from 'zod';

export const categorySchema = z.enum(CATEGORIES);

/**
 * A path on this site: must start with a single `/`.
 *
 * A bare `startsWith('/')` is not enough. `//evil.example` and
 * `/\evil.example` both pass that test, and a browser normalises both to a
 * protocol-relative URL — so a promotion's button could be pointed at
 * another site. That is an open redirect, so the second character must not
 * be a slash or a backslash, and control characters are rejected outright.
 */
export const internalPathSchema = z
  .string()
  .trim()
  .max(200)
  .refine(
    v => v === '/' || /^\/(?![/\\])/.test(v),
    'Use a path on this site, like /category/purses/',
  )
  .refine(v => !/[\u0000-\u001f\u007f]/.test(v), 'That path contains invalid characters');

/**
 * An externally fetchable image. `z.url()` also accepts `javascript:` and
 * `data:`, which have no business in a product photo field, so the scheme is
 * checked explicitly.
 */
export const imageUrlSchema = z
  .url()
  .refine(v => /^https?:\/\//i.test(v), 'Images must be an http(s) URL');

export const productInputSchema = z.object({
  name: z.string().trim().min(2, 'Give the product a name').max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase words joined by dashes'),
  tagline: z.string().trim().max(200).default(''),
  description: z.string().trim().max(4000).default(''),
  priceCents: z.coerce.number().int().min(0).max(100_000_00),
  compareAtCents: z.coerce
    .number()
    .int()
    .min(0)
    .max(100_000_00)
    .nullable()
    .default(null),
  category: categorySchema,
  images: z.array(imageUrlSchema).max(12).default([]),
  details: z.record(z.string().max(64), z.string().max(200)).default({}),
  stock: z.coerce.number().int().min(0).default(0),
  madeToOrder: z.coerce.boolean().default(false),
  hidden: z.coerce.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
});

export const bannerInputSchema = z.object({
  name: z.string().trim().min(2, 'Name the campaign').max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase words joined by dashes'),
  template: z.enum(BANNER_TEMPLATES),
  status: z.enum(['draft', 'scheduled', 'live', 'archived']).default('draft'),
  headline: z.string().trim().min(2, 'The banner needs a headline').max(90),
  subhead: z.string().trim().max(160).default(''),
  ctaLabel: z.string().trim().max(40).default('Shop the drop'),
  ctaHref: internalPathSchema.default('/category/keychains/'),
  percentOff: z.coerce.number().int().min(0).max(90).default(0),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,24}$/, 'Codes are 3–24 letters, digits or dashes')
    .nullable()
    .default(null),
  tint: z
    .object({
      from: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex'),
      to: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex'),
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex'),
    })
    .nullable()
    .default(null),
  productIds: z.array(z.uuid()).max(60).default([]),
  startsAt: z.iso.datetime().nullable().default(null),
  endsAt: z.iso.datetime().nullable().default(null),
  rationale: z.string().trim().max(1000).nullable().default(null),
});

export type BannerInput = z.infer<typeof bannerInputSchema>;

/** Query shape for `GET /api/admin/orders`. */
export const orderFilterSchema = z.enum([
  'all',
  'new',
  'in-progress',
  'shipped',
  'delivered',
  'declined',
]);

export const customOrderInputSchema = z.object({
  name: z.string().trim().min(2, 'Tell us your name').max(80),
  email: z.string().trim().email('That email does not look right').max(160),
  contact: z.string().trim().max(80).nullable().default(null),
  category: categorySchema,
  quantity: z.coerce.number().int().min(1).max(500).default(1),
  brief: z
    .string()
    .trim()
    .min(10, 'A sentence or two about what you have in mind')
    .max(4000),
  budgetCents: z.coerce.number().int().min(0).nullable().default(null),
  neededBy: z.string().trim().max(40).nullable().default(null),
});

/** Fields the owner may change on an enquiry. */
export const orderUpdateSchema = z.object({
  status: z.enum(['new', 'in-progress', 'shipped', 'delivered', 'declined']).optional(),
  adminNote: z.string().trim().max(4000).optional(),
});

export const newsletterInputSchema = z.object({
  email: z.string().trim().email('That email does not look right').max(160),
});

/** Enquiry id: a uuid. Rejects path-traversal attempts at the edge. */
export const uuidParamSchema = z.uuid();
