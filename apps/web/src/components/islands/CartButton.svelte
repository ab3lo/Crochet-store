<!--
  Header cart trigger. Owns nothing — reads the cart store and opens the
  drawer through the shared UI signal.
-->

<script lang="ts">
  import { cart } from '@/lib/stores/cart';
  import { ui } from '@/lib/stores/ui';

  const count = $derived($cart.lines.reduce((n, l) => n + l.quantity, 0));
</script>

<button
  type="button"
  class="cart-btn"
  onclick={() => ui.open()}
  aria-label={`Open basket, ${count} item${count === 1 ? '' : 's'}`}
>
  <svg viewBox="0 0 22 22" width="19" height="19" aria-hidden="true">
    <path
      d="M4.5 7.5h13l-1.2 11a1.5 1.5 0 0 1-1.5 1.4H7.2a1.5 1.5 0 0 1-1.5-1.4z"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linejoin="round"></path>
    <path
      d="M8 9.5V6.8a3 3 0 0 1 6 0v2.7"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"></path>
  </svg>

  <span class="cart-label">Basket</span>

  {#if count > 0}
    <span class="cart-count">{count}</span>
  {/if}
</button>

<style>
  .cart-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.75rem;
    border-radius: 999px;
    border: 1.5px solid color-mix(in oklab, var(--color-rose) 30%, transparent);
    background: var(--color-paper);
    color: var(--color-ink);
    font-size: 0.85rem;
    font-weight: 600;
    transition: background-color 130ms ease, border-color 130ms ease;
  }

  .cart-btn:hover {
    background: color-mix(in oklab, var(--color-blush) 55%, var(--color-paper));
    border-color: var(--color-rose);
  }

  .cart-label { display: none; }

  @media (min-width: 640px) {
    .cart-label { display: inline; }
  }

  .cart-count {
    display: inline-grid;
    place-items: center;
    min-width: 1.25rem;
    height: 1.25rem;
    padding-inline: 0.25rem;
    border-radius: 999px;
    background: var(--color-rose-deep);
    color: #fff;
    font-size: 0.7rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
</style>
