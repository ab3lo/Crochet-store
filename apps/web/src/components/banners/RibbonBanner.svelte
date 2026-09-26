<!--
  Banner template 3 of 5 — "ribbon"

  A bow-tied announcement bar. The bow and its two tails are drawn with CSS
  clip-paths, so the whole thing is one flat shape with no image request.

  This is the smallest of the five: it carries a sentence, not a campaign.
  Right for shipping news, a restock, or a short code that needs to be read
  rather than felt.
-->

<script lang="ts">
  import type { BannerView } from '@crochet/shared';

  interface Props {
    banner: BannerView;
    compact?: boolean;
  }

  let { banner, compact = false }: Props = $props();

  const from = $derived(banner.tint?.from ?? '#F9DCE4');
  const to = $derived(banner.tint?.to ?? '#F3C2D2');
  const accent = $derived(banner.tint?.accent ?? '#7A1F3D');
</script>

<section
  class="ribbon bnr-wash"
  class:compact
  style={`--from:${from};--to:${to};--accent:${accent}`}
  aria-label={banner.headline}
>
  <div class="ribbon-bow" aria-hidden="true">
    <span class="bow-loop bow-loop--l"></span>
    <span class="bow-knot"></span>
    <span class="bow-loop bow-loop--r"></span>
    <span class="bow-tail bow-tail--l"></span>
    <span class="bow-tail bow-tail--r"></span>
  </div>

  <div class="ribbon-body">
    <p class="ribbon-headline">{banner.headline}</p>
    {#if banner.subhead}<p class="ribbon-sub">{banner.subhead}</p>{/if}
  </div>

  <div class="ribbon-side">
    {#if banner.code}
      <span class="ribbon-code">{banner.code}</span>
    {/if}
    <a class="bnr-cta ribbon-cta" href={banner.ctaHref}>{banner.ctaLabel}</a>
  </div>
</section>

<style>
  .ribbon {
    display: grid;
    grid-template-columns: 1fr;
    align-items: center;
    gap: 1.1rem;
    padding: 1.1rem 1.25rem;
    border-block: 1.5px solid color-mix(in oklab, var(--accent) 26%, transparent);
  }

  .ribbon.compact { padding-block: 0.85rem; }

  @media (min-width: 800px) {
    .ribbon {
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 1.5rem;
      padding-inline: 2rem;
    }
  }

  .ribbon-body { min-width: 0; }

  .ribbon-headline {
    margin: 0;
    font-family: var(--font-display);
    font-variation-settings: 'SOFT' 35, 'WONK' 1, 'opsz' 24;
    font-size: 1.2rem;
    font-weight: 600;
    line-height: 1.15;
    color: var(--accent);
  }

  .ribbon.compact .ribbon-headline { font-size: 1.05rem; }

  .ribbon-sub {
    margin: 0.15rem 0 0;
    font-size: 0.88rem;
    line-height: 1.4;
    color: var(--accent);
    opacity: 0.82;
  }

  .ribbon-side {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .ribbon-code {
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    padding: 0.3rem 0.6rem;
    border: 1.5px dashed var(--accent);
    border-radius: 0.3rem;
    color: var(--accent);
  }

  .ribbon-cta { white-space: nowrap; }

  /* ── The bow ────────────────────────────────────────────────────────
     Two mirrored loops and two notched tails, all flat. A notch rather
     than a point, because crochet ribbon ends are cut square.          */

  .ribbon-bow {
    position: relative;
    width: 46px;
    height: 34px;
    display: none;
  }

  @media (min-width: 800px) { .ribbon-bow { display: block; } }

  .bow-loop,
  .bow-tail,
  .bow-knot {
    position: absolute;
    background: var(--accent);
  }

  .bow-loop {
    top: 2px;
    width: 22px;
    height: 16px;
  }

  .bow-loop--l {
    left: 0;
    border-radius: 60% 20% 60% 20%;
    transform: rotate(-8deg);
  }

  .bow-loop--r {
    right: 0;
    border-radius: 20% 60% 20% 60%;
    transform: rotate(8deg);
  }

  .bow-knot {
    top: 6px;
    left: 50%;
    transform: translateX(-50%);
    width: 12px;
    height: 12px;
    border-radius: 3px;
  }

  .bow-tail {
    top: 16px;
    width: 9px;
    height: 18px;
    clip-path: polygon(0 0, 100% 0, 100% 78%, 50% 100%, 0 78%);
  }

  .bow-tail--l { left: 10px; transform: rotate(9deg); }
  .bow-tail--r { right: 10px; transform: rotate(-9deg); }
</style>
