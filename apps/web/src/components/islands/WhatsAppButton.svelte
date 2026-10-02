<!--
  The floating WhatsApp button.

  An island rather than a static link, which is the whole point of it: it reads
  the cart, so the message it opens with is the order the customer has actually
  built rather than "I found you on the shop and I'd like to ask about
  something". That sentence was the same on every page, so the maker learned
  nothing about what prompted the conversation.

  With a basket it offers to send it. Without one it falls back to the plain
  enquiry. The label changes with it, so the button says what it will do
  instead of asking the visitor to guess.
-->

<script lang="ts">
  import { cart } from '@/lib/stores/cart';
  import { whatsappHref, type OrderIntent } from '@/lib/contact';

  const { lines = [], subtotalCents = 0 } = $derived(cart);

  const count = $derived(lines.reduce((n, l) => n + l.quantity, 0));

  const intent = $derived<OrderIntent>(
    count > 0 ? { kind: 'basket', lines, subtotalCents } : { kind: 'general' },
  );

  const href = $derived(whatsappHref(intent));
  const label = $derived(count > 0 ? `Order my basket (${count})` : 'Message the shop');
</script>

<div class="wa-pin">
  <a
    class="wa"
    class:wa--basket={count > 0}
    {href}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={count > 0 ? `Send your basket of ${count} items on WhatsApp` : 'Message the shop on WhatsApp'}
    data-testid="whatsapp-button"
  >
    <svg class="wa-mark" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m0 1.67c2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.25 8.24a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24"
      ></path>
    </svg>
    {#if count > 0}
      <span class="wa-count">{count}</span>
    {/if}
    <span class="wa-label">{label}</span>
  </a>
</div>

<style>
  .wa-pin {
    position: sticky;
    bottom: 0;
    height: 0;
    z-index: 40;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }

  .wa {
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.7rem 1.15rem;
    margin-bottom: 0.85rem;
    border-radius: 999px;
    background: #25d366;
    color: #fff;
    font-weight: 600;
    font-size: 0.95rem;
    text-decoration: none;
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.22);
    transition: transform 140ms ease, box-shadow 140ms ease;
  }

  .wa:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 26px rgb(0 0 0 / 0.26);
  }

  /* A filled basket is a different offer from a bare enquiry, so it gets a
     ring to separate the two states at a glance. */
  .wa--basket {
    background: #128c4a;
    box-shadow:
      0 6px 20px rgb(0 0 0 / 0.22),
      0 0 0 3px color-mix(in oklab, #25d366 35%, transparent);
  }

  .wa-mark {
    flex-shrink: 0;
  }

  .wa-count {
    display: inline-grid;
    place-items: center;
    min-width: 1.35rem;
    height: 1.35rem;
    padding: 0 0.35rem;
    border-radius: 999px;
    background: #fff;
    color: #128c4a;
    font-size: 0.8rem;
    font-weight: 700;
  }

  .wa-label {
    white-space: nowrap;
  }

  /* Narrow screens keep the count and drop the words — the number is the part
     that changes the offer. */
  @media (max-width: 26rem) {
    .wa-label {
      display: none;
    }

    .wa {
      padding: 0.7rem;
    }
  }
</style>