<!--
  Banner template 5 of 5 — "editorial"

  A split block: image left, copy right, with the campaign's products as a
  small rail underneath. The most "shop-like" of the five, because it
  actually shows the thing being sold.

  It falls back gracefully — with no attached product it renders the copy
  half alone, centred, rather than leaving an empty image column.
-->

<script lang="ts">
  import type { BannerView } from '@crochet/shared';
  import { money, timeLeft } from '@/lib/format';

  interface Props {
    banner: BannerView;
    compact?: boolean;
  }

  let { banner, compact = false }: Props = $props();

  const from = $derived(banner.tint?.from ?? '#F7E2E8');
  const to = $derived(banner.tint?.to ?? '#EFC6D4');
  const accent = $derived(banner.tint?.accent ?? '#6E2340');
  const remaining = $derived(timeLeft(banner.endsAt));

  const hero = $derived(banner.products[0] ?? null);
</script>

<section
  class="ed bnr-wash"
  class:compact
  class:ed--noimage={!hero}
  style={`--from:${from};--to:${to};--accent:${accent}`}
  aria-label={banner.headline}
>
  <div class="ed-grid">
    {#if hero}
      <a class="ed-media" href={`/product/${hero.slug}`} tabindex="-1" aria-hidden="true">
        <img
          src={hero.images[0] ?? '/images/placeholder.svg'}
          alt=""
          loading="lazy"
          width="480"
          height="480"
        />
      </a>
    {/if}

    <div class="ed-copy">
      <h2 class="ed-headline">{banner.headline}</h2>
      {#if banner.subhead}<p class="ed-sub">{banner.subhead}</p>{/if}

      <div class="ed-row">
        {#if banner.percentOff > 0}
          <span class="bnr-offer">
            <span class="bnr-offer-num">{banner.percentOff}%</span>
            <span class="bnr-offer-word">off</span>
          </span>
        {/if}
        {#if hero}
          <span class="ed-price">
            <span class="price">{money(hero.priceCents)}</span>
            {#if banner.percentOff > 0}
              <span class="price-was">
                {money(Math.round(hero.priceCents * (1 - banner.percentOff / 100)))}
                &nbsp;→&nbsp;
              </span>
            {/if}
          </span>
        {/if}
        <a class="bnr-cta" href={banner.ctaHref}>{banner.ctaLabel}</a>
      </div>

      {#if banner.code || remaining}
        <p class="ed-meta">
          {#if banner.code}code <strong>{banner.code}</strong>{/if}
          {#if banner.code && remaining}<span aria-hidden="true">·</span>{/if}
          {#if remaining}{remaining}{/if}
        </p>
      {/if}

      {#if banner.products.length > 1}
        <ul class="ed-rail">
          {#each banner.products.slice(0, 5) as product (product.id)}
            <li>
              <a href={`/product/${product.slug}`}>
                <img
                  src={product.images[0] ?? '/images/placeholder.svg'}
                  alt={product.name}
                  loading="lazy"
                  width="72"
                  height="72"
                />
                <span>{product.name}</span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
</section>

<style>
  .ed { padding-block: 2.5rem; }
  .ed.compact { padding-block: 1.5rem; }

  .ed-grid {
    width: min(100% - 2.5rem, 62rem);
    margin-inline: auto;
    display: grid;
    gap: 2rem;
    align-items: center;
  }

  @media (min-width: 860px) {
    .ed-grid { grid-template-columns: minmax(0, 0.85fr) minmax(0, 1fr); }
    .ed--noimage .ed-grid { grid-template-columns: minmax(0, 1fr); }
  }

  .ed-media {
    display: block;
    border-radius: var(--radius-card);
    overflow: hidden;
    background: #fff;
    border: 1.5px solid var(--accent);
    box-shadow: 4px 4px 0 color-mix(in oklab, var(--accent) 28%, transparent);
  }

  .ed-media img {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 1;
    object-fit: cover;
  }

  .ed-copy { max-width: 32rem; }

  .ed--noimage .ed-copy { margin-inline: auto; text-align: center; }

  .ed-headline {
    font-size: var(--text-section);
    color: var(--accent);
    margin: 0 0 0.5rem;
  }

  .ed-sub {
    margin: 0 0 1.1rem;
    font-size: 1rem;
    line-height: 1.55;
    color: var(--accent);
    opacity: 0.85;
  }

  .ed-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.85rem;
  }

  .ed--noimage .ed-row { justify-content: center; }

  .ed-price {
    display: inline-flex;
    align-items: baseline;
    gap: 0.35rem;
    color: var(--accent);
  }

  .ed-meta {
    margin: 0.8rem 0 0;
    font-size: 0.8rem;
    letter-spacing: 0.03em;
    color: var(--accent);
    opacity: 0.78;
    display: flex;
    gap: 0.5rem;
    justify-content: inherit;
  }

  .ed--noimage .ed-meta { justify-content: center; }

  .ed-meta strong { font-weight: 700; letter-spacing: 0.1em; }

  .ed-rail {
    list-style: none;
    margin: 1.4rem 0 0;
    padding: 1rem 0 0;
    border-top: 1.5px solid color-mix(in oklab, var(--accent) 20%, transparent);
    display: flex;
    gap: 1rem;
    overflow-x: auto;
    scrollbar-width: thin;
  }

  .ed-rail a { display: flex; flex-direction: column; gap: 0.4rem; min-width: 5rem; }

  .ed-rail img {
    width: 72px;
    height: 72px;
    object-fit: cover;
    border-radius: 0.5rem;
    border: 1px solid color-mix(in oklab, var(--accent) 25%, transparent);
    background: #fff;
  }

  .ed-rail span {
    font-size: 0.72rem;
    line-height: 1.3;
    color: var(--accent);
    opacity: 0.8;
  }
</style>
