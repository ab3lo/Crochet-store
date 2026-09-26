<!--
  Product card.

  Not a rounded-corner card with a soft shadow — a flat panel with a stitch
  border and a hard offset, because that is what a granny square looks
  like on a table. The sale stamp sits on the corner as a stitched-on tag
  rather than a floating pill.
-->

<script lang="ts">
  import type { ProductView } from '@crochet/shared';
  import { money, stockLabel, hasDiscount } from '@/lib/format';
  import { cart } from '@/lib/stores/cart';
  import AddToCartInline from './AddToCartInline.svelte';

  interface Props {
    product: ProductView;
    /** Admin preview shows hidden products and the raw data. */
    showHidden?: boolean;
  }

  let { product, showHidden = false }: Props = $props();

  const onSale = $derived(hasDiscount(product));
  const stock = $derived(stockLabel(product));
  const image = $derived(product.images[0] ?? '/images/placeholder.svg');
  const added = $derived($cart.lastAdded === product.id);
</script>

<article
  class="card"
  class:card--sale={onSale}
  class:card--flash={added}
>
  <a class="card-media" href={`/product/${product.slug}/`}>
    <img
      src={image}
      alt={product.name}
      width="400"
      height="500"
      loading="lazy"
      decoding="async"
    />

    {#if onSale && product.sale}
      <span class="stamp">
        {product.sale.percentOff}% off
      </span>
    {:else if product.madeToOrder}
      <span class="stamp stamp--soft">Made to order</span>
    {/if}

    {#if showHidden && product.hidden}
      <span class="stamp stamp--hidden">Hidden</span>
    {/if}
  </a>

  <div class="card-body">
    <h3 class="card-name">
      <a href={`/product/${product.slug}/`}>{product.name}</a>
    </h3>

    {#if product.tagline}
      <p class="card-tagline">{product.tagline}</p>
    {/if}

    <div class="card-foot">
      <p class="card-price">
        <span class="price">{money(product.sale?.salePriceCents ?? product.priceCents)}</span>
        {#if onSale}
          <span class="price-was">{money(product.priceCents)}</span>
        {/if}
      </p>

      <span class="card-stock" class:urgent={stock.urgent}>{stock.text}</span>
    </div>

    <AddToCartInline {product} />
  </div>
</article>

<style>
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--color-paper);
    border: 1.5px solid color-mix(in oklab, var(--color-rose) 24%, transparent);
    border-radius: var(--radius-card);
    overflow: hidden;
    transition: transform 150ms ease, box-shadow 150ms ease;
  }

  .card:hover {
    transform: translate(-2px, -2px);
    box-shadow: 4px 4px 0 color-mix(in oklab, var(--color-rose) 30%, transparent);
  }

  /* A confirmation flash when the item is added. Motion that answers an
     action, not decoration. */
  .card--flash {
    box-shadow: 4px 4px 0 var(--color-rose-deep);
    border-color: var(--color-rose-deep);
  }

  .card-media {
    position: relative;
    display: block;
    aspect-ratio: 4 / 5;
    background: color-mix(in oklab, var(--color-blush) 40%, var(--color-paper));
  }

  .card-media img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* The sale stamp: a stitched-on tag, angled, sitting on the corner. */
  .stamp {
    position: absolute;
    top: 0.7rem;
    left: 0.7rem;
    padding: 0.25rem 0.6rem;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    background: var(--color-rose-deep);
    color: #fff;
    border-radius: 0.3rem;
    box-shadow: 2px 2px 0 color-mix(in oklab, var(--color-ink) 35%, transparent);
  }

  .stamp--soft {
    background: var(--color-paper);
    color: var(--color-rose-deep);
    border: 1.5px solid var(--color-rose-deep);
  }

  .stamp--hidden {
    background: var(--color-ink);
    left: auto;
    right: 0.7rem;
  }

  .card-body {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.9rem 1rem 1rem;
    flex: 1;
  }

  .card-name {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    line-height: 1.25;
  }

  .card-name a {
    color: var(--color-ink);
    text-decoration: none;
  }

  /* Stretch the link over the whole card, but keep it below the real
     buttons so the add-to-cart control stays clickable. */
  .card-name a::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 1;
  }

  .card-tagline {
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.4;
    color: var(--color-ink-soft);
  }

  .card-foot {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    margin-top: auto;
    padding-top: 0.6rem;
  }

  .card-price {
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
  }

  .card-stock {
    font-size: 0.72rem;
    color: var(--color-ink-faint);
    text-align: right;
  }

  .card-stock.urgent {
    color: var(--color-rose-deep);
    font-weight: 600;
  }

  :global(.card .add-inline) {
    position: relative;
    z-index: 2;
    margin-top: 0.7rem;
  }
</style>
