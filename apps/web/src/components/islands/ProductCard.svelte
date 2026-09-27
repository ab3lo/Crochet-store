<!--
  Product card.

  Not a rounded-corner card with a soft shadow — a flat panel with a stitch
  border and a hard offset, because that is what a granny square looks
  like on a table. The sale stamp sits on the corner as a stitched-on tag
  rather than a floating pill.
-->

<script lang="ts">
  import type { ProductView } from '@crochet/shared';
  import { money, stockLabel } from '@/lib/format';
  import { cart } from '@/lib/stores/cart';
  import AddToCartInline from './AddToCartInline.svelte';

  interface Props {
    product: ProductView;
    /** Admin preview shows hidden products and the raw data. */
    showHidden?: boolean;
  }

  let { product, showHidden = false }: Props = $props();

  /**
   * The two prices this card prints, or one of them.
   *
   * There are two ways a product can be discounted, and they are opposites —
   * which is exactly why this used to be wrong:
   *
   *   campaign   the banner re-prices the piece, so the *banner's* figure is
   *              charged and the product's own price is the struck "was"
   *   was price  the product carries its own `compareAtCents`, so `priceCents`
   *              is charged and the *compare-at* figure is the struck "was"
   *
   * The card used to hard-code the struck figure to `priceCents`. That is right
   * for a campaign and wrong for a "was" price, so a discounted product printed
   * `Rs 3,000  Rs 3,000` — the same number twice, with the real saving nowhere
   * on the page. The product page branched on the two cases and was always
   * right; the card had no branch at all.
   *
   * Both numbers now come from one place so they cannot drift apart again, and
   * `onSale` is read off this rather than asked separately — a card cannot end
   * up styled as a sale while printing no struck price, or the reverse.
   */
  const pricing = $derived.by(() => {
    if (product.sale && product.sale.salePriceCents < product.priceCents) {
      return { now: product.sale.salePriceCents, was: product.priceCents };
    }

    if (product.compareAtCents != null && product.compareAtCents > product.priceCents) {
      return { now: product.priceCents, was: product.compareAtCents };
    }

    return { now: product.priceCents, was: null };
  });

  const onSale = $derived(pricing.was != null);
  const stock = $derived(stockLabel(product));
  const image = $derived(product.images[0] ?? '/images/placeholder.svg');
  /**
   * Attribution for the image actually shown, not for the product. Unsplash
   * and Pexels both expect the photographer to be named when their work is
   * used, so this is rendered rather than left in the database.
   */
  const credit = $derived(product.imageCredits?.[0] ?? null);
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
      <span class="stamp stamp--soft">Made on Demand</span>
    {/if}

    {#if showHidden && product.hidden}
      <span class="stamp stamp--hidden">Hidden</span>
    {/if}
  </a>

  <div class="card-body">
    {#if credit?.name}
      <p class="card-credit">
        {#if credit.url}
          Photo by <a href={credit.url} target="_blank" rel="noopener noreferrer nofollow"
            >{credit.name}</a
          >
        {:else}
          Photo: {credit.name}
        {/if}
      </p>
    {/if}
    <h3 class="card-name">
      <a href={`/product/${product.slug}/`}>{product.name}</a>
    </h3>

    {#if product.tagline}
      <p class="card-tagline">{product.tagline}</p>
    {/if}

    <div class="card-foot">
      <p class="card-price">
        <span class="price">{money(pricing.now)}</span>
        {#if pricing.was != null}
          <span class="price-was">{money(pricing.was)}</span>
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

  /* Attribution for a stock photo. Quiet by design: it is a legal obligation,
     not a selling point, so it sits above the name in the faintest ink and
     stays out of the way of the price. */
  .card-credit {
    order: -1;
    margin: 0 0 0.15rem;
    font-size: 0.68rem;
    line-height: 1.4;
    color: var(--color-ink-faint);
  }

  .card-credit a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .card-credit a:hover { color: var(--color-rose-deep); }

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
