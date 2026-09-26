/**
 * Shared cart store.
 *
 * ## Why a store and not `$state`
 *
 * Astro hydrates every `client:` island as its *own* Svelte app. Module
 * scope is therefore not shared between islands — the header's cart button
 * and the drawer's contents each get their own copy of any module-level
 * `$state`, so they silently disagree.
 *
 * A store object hung off `globalThis` fixes that: one instance, shared by
 * every island, and Svelte's store contract gives each app its own
 * subscription that fires on every `set`. Mutations from a product card on
 * one island re-render the header badge on another.
 */

import type { CartLine, ProductView } from '@crochet/shared';
import { writable, get, type Readable } from 'svelte/store';
import { orderEmailUrl, whatsappOrderUrl } from '@/lib/contact';

const STORAGE_KEY = 'crochet.cart.v1';

export interface CartState {
  lines: CartLine[];
  /** Id of the product just added, so its card can flash. */
  lastAdded: string | null;
}

const EMPTY: CartState = { lines: [], lastAdded: null };

/** Discard anything that does not look like a line we wrote. */
function isValidLine(v: unknown): v is CartLine {
  if (typeof v !== 'object' || v === null) return false;
  const l = v as Record<string, unknown>;
  return (
    typeof l.productId === 'string' &&
    typeof l.slug === 'string' &&
    typeof l.name === 'string' &&
    typeof l.unitPriceCents === 'number' &&
    Number.isFinite(l.unitPriceCents) &&
    typeof l.quantity === 'number' &&
    l.quantity > 0 &&
    l.quantity <= 99
  );
}

function load(): CartState {
  if (typeof localStorage === 'undefined') return EMPTY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    // A price stored by an older build is re-validated at checkout anyway.
    return { lines: parsed.filter(isValidLine), lastAdded: null };
  } catch {
    // Corrupt localStorage must never take the shop down.
    return EMPTY;
  }
}

function save(lines: CartLine[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Private browsing or a full quota — the cart still works in memory.
  }
}

/** Made-to-order is effectively unlimited; everything else is capped. */
const maxOf = (p: ProductView): number => (p.madeToOrder ? 99 : Math.max(1, p.stock));

/* ── Actions ────────────────────────────────────────────────────────── */

let flashTimer: ReturnType<typeof setTimeout> | undefined;

function add(state: CartState, product: ProductView, quantity = 1): CartState {
  const max = maxOf(product);
  const lines = [...state.lines];
  const i = lines.findIndex((l) => l.productId === product.id);

  if (i >= 0) {
    lines[i] = { ...lines[i]!, quantity: Math.min(max, lines[i]!.quantity + quantity) };
  } else {
    lines.push({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      image: product.images[0] ?? '/images/placeholder.svg',
      // Snapshot the price the shopper was actually shown, so the cart
      // cannot be edited into a cheaper total. The API re-checks at checkout.
      unitPriceCents: product.sale?.salePriceCents ?? product.priceCents,
      quantity: Math.min(max, Math.max(1, quantity)),
      bannerId: product.sale?.bannerId ?? null,
      code: product.sale?.code ?? null,
      maxQuantity: max,
    });
  }

  save(lines);
  return { lines, lastAdded: product.id };
}

function setQuantity(state: CartState, productId: string, quantity: number): CartState {
  const existing = state.lines.find((l) => l.productId === productId);
  if (!existing) return state;
  if (quantity <= 0) return remove(state, productId);

  const lines = state.lines.map((l) =>
    l.productId === productId ? { ...l, quantity: Math.min(l.maxQuantity, quantity) } : l,
  );
  save(lines);
  return { ...state, lines };
}

function remove(state: CartState, productId: string): CartState {
  const lines = state.lines.filter((l) => l.productId !== productId);
  save(lines);
  return { ...state, lines };
}

function clear(): CartState {
  save([]);
  return EMPTY;
}

/* ── The shared instance ────────────────────────────────────────────── */

interface CartStore extends Readable<CartState> {
  add(product: ProductView, quantity?: number): void;
  setQuantity(productId: string, quantity: number): void;
  remove(productId: string): void;
  clear(): void;
  count(): number;
  subtotalCents(): number;
  codes(): string[];
}

function createCart(): CartStore {
  const { subscribe, set, update } = writable<CartState>(load());

  const api: CartStore = {
    subscribe,

    add(product, quantity = 1) {
      update((s) => add(s, product, quantity));
      // Clear the flash so the card does not stay highlighted forever.
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => update((s) => ({ ...s, lastAdded: null })), 1600);
    },

    setQuantity: (productId, quantity) => update((s) => setQuantity(s, productId, quantity)),
    remove: (productId) => update((s) => remove(s, productId)),
    clear: () => set(clear()),

    count: () => get({ subscribe }).lines.reduce((n, l) => n + l.quantity, 0),
    subtotalCents: () =>
      get({ subscribe }).lines.reduce((n, l) => n + l.unitPriceCents * l.quantity, 0),
    codes: () => [
      ...new Set(get({ subscribe }).lines.map((l) => l.code).filter((c): c is string => Boolean(c))),
    ],
  };

  return api;
}

/**
 * `Symbol.for` gives a process-wide key, so every island that evaluates
 * this module — however many separate Vite chunks it lands in — resolves to
 * the same store.
 */
const GLOBAL_KEY = Symbol.for('crochet.cart');

export const cart: CartStore =
  ((globalThis as Record<symbol, CartStore | undefined>)[GLOBAL_KEY] ??= createCart());

/* ── Checkout ──────────────────────────────────────────────────────────
   No card processing on this side. A maker-of-handmade-goods shop takes
   payment over a link or in person; wiring a gateway means PCI scope and a
   subscription, which is not what this project is for.

   `channel` decides where the order goes. The contact details themselves
   live in `lib/contact.ts` so this, the floating WhatsApp button and the
   copy on the info pages cannot drift apart.                             */

export const checkout = {
  /* WhatsApp is the default because it is the only channel the shop reads.
     `email` and `link` are still here — the order is a record either way,
     and email is the right fallback for someone who cannot wait. */
  channel: 'whatsapp' as 'email' | 'whatsapp' | 'link',

  /** A Payment Link, for the `link` channel. */
  paymentLink: '',

  href(lines: CartLine[], subtotalCents: number): string {
    if (this.channel === 'whatsapp') return whatsappOrderUrl(lines, subtotalCents);
    if (this.channel === 'link') return this.paymentLink;
    return orderEmailUrl(lines, subtotalCents);
  },
};
