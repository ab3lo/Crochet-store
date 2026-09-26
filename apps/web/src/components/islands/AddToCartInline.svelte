<!--
  Single-button add to cart, for grids. The product page uses the larger
  AddToCart with a quantity stepper instead.
-->

<script lang="ts">
  import type { ProductView } from '@crochet/shared';
  import { cart } from '@/lib/stores/cart';
  import { ui } from '@/lib/stores/ui';

  interface Props {
    product: ProductView;
  }

  let { product }: Props = $props();

  const soldOut = $derived(product.stock === 0 && !product.madeToOrder);
  const inCart = $derived($cart.lines.some((l) => l.productId === product.id));
  const justAdded = $derived($cart.lastAdded === product.id);

  const label = $derived(
    soldOut ? 'Sold out' : justAdded ? 'Added' : inCart ? 'In the basket' : 'Add to basket',
  );
</script>

<button
  type="button"
  class="btn-stitch add-inline"
  class:btn-stitch--ghost={!inCart && !justAdded}
  disabled={soldOut}
  onclick={() => {
    cart.add(product);
    ui.open();
  }}
>
  {#if justAdded}
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M3 8.5l3.2 3.2L13 5"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"></path>
    </svg>
  {/if}
  {label}
</button>

<style>
  .add-inline { width: 100%; font-size: 0.85rem; padding-block: 0.55rem; }

  .add-inline:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    border-color: color-mix(in oklab, var(--color-ink) 20%, transparent);
    background: transparent;
    color: var(--color-ink-faint);
    box-shadow: none;
  }

  .add-inline:disabled:hover { transform: none; box-shadow: none; }
</style>
