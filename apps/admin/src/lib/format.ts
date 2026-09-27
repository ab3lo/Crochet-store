/** Formatting helpers shared by the storefront and the admin. */

import { money } from '@crochet/shared';

export { money };

/** "20%" — or nothing when there is no discount, so we never print "0% off". */
export const formatDateTime = (iso: string | null): string => {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
};

/** "3 days" / "5 hours" / "42 minutes" — for a live countdown. */
export function timeLeft(endsAt: string | null, now: Date = new Date()): string | null {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - now.getTime();
  if (ms <= 0) return null;

  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return days === 1 ? '1 day left' : `${days} days left`;

  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return hours === 1 ? '1 hour left' : `${hours} hours left`;

  const mins = Math.max(1, Math.floor(ms / 60_000));
  return mins === 1 ? '1 minute left' : `${mins} minutes left`;
}

/** Stock phrased the way a maker would say it, not as a warehouse. */
export function stockLabel(
  product: { stock: number; madeToOrder: boolean },
): { text: string; urgent: boolean } {
  if (product.madeToOrder) return { text: 'Made to order', urgent: false };
  if (product.stock === 0) return { text: 'Currently out of stock', urgent: true };
  if (product.stock <= 3) return { text: `Only ${product.stock} left`, urgent: true };
  return { text: 'In stock', urgent: false };
}

export const hasDiscount = (p: {
  priceCents: number;
  compareAtCents: number | null;
  sale?: { salePriceCents: number; percentOff: number } | null;
}): boolean => {
  if (p.sale && p.sale.salePriceCents < p.priceCents) return true;
  return p.compareAtCents !== null && p.compareAtCents > p.priceCents;
};
