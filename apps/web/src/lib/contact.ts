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

  email: 'hibot@doxxed.com',

  /**
   * Pre-filled opening message. WhatsApp ignores a trailing `?text=` on some
   * clients, so it stays short and plain.
   */
  message: "Assalamu Alaikum! I found you on the shop and I'd like to ask about something.",

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
/**
 * A per-product WhatsApp link.
 *
 * ## Why a product needs its own message, not a generic one
 *
 * The consistent advice on `wa.me` links is to keep the number constant across
 * the site and vary the *message* per placement, so the seller already knows
 * what prompted the conversation before reading it. A generic "Assalamu Alikum!" makes
 * every enquiry a cold open.
 *
 * This is the highest-value link on the page and it did not exist: a visitor
 * who had decided about one piece had to add it to a basket, open the basket,
 * and send a whole order — three steps for a purchase they had already chosen.
 * One tap, one message, one product.
 *
 * ## Why the message is short
 *
 * The prefilled text should read like something the customer would genuinely
 * have typed, stay editable, and ask only for what is needed to start. So:
 * what they want, which piece, the price, and the link. No delivery or payment
 * boilerplate — the customer has already read `RegionNotice` and
 * `PaymentNotice` directly above the button, and repeating it here only makes
 * the message something to delete before sending.
 */
export function whatsappProductUrl(
  product: {
    name: string;
    priceCents: number;
    stock: number;
    madeToOrder: boolean;
  },
  url: string,
): string {
  // Out of stock is the one case where the message should ask something
  // different, because "I'd like to order this" is not what the customer means
  // when the piece is sold out — they mean "what have you got instead".
  const aside = product.madeToOrder
    ? 'I know it is made to order.'
    : product.stock > 0
      ? ''
      : '\n\nI see it is sold out — is anything similar available?';

  return whatsappUrl(
    `Assalamu Alaikum! I'd like to order the ${product.name} (${money(product.priceCents)}).` +
      `${aside}\n\n${url}`,
  );
}

/**
 * The basket handoff.
 *
 * Everything the seller needs to take the order in one message: the lines, the
 * total, the delivery region, the payment terms, and a prompt for the address.
 * Deliberately *not* shortened the way the per-product link is — this one
 * replaces a checkout form, so the details a form would have collected belong
 * in it.
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
    `Assalamu Alikum! I'd like to order:\n\n${items}\n\nTotal: ${money(subtotalCents)}\n\n` +
      `\n${PAYMENT_TERMS.orderNote}\n\n` +
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
      `Assalamu Alikum! I'd like to order:\n\n${items}\n\nTotal: ${money(subtotalCents)}\n\n` +
        `\n\nMy address in ${SALES_REGION.city} is:`,
    )}`
  );
}
