/**
 * Where the shop can be reached, and one way to describe an enquiry.
 *
 * Every WhatsApp message used to be built by whichever component needed it, so
 * the same three policy lines were restated in half of them and three entry
 * points produced a byte-identical cold open. `composeMessage` is the only
 * place a message is written now.
 *
 * Two rules hold across all four intents:
 *
 *   • A message never restates shop policy. Delivery region, lead time and
 *     payment terms are on the page the customer is already reading. Repeating
 *     them turns the message into something to delete before sending.
 *   • A message always carries provenance — which piece, which link, how many
 *     lines — so the maker knows what prompted it without asking.
 */

import { SALES_REGION, money } from '@crochet/shared';

export { SALES_REGION, PAYMENT_TERMS } from '@crochet/shared';

export const contact = {
  /** Digits with the country code and no `+` — what `wa.me` expects. */
  whatsapp: '+923714575133',

  email: 'hibot@doxxed.com',

  /** Placeholder until the real invite is pasted. */
  community: 'https://chat.whatsapp.com/REPLACE-WITH-INVITE-LINK',

  communityName: 'the stitch club',
} as const;

export function communityUrl(): string {
  return contact.community;
}

/** What the customer is trying to do. */
export type OrderIntent =
  | {
      kind: 'product';
      name: string;
      priceCents: number;
      url: string;
      /** Orderable now, on hand or made to order. */
      orderable: boolean;
    }
  | {
      kind: 'basket';
      lines: { name: string; quantity: number; unitPriceCents: number }[];
      subtotalCents: number;
    }
  | { kind: 'custom'; text: string; name?: string }
  | { kind: 'general' };

/**
 * Where the shop is, phrased as something to fill in rather than a rule to
 * obey. Ends every message on an action the customer can actually take, which
 * is what stops the maker having to open with a question.
 */
function closeWith(location: string): string {
  return `I'm in ${SALES_REGION.city}. ${location}`;
}

const GREETING = 'Assalamu Alaikum!';

/**
 * The whole message. Plain text, because that is all a prefilled WhatsApp
 * draft can be — anything richer has to survive the customer editing it.
 */
export function composeMessage(intent: OrderIntent): string {
  switch (intent.kind) {
    case 'product': {
      // A sold-out piece is not an order. Asking what is similar instead is
      // what the customer means, and "I'd like to order this" on a sold-out
      // product reads as not having read the page.
      if (!intent.orderable) {
        return (
          `${GREETING} I saw the ${intent.name} is sold out — ` +
          `is there anything similar you'd recommend?\n\n${intent.url}`
        );
      }

      return (
        `${GREETING} I'd like to order the ${intent.name} — ${money(intent.priceCents)}.\n\n` +
        `${intent.url}\n\n` +
        closeWith('Would collection or delivery work better?')
      );
    }

    case 'basket': {
      const items = intent.lines
        .map((l) => `• ${l.name} x${l.quantity} — ${money(l.unitPriceCents * l.quantity)}`)
        .join('\n');

      return (
        `${GREETING} I'd like to order:\n\n${items}\n\n` +
        `Total: ${money(intent.subtotalCents)}\n\n` +
        closeWith('My address is:')
      );
    }

    case 'custom': {
      const named = intent.name?.trim() ? ` This is ${intent.name.trim()}.` : '';
      return (
        `${GREETING} I'd like to commission a piece.${named}\n\n${intent.text.trim()}\n\n` +
        closeWith('Do you take custom work this way?')
      );
    }

    case 'general':
      return `${GREETING} I found the shop and had a question about a piece.`;
  }
}

/** `https://wa.me/<number>?text=<encoded>` */
export function whatsappUrl(message: string): string {
  return `https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(message)}`;
}

/** A link for a specific intent, without the caller composing anything. */
export function whatsappHref(intent: OrderIntent): string {
  return whatsappUrl(composeMessage(intent));
}