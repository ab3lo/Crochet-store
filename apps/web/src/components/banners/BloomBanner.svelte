<!--
  Banner template 1 of 5 — "bloom"

  The petal hero. Big Fraunces headline over a soft wash, with a scalloped
  petal edge along the top and bottom so the panel reads as a flower cut
  from paper. Best for a dated celebration: Mother's Day, Diwali, a wedding
  drop.
-->

<script lang="ts">
  import type { BannerView } from '@crochet/shared';
  import { timeLeft } from '@/lib/format';

  interface Props {
    banner: BannerView;
    /** Admin preview renders a tighter, non-full-bleed panel. */
    compact?: boolean;
  }

  let { banner, compact = false }: Props = $props();

  const from = $derived(banner.tint?.from ?? '#FDE9EE');
  const to = $derived(banner.tint?.to ?? '#F7CCD8');
  const accent = $derived(banner.tint?.accent ?? '#7A1F3D');
  const remaining = $derived(timeLeft(banner.endsAt));
</script>

<section
  class="bloom bnr-wash"
  class:compact
  style={`--from:${from};--to:${to};--accent:${accent}`}
  aria-label={banner.headline}
>
  <!-- Petal edge, top. Purely structural: it is the panel's boundary. -->
  <div class="petals petals--top" aria-hidden="true"></div>

  <div class="bloom-inner">
    <div class="bloom-copy">
      <h2 class="bloom-headline">{banner.headline}</h2>
      {#if banner.subhead}
        <p class="bloom-sub">{banner.subhead}</p>
      {/if}
      {#if remaining}
        <p class="bnr-meta">{remaining}</p>
      {/if}
      <a class="bnr-cta bloom-cta" href={banner.ctaHref}>{banner.ctaLabel}</a>
    </div>

    <div class="bloom-side">
      {#if banner.percentOff > 0}
        <div class="bnr-offer">
          <span class="bnr-offer-num">{banner.percentOff}%</span>
          <span class="bnr-offer-word">off</span>
        </div>
      {/if}
      {#if banner.code}
        <div class="bloom-code">code <strong>{banner.code}</strong></div>
      {/if}

      {#if banner.products.length > 0}
        <ul class="bloom-thumbs">
          {#each banner.products.slice(0, 4) as product (product.id)}
            <li>
              <a href={`/product/${product.slug}/`} title={product.name}>
                <img
                  src={product.images[0] ?? '/images/placeholder.svg'}
                  alt={product.name}
                  loading="lazy"
                  width="56"
                  height="56"
                />
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>

  <div class="petals petals--bottom" aria-hidden="true"></div>
</section>

<style>
  .bloom {
    position: relative;
    padding: 3.25rem 0;
    overflow: hidden;
  }

  .bloom.compact { padding: 1.75rem 0; }

  /* Petal edge. An ellipse row reads as scalloped petals; the flat colour
     matches the panel so the join is invisible. */
  .petals {
    position: absolute;
    left: 0;
    right: 0;
    height: 18px;
    background-image: radial-gradient(
      ellipse 22px 20px at 11px 0%,
      var(--to) 99%,
      transparent 100%
    );
    background-size: 22px 18px;
    pointer-events: none;
  }

  .petals--top { top: -2px; }
  .petals--bottom {
    bottom: -2px;
    transform: rotate(180deg);
  }

  .bloom-inner {
    width: min(100% - 2.5rem, 68rem);
    margin-inline: auto;
    display: grid;
    gap: 2rem;
    grid-template-columns: 1fr;
    align-items: center;
  }

  @media (min-width: 900px) {
    .bloom-inner { grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); }
  }

  .bloom-copy { max-width: 34rem; }

  .bloom-headline {
    font-size: var(--text-section);
    color: var(--accent);
    margin: 0 0 0.6rem;
  }

  .bloom-sub {
    font-size: 1.05rem;
    line-height: 1.55;
    color: var(--accent);
    opacity: 0.85;
    margin: 0 0 0.75rem;
  }

  .bloom-cta { margin-top: 0.5rem; }

  .bloom-side {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.85rem;
  }

  .bloom-code {
    font-size: 0.8rem;
    letter-spacing: 0.04em;
    color: var(--accent);
    opacity: 0.8;
  }

  .bloom-code strong { font-weight: 700; letter-spacing: 0.1em; }

  .bloom-thumbs {
    display: flex;
    gap: 0.5rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .bloom-thumbs img {
    width: 56px;
    height: 56px;
    object-fit: cover;
    border-radius: 50%;
    border: 1.5px solid var(--accent);
    background: #fff;
    transition: transform 140ms ease;
  }

  .bloom-thumbs a:hover img { transform: translateY(-3px); }

  .bloom-thumbs a:focus-visible { outline-offset: 2px; }
</style>
