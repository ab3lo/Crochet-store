<!--
  Cart drawer.

  A real dialog, not a div: focus is trapped, Escape closes, background
  scroll is locked, and focus returns to whatever opened it. The close
  button is always the first thing in the tab order.
-->

<script lang="ts">
  import { cart, checkout } from '@/lib/stores/cart';
  import { ui } from '@/lib/stores/ui';
  import { money } from '@/lib/format';
  import { SALES_REGION } from '@/lib/contact';

  let panel = $state<HTMLElement | null>(null);
  let closeBtn = $state<HTMLButtonElement | null>(null);
  let restoreFocusTo: HTMLElement | null = null;

  const lines = $derived($cart.lines);
  const subtotal = $derived(lines.reduce((n, l) => n + l.unitPriceCents * l.quantity, 0));
  const isEmpty = $derived(lines.length === 0);
  const codes = $derived([...new Set(lines.map((l) => l.code).filter((c) => Boolean(c)))]);
  const orderHref = $derived(checkout.href(lines, subtotal));

  /* ── Open/close plumbing ───────────────────────────────────────── */

  $effect(() => {
    if ($ui) {
      restoreFocusTo = document.activeElement as HTMLElement | null;
      // Lock the page behind the drawer.
      document.body.style.overflow = 'hidden';
      queueMicrotask(() => closeBtn?.focus());
    } else {
      document.body.style.overflow = '';
      restoreFocusTo?.focus?.();
    }
  });

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      ui.close();
      return;
    }

    if (event.key !== 'Tab' || !panel) return;

    // Keep focus inside the drawer while it is open.
    const focusables = panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;

    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<svelte:window onkeydown={$ui ? onKeydown : undefined} />

