/**
 * Banner auto-generation.
 *
 * The admin clicks "Generate" and this module reads the live catalogue,
 * works out what is worth pushing right now, picks one of the pre-made
 * banner components, drafts the copy and the discount, and returns a
 * **draft** for a human to review. It never writes to the database and
 * never publishes on its own — a bot deciding to put 40% off a product
 * is a bad idea, so the human stays in the loop.
 */

import type { Banner, BannerInput, BannerTemplate, Product } from '@crochet/shared';
import { BANNER_TEMPLATE_META } from '@crochet/shared';

/* ── Occasion calendar ───────────────────────────────────────────────── */

interface Occasion {
  name: string;
  /** Month (1-12). */
  month: number;
  /** Give this occasion a lead time in days before the date. */
  leadDays?: number;
  headline: (ctx: OccasionContext) => string;
  subhead: (ctx: OccasionContext) => string;
  percentOff: number;
  template: BannerTemplate;
  code: string;
}

interface OccasionContext {
  name: string;
  leadDays: number;
}

/** Fixed-date occasions. Month/day, with an optional "start early" lead. */
const SEASONAL: Occasion[] = [
  {
    name: "Valentine's Day",
    month: 2,
    leadDays: 21,
    headline: () => 'Crocheted, not cut out',
    subhead: () => 'Handmade gifts that will not wilt by Thursday.',
    percentOff: 20,
    template: 'bloom',
    code: 'LOVE20',
  },
  {
    name: "Mother's Day",
    month: 5,
    leadDays: 28,
    headline: () => 'For the person who made everything else',
    subhead: () => 'A purse, a bouquet, a keychain she will actually use.',
    percentOff: 20,
    template: 'editorial',
    code: 'MUM20',
  },
  {
    name: 'Wedding season',
    month: 6,
    leadDays: 45,
    headline: () => 'Something for the happy couple',
    subhead: () => 'Personalised crochet, matched to your colours.',
    percentOff: 15,
    template: 'ribbon',
    code: 'WED15',
  },
  {
    name: 'Graduation & exams',
    month: 6,
    leadDays: 21,
    headline: () => 'Finished — go celebrate',
    subhead: () => 'A little prize that will not be lost in a drawer.',
    percentOff: 15,
    template: 'marquee',
    code: 'GRAD15',
  },
  {
    name: 'Back to school',
    month: 8,
    leadDays: 21,
    headline: () => 'New term, new charms',
    subhead: () => 'Clip a bag, a pencil case, a best friend.',
    percentOff: 15,
    template: 'stitch-strip',
    code: 'TERM15',
  },
  {
    name: 'Diwali',
    month: 10,
    leadDays: 30,
    headline: () => 'Diwali, hand-worked',
    subhead: () => 'Warm-toned crochet gifting in every shade of marigold.',
    percentOff: 25,
    template: 'bloom',
    code: 'DIWALI25',
  },
  {
    name: 'Christmas gifting',
    month: 12,
    leadDays: 45,
    headline: () => 'Wrapped in yarn',
    subhead: () => 'Order early — December is crochet season.',
    percentOff: 25,
    template: 'editorial',
    code: 'XMAS25',
  },
  {
    name: "New Year", 
    month: 1,
    leadDays: 14,
    headline: () => 'A fresh start, neatly stitched',
    subhead: () => 'New colourway, new season, same soft chaos.',
    percentOff: 15,
    template: 'stitch-strip',
    code: 'NEW15',
  },
];

/* ── Product signals ─────────────────────────────────────────────────── */

export type Signal = 'low-stock' | 'just-added' | 'slow-mover' | 'premium';

interface Scored {
  product: Product;
  signals: Signal[];
  score: number;
}

function ageInDays(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / 86_400_000;
}

/**
 * Discount headroom. If a product already carries a compare-at price we
 * know the maker has discounted it before and by how much — a decent proxy
 * for how much room there is.
 */
function headroom(product: Product): number {
  if (!product.compareAtCents || product.compareAtCents <= product.priceCents) {
    return 25; // No history: assume a conservative quarter.
  }
  const previous = 1 - product.priceCents / product.compareAtCents;
  return Math.max(10, Math.min(60, Math.round(previous * 100 * 1.5)));
}

function score(product: Product, now: Date): Scored {
  const signals: Signal[] = [];
  let score = 0;

  const age = ageInDays(product.createdAt, now);

  if (product.madeToOrder) {
    score += 15;
  }

  if (product.stock > 0 && product.stock <= 3) {
    signals.push('low-stock');
    score += 45; // Scarcity sells; this is the single strongest signal.
  } else if (product.stock === 0 && !product.madeToOrder) {
    signals.push('low-stock');
    score += 30;
  }

  if (age < 21) {
    signals.push('just-added');
    score += 30;
  } else if (age > 75) {
    signals.push('slow-mover');
    score += 18; // Needs a reason to be bought now.
  }

  if (product.priceCents >= 8_000) {
    signals.push('premium');
    score += 12; // Higher ticket: a small percent moves the number a lot.
  }

  if (product.stock === 0 && !product.madeToOrder) score -= 40; // Nothing to sell.

  return { product, signals, score };
}

/* ── Copy generation ─────────────────────────────────────────────────── */

const CATEGORY_NOUN: Record<string, [string, string]> = {
  keychains: ['keychains', 'charms'],
  bags: ['tote bags', 'bags'],
  purses: ['purses', 'pouches'],
  bouquets: ['crocheted bouquets', 'flowers'],
  custom: ['custom pieces', 'made-to-order work'],
};

const nounFor = (ids: string[], products: Product[]): string => {
  const cats = new Set(products.filter((p) => ids.includes(p.id)).map((p) => p.category));
  if (cats.size === 1) {
    const [singular, plural] = CATEGORY_NOUN[[...cats][0]!] ?? ['pieces', 'pieces'];
    return ids.length > 1 ? plural : singular;
  }
  return 'pieces';
};

/** Lowercase, no trailing punctuation — it gets slotted into templates. */
const tidy = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/[.\s]+$/, '');

const LOW_STOCK_COPY = (n: string) => ({
  headline: `Last few ${n}`,
  subhead: `When these are gone they take a while to remake. ${n} only, hand-worked to order.`,
});

const FRESH_COPY = (n: string) => ({
  headline: `Just off the hook`,
  subhead: `Fresh from the basket: ${n} finished this week, and only in small numbers.`,
});

const SLOW_COPY = (n: string) => ({
  headline: `A nudge on the ${n}`,
  subhead: `Been sitting in the basket a while. A small discount before I re-work the colours.`,
});

/* ── Entry point ─────────────────────────────────────────────────────── */

export interface GenerateOptions {
  /** Restrict to one category. Omit for the whole shop. */
  category?: string;
  /** Cap on how many products the banner attaches to. */
  maxProducts?: number;
  /** Force a particular component instead of letting the engine choose. */
  forceTemplate?: BannerTemplate;
  /** Ignore the occasion calendar. */
  noOccasion?: boolean;
  /**
   * Codes already in use. The engine is pure and cannot see the database, so
   * the caller passes them in and the generated code is made unique. Without
   * this, two campaigns for the same occasion collide on the unique index.
   */
  takenCodes?: string[];
}

export interface GeneratedBanner {
  input: BannerInput;
  /** Human-readable explanation shown next to the draft in the admin. */
  rationale: string;
  /** Which occasion or signal won, if any. */
  trigger: string;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);

export function generateBanner(
  products: Product[],
  opts: GenerateOptions = {},
  now: Date = new Date(),
): GeneratedBanner | null {
  const pool = products.filter(
    (p) => !p.hidden && (opts.category ? p.category === opts.category : true),
  );
  if (pool.length === 0) return null;

  /* 1. Is there an occasion we are inside the window for? */
  let occasion: Occasion | null = null;
  let occasionDaysOut = 0;
  if (!opts.noOccasion) {
    for (const o of SEASONAL) {
      // Occasions in January also need to be reachable from late December,
      // so check this month and the previous one.
      for (const m of [now.getMonth() + 1, now.getMonth()]) {
        if (m === o.month) {
          const start = new Date(now.getFullYear(), o.month - 1, 1);
          const daysOut = Math.round((start.getTime() - now.getTime()) / 86_400_000);
          if (daysOut <= (o.leadDays ?? 21)) {
            occasion = o;
            occasionDaysOut = daysOut;
            break;
          }
        }
      }
      if (occasion) break;
    }
  }

  /* 2. Otherwise rank products by signal. */
  const ranked = pool.map((p) => score(p, now)).sort((a, b) => b.score - a.score);
  const max = Math.max(1, Math.min(opts.maxProducts ?? 6, ranked.length));
  const chosen = ranked.slice(0, max).filter((r) => r.score > 0);
  if (chosen.length === 0) return null;

  const ids = chosen.map((c) => c.product.id);
  const signal = chosen[0]!.signals[0] ?? 'fresh';
  const noun = nounFor(ids, pool);

  /* 3. Component choice. An occasion wins; otherwise map the signal. */
  let template: BannerTemplate;
  let headline: string;
  let subhead: string;
  let percentOff: number;
  let code: string | null = null;
  let name: string;
  let rationale: string;
  let trigger: string;

  if (occasion) {
    const ctx: OccasionContext = { name: occasion.name, leadDays: occasionDaysOut };
    template = opts.forceTemplate ?? occasion.template;
    headline = occasion.headline(ctx);
    subhead = occasion.subhead(ctx);
    percentOff = occasion.percentOff;
    code = occasion.code;
    name = `${occasion.name} ${now.getFullYear()}`;
    trigger = occasion.name;
    rationale =
      `${occasion.name} is ${occasionDaysOut >= 0 ? `${occasionDaysOut} day(s) away` : 'in season'}` +
      ` and inside its ${occasion.leadDays ?? 21}-day lead window. ` +
      `Using the **${BANNER_TEMPLATE_META[template].label}** component, which reads best for a dated celebration. ` +
      `Offer set to ${percentOff}% off, attached to the ${chosen.length} highest-scoring product(s). ` +
      `Headroom check: ${chosen.map((c) => `${c.product.name} (~${headroom(c.product)}%)`).join(', ')}.`;
  } else {
    const copy =
      signal === 'low-stock'
        ? LOW_STOCK_COPY(noun)
        : signal === 'slow-mover'
          ? SLOW_COPY(noun)
          : FRESH_COPY(noun);

    template =
      opts.forceTemplate ??
      (signal === 'low-stock' ? 'marquee' : signal === 'slow-mover' ? 'editorial' : 'stitch-strip');

    headline = copy.headline;
    subhead = copy.subhead;

    // Take the smallest headroom in the set so a thin-margin item is not
    // accidentally over-discounted by joining a group.
    percentOff = Math.min(...chosen.map((c) => headroom(c.product)));
    percentOff = signal === 'low-stock' ? Math.min(percentOff, 30) : Math.min(percentOff, 20);

    name = `${signal === 'low-stock' ? 'Scarcity' : signal === 'slow-mover' ? 'Clearance nudge' : 'New drop'} — ${noun}`;
    trigger = signal;
    rationale =
      `No dated occasion in range, so this is driven by catalogue signals. ` +
      `Top item **${chosen[0]!.product.name}** scored ${chosen[0]!.score} ` +
      `(${chosen[0]!.signals.join(', ') || 'baseline'}). ` +
      `Using the **${BANNER_TEMPLATE_META[template].label}** component. ` +
      `Discount clamped to ${percentOff}% — the narrowest headroom in the selected set.`;
  }

  /* 4. A code is worth having when the discount is real. */
  let finalCode: string | null = null;
  if (code && percentOff > 0) finalCode = code;
  else if (percentOff > 0) {
    finalCode = slugify(`${trigger}-${percentOff}`).toUpperCase().replace(/-/g, '').slice(0, 12);
  }

  /* 4b. Make the code unique. Discount codes carry a unique index, and two
     campaigns for the same occasion in the same shop is a normal thing to
     want — so a collision gets a numeric suffix rather than an error. */
  if (finalCode) {
    const taken = new Set((opts.takenCodes ?? []).map((c) => c.toUpperCase()));
    if (taken.has(finalCode)) {
      const stem = finalCode.slice(0, 10);
      for (let n = 2; n <= 99; n++) {
        const candidate = `${stem}${n}`;
        if (!taken.has(candidate)) {
          finalCode = candidate;
          break;
        }
      }
    }
  }

  /* 5. Default the window to seven days, ending at midnight. */
  const ends = new Date(now);
  ends.setDate(ends.getDate() + 7);
  ends.setHours(23, 59, 59, 999);

  return {
    trigger,
    rationale,
    input: {
      name,
      slug: `${slugify(trigger)}-${now.getTime().toString(36).slice(-4)}`,
      template,
      status: 'draft',
      headline: tidy(headline),
      subhead: tidy(subhead),
      ctaLabel: 'Shop the drop',
      ctaHref: `/${chosen[0]!.product.slug}`,
      percentOff,
      code: finalCode,
      tint: null,
      productIds: ids,
      startsAt: now.toISOString(),
      endsAt: ends.toISOString(),
      rationale,
    },
  };
}
