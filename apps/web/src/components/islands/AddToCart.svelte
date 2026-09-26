<!--
  Product page add-to-cart: quantity stepper plus the button.

  Made-to-order products have no stock ceiling, so the stepper runs to 99
  with no "max" label. Everything else caps at what is actually on the
  shelf and says so, rather than letting someone order nine of the last two.
-->

<script lang="ts">
  import type { ProductView } from '@crochet/shared';
  import { cart } from '@/lib/stores/cart';
  import { ui } from '@/lib/stores/ui';

  interface Props {
    product: ProductView;
  }

  let { product }: Props = $props();

  const max = $derived(product.madeToOrder ? 99 : Math.max(1, product.stock));
  const soldOut = $derived(product.stock === 0 && !product.madeToOrder);

  let quantity = $state(1);

  // If stock changes underneath us (admin edit), pull the quantity back in.
  $effect(() => {
    if (quantity > max) quantity = max;
  });

  const line = $derived($cart.lines.find((l) => l.productId === product.id));
  const inCart = $derived(line?.quantity ?? 0);
  const capped = $derived(!soldOut && inCart >= max);

  function add() {
    cart.add(product, quantity);
    quantity = 1;
    // Open the basket so the addition is confirmed rather than implied.
    ui.open();
  }
</script>

<div class="buy">
  <div class="qty">
    <span class="qty-label" id="qty-label">Quantity</span>
    <div class="stepper" role="group" aria-labelledby="qty-label">
      <button
        type="button"
        onclick={() => (quantity = Math.max(1, quantity - 1))}
        disabled={quantity <= 1}
        aria-label="One fewer"
      >−</button>
      <input
        type="number"
        bind:value={quantity}
        min="1"
        max={max}
        inputmode="numeric"
        aria-label="Quantity to add"
        onblur={() => (quantity = Math.min(max, Math.max(1, quantity || 1)))}
      />
      <button
        type="button"
        onclick={() => (quantity = Math.min(max, quantity + 1))}
        disabled={quantity >= max}
        aria-label="One more"
      >+</button>
    </div>

    {#if !product.madeToOrder}
      <span class="qty-note">{max} in the basket</span>
    {:else}
      <span class="qty-note">Made for you, 2–3 weeks</span>
    {/if}
  </div>

  <button
    type="button"
    class="btn-stitch add"
    disabled={soldOut || capped}
    onclick={add}
  >
    {soldOut ? 'Sold out' : capped ? 'All of them are in your basket' : 'Add to basket'}
  </button>

  {#if inCart > 0 && !capped}
    <p class="in-basket">
      {inCart} already in your basket.
      <button type="button" class="link" onclick={() => ui.open()}>Open it</button>
    </p>
  {/if}
</div>

<style>
  .buy { display: grid; gap: 0.9rem; }

  .qty {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .qty-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-ink-soft);
  }

  .stepper {
    display: inline-flex;
    align-items: center;
    border: 1.5px solid color-mix(in oklab, var(--color-ink) 18%, transparent);
    border-radius: 999px;
    overflow: hidden;
    background: var(--color-paper);
  }

  .stepper button {
    width: 2.2rem;
    height: 2.2rem;
    border: 0;
    background: transparent;
    font-size: 1.05rem;
    line-height: 1;
    color: var(--color-ink);
  }

  .stepper button:hover:not(:disabled) { background: var(--color-blush); }
  .stepper button:disabled { opacity: 0.3; cursor: not-allowed; }

  .stepper input {
    width: 3rem;
    height: 2.2rem;
    border: 0;
    border-inline: 1.5px solid color-mix(in oklab, var(--color-ink) 12%, transparent);
    text-align: center;
    font: inherit;
    font-size: 0.9rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    background: transparent;
    color: var(--color-ink);
    -moz-appearance: textfield;
  }

  .stepper input::-webkit-outer-spin-button,
  .stepper input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

  .qty-note { font-size: 0.8rem; color: var(--color-ink-faint); }

  .add { width: 100%; padding-block: 0.85rem; font-size: 1rem; }

  .add:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .in-basket {
    margin: 0;
    font-size: 0.82rem;
    color: var(--color-ink-soft);
  }

  .link {
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    color: var(--color-rose-deep);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
</style>