{#if $ui}
  <!-- Scrim. aria-hidden: it is decoration, Escape and the button do the work. -->
  <div class="scrim" aria-hidden="true" onclick={() => ui.close()}></div>

  <!-- A plain div, not <aside>. `dialog` is an interactive role and ARIA does
       not allow it on a landmark element — the drawer is a dialog first and a
       complementary region never, so the landmark is dropped. -->
  <div
    class="drawer"
    role="dialog"
    aria-modal="true"
    aria-labelledby="cart-title"
    bind:this={panel}
  >
    <header class="drawer-head">
      <h2 id="cart-title">Your basket</h2>
      <button
        type="button"
        class="close"
        onclick={() => ui.close()}
        bind:this={closeBtn}
        aria-label="Close basket"
      >
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path
            d="M5 5l10 10M15 5L5 15"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"></path>
        </svg>
      </button>
    </header>

    {#if isEmpty}
      <div class="empty">
        <svg class="empty-mark" viewBox="0 0 60 34" width="60" height="34" aria-hidden="true">
          <path
            d="M2 31 Q15 4 30 31 Q45 4 58 31"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"></path>
        </svg>
        <p>Nothing in the basket yet.</p>
        <a class="btn-stitch btn-stitch--ghost" href="/category/keychains" onclick={() => ui.close()}>
          Have a look at the keychains
        </a>
      </div>
    {:else}
      <ul class="lines">
        {#each lines as line (line.productId)}
          <li class="line">
            <a class="line-img" href={`/product/${line.slug}`} onclick={() => ui.close()}>
              <img src={line.image} alt="" width="64" height="64" loading="lazy" />
            </a>

            <div class="line-body">
              <a
                class="line-name"
                href={`/product/${line.slug}`}
                onclick={() => ui.close()}
              >{line.name}</a>

              {#if line.code}
                <span class="line-promo">{line.code} applied</span>
              {/if}

              <div class="line-controls">
                <div class="stepper">
                  <button
                    type="button"
                    onclick={() => cart.setQuantity(line.productId, line.quantity - 1)}
                    aria-label={`One fewer ${line.name}`}
                  >−</button>
                  <span class="stepper-value" aria-live="polite">{line.quantity}</span>
                  <button
                    type="button"
                    onclick={() => cart.setQuantity(line.productId, line.quantity + 1)}
                    disabled={line.quantity >= line.maxQuantity}
                    aria-label={`One more ${line.name}`}
                  >+</button>
                </div>

                <span class="price line-price">
                  {money(line.unitPriceCents * line.quantity)}
                </span>
              </div>

              <button
                type="button"
                class="line-remove"
                onclick={() => cart.remove(line.productId)}
              >Remove</button>
            </div>
          </li>
        {/each}
      </ul>

      <footer class="drawer-foot">
        {#if codes.length > 0}
          <p class="drawer-promo">
            {#each codes as code, i (code)}{#if i > 0} · {/if}<strong>{code}</strong>{/each}
            already taken off
          </p>
        {/if}

        <div class="total-row">
          <span>Total</span>
          <span class="price total">{money(subtotal)}</span>
        </div>

        <p class="drawer-note">
          Checkout is by WhatsApp — I will confirm the pieces are free
          before you pay for anything.
        </p>

        <p class="drawer-region">
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path
              d="M8 1.5c2.5 0 4.5 2 4.5 4.5 0 3.2-4.5 8.5-4.5 8.5S3.5 9.2 3.5 6C3.5 3.5 5.5 1.5 8 1.5Z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linejoin="round"></path>
            <circle cx="8" cy="6" r="1.6" fill="currentColor"></circle>
          </svg>
          <span>Collection or delivery in {SALES_REGION.city} only.</span>
        </p>

        <a class="btn-stitch checkout" href={orderHref}>Send my order</a>

        <button type="button" class="clear" onclick={() => cart.clear()}>
          Empty the basket
        </button>
      </footer>
    {/if}
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: color-mix(in oklab, var(--color-ink) 38%, transparent);
    backdrop-filter: blur(2px);
  }

  .drawer {
    position: fixed;
    z-index: 61;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(100%, 26rem);
    display: flex;
    flex-direction: column;
    background: var(--color-paper);
    border-left: 1.5px solid color-mix(in oklab, var(--color-rose) 30%, transparent);
    box-shadow: -6px 0 0 -3px color-mix(in oklab, var(--color-rose) 18%, transparent);
    animation: slide-in 220ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  @media (prefers-reduced-motion: reduce) {
    .drawer { animation: none; }
  }

  @keyframes slide-in {
    from { transform: translateX(100%); }
    to   { transform: none; }
  }

  .drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.1rem 1.25rem;
    border-bottom: 1.5px solid color-mix(in oklab, var(--color-rose) 18%, transparent);
  }

  .drawer-head h2 {
    margin: 0;
    font-size: 1.3rem;
  }

  .close {
    display: grid;
    place-items: center;
    width: 2.1rem;
    height: 2.1rem;
    border-radius: 999px;
    border: 1.5px solid color-mix(in oklab, var(--color-ink) 20%, transparent);
    background: transparent;
    color: var(--color-ink);
  }

  .close:hover { background: var(--color-blush); }

  /* ── Empty ─────────────────────────────────────────────────────── */

  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 2rem;
    text-align: center;
  }

  .empty-mark { color: color-mix(in oklab, var(--color-rose) 45%, transparent); }
  .empty p { margin: 0; color: var(--color-ink-soft); }

  /* ── Lines ─────────────────────────────────────────────────────── */

  .lines {
    list-style: none;
    margin: 0;
    padding: 0.5rem 0;
    overflow-y: auto;
    flex: 1;
  }

  .line {
    display: flex;
    gap: 0.85rem;
    padding: 0.85rem 1.25rem;
    border-bottom: 1px dashed color-mix(in oklab, var(--color-rose) 22%, transparent);
  }

  .line-img img {
    width: 64px;
    height: 64px;
    object-fit: cover;
    border-radius: 0.5rem;
    background: var(--color-blush);
  }

  .line-body { flex: 1; min-width: 0; }

  .line-name {
    display: block;
    font-weight: 600;
    font-size: 0.92rem;
    color: var(--color-ink);
    text-decoration: none;
    line-height: 1.3;
  }

  .line-name:hover { color: var(--color-rose-deep); }

  .line-promo {
    display: inline-block;
    margin-top: 0.2rem;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.07em;
    color: var(--color-rose-deep);
  }

  .line-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .stepper {
    display: inline-flex;
    align-items: center;
    border: 1.5px solid color-mix(in oklab, var(--color-ink) 18%, transparent);
    border-radius: 999px;
    overflow: hidden;
  }

  .stepper button {
    width: 1.85rem;
    height: 1.85rem;
    border: 0;
    background: transparent;
    color: var(--color-ink);
    font-size: 1rem;
    line-height: 1;
  }

  .stepper button:hover:not(:disabled) { background: var(--color-blush); }
  .stepper button:disabled { opacity: 0.3; cursor: not-allowed; }

  .stepper-value {
    min-width: 1.5rem;
    text-align: center;
    font-size: 0.85rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .line-price { font-size: 0.95rem; }

  .line-remove {
    margin-top: 0.35rem;
    border: 0;
    background: none;
    padding: 0;
    font-size: 0.75rem;
    color: var(--color-ink-faint);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .line-remove:hover { color: var(--color-rose-deep); }

  /* ── Foot ──────────────────────────────────────────────────────── */

  .drawer-foot {
    padding: 1.1rem 1.25rem 1.5rem;
    border-top: 1.5px solid color-mix(in oklab, var(--color-rose) 18%, transparent);
    background: color-mix(in oklab, var(--color-blush) 26%, var(--color-paper));
  }

  .drawer-promo {
    margin: 0 0 0.6rem;
    font-size: 0.78rem;
    color: var(--color-rose-deep);
  }

  .total-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    font-size: 0.95rem;
    color: var(--color-ink-soft);
  }

  .total { font-size: 1.35rem; color: var(--color-ink); }

  .drawer-note {
    margin: 0.6rem 0 0.6rem;
    font-size: 0.78rem;
    line-height: 1.5;
    color: var(--color-ink-faint);
  }

  /* The delivery region, stated before the checkout button rather than after
     it. Somebody should not discover this after composing an order. */
  .drawer-region {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    margin: 0 0 1rem;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--color-rose-deep);
  }

  .drawer-region svg { flex-shrink: 0; margin-top: 0.1rem; }

  .checkout { width: 100%; }

  .clear {
    display: block;
    margin: 0.75rem auto 0;
    border: 0;
    background: none;
    font-size: 0.78rem;
    color: var(--color-ink-faint);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .clear:hover { color: var(--color-rose-deep); }
</style>
