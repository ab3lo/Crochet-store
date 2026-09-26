/**
 * Where the shop can actually be reached, and where it can actually
 * deliver.
 *
 * One place for the contact details, because they appear in three unrelated
 * spots — the floating WhatsApp button, the cart's "send my order" link, and
 * the copy on the shipping and custom-order pages. Editing the number in
 * three files is how a shop ends up quoting a WhatsApp number it no longer
 * uses. Delivery region comes from `@crochet/shared` so the storefront, the
 * cart and the order message cannot disagree about it.
 *
 * The community invite lives here for the same reason. It is a group link,
 * not a `wa.me` number, so it is kept apart from `whatsapp` rather than
 * derived from it — there is no one-to-one chat to open.
 */

import { PAYMENT_TERMS, SALES_REGION, money } from '@crochet/shared';

export { SALES_REGION };

/**
 * Re-exported for the same reason `SALES_REGION` is: the basket needs to quote
 * the payment terms without reaching past this module for shop policy.
 */
export { PAYMENT_TERMS };

export const contact = {
  /**
   * Full international number, digits only, no leading `+` — that is what
   * `wa.me` expects. For an Indian number that is `91` then the 10 digits.
   */
  whatsapp: '919999999999',

  email: 'hello@crochetandco.example',

  /**
   * Pre-filled opening message. WhatsApp ignores a trailing `?text=` on some
   * clients, so it stays short and plain.
   */
  message: "Hello! I found you on the shop and I'd like to ask about something.",

  /**
   * The WhatsApp group where work-in-progress goes — what is on the hook
   * this week, photographed as it happens.
   *
   * PLACEHOLDER. In WhatsApp: group → Invite → Copy link. It always looks
   * like `https://chat.whatsapp.com/` plus a long code. Search the repo for
   * `REPLACE-WITH-INVITE-LINK` to find every place to paste the real one.
   */
  community: 'https://chat.whatsapp.com/REPLACE-WITH-INVITE-LINK',

  /**
   * Noun for the group, used wherever a link needs a label. "Community" on
   * its own reads like a platform footer; the shop voice is warmer than
   * that.
   */
  communityName: 'the stitch club',
} as const;

/**
 * The invite link, plus the reason to click it. `chat.whatsapp.com` codes are
 * opaque and expire, so the link text carries the meaning rather than the
 * URL — nobody reads a 24-character slug and knows what it is.
 */
export function communityUrl(): string {
  return contact.community;
}

/** `https://wa.me/<number>?text=<encoded>` */
export function whatsappUrl(message: string = contact.message): string {
  return `https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(message)}`;
}

/**
 * The same link with the basket spelled out, and the delivery region stated
 * so there is no "where do you post to?" round trip before the maker will
 * even start.
 */
export function whatsappOrderUrl(
  lines: { name: string; quantity: number; unitPriceCents: number }[],
  subtotalCents: number,
): string {
  const items = lines
    .map(
      (l) =>
        `• ${l.name} x${l.quantity} — ${money(l.unitPriceCents * l.quantity)}`,
    )
    .join('\n');

  return whatsappUrl(
    `Hello! I'd like to order:\n\n${items}\n\nTotal: ${money(subtotalCents)}\n\n` +
      `${SALES_REGION.orderNote}\n${PAYMENT_TERMS.orderNote}\n\n` +
      `My address in ${SALES_REGION.city} is:`,
  );
}

/** The same message as a `mailto:` body. */
export function orderEmailUrl(
  lines: { name: string; quantity: number; unitPriceCents: number }[],
  subtotalCents: number,
): string {
  const items = lines
    .map(
      (l) =>
        `• ${l.name} x${l.quantity} — ${money(l.unitPriceCents * l.quantity)}`,
    )
    .join('\n');

  return (
    `mailto:${contact.email}` +
    `?subject=${encodeURIComponent(`Order from Crochet & Co. — ${SALES_REGION.city}`)}` +
    `&body=${encodeURIComponent(
      `Hello! I'd like to order:\n\n${items}\n\nTotal: ${money(subtotalCents)}\n\n` +
        `${SALES_REGION.orderNote}\n\nMy address in ${SALES_REGION.city} is:`,
    )}`
  );
}
