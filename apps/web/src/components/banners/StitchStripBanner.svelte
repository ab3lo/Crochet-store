<!--
  Banner template 4 of 5 — "stitch strip"

  A crochet-patterned band. The background is a real V-stitch pattern (a
  chevron of chains) tiled in CSS, tinted to the campaign. Content sits in
  a solid inner bar so the pattern never fights the type.

  This is the restrained one: right for a standing 10% nudge that should
  be present on every page without shouting.
-->

<script lang="ts">
  import type { BannerView } from '@crochet/shared';
  import { timeLeft } from '@/lib/format';

  interface Props {
    banner: BannerView;
    compact?: boolean;
  }

  let { banner, compact = false }: Props = $props();

  const from = $derived(banner.tint?.from ?? '#F3D3DC');
  const to = $derived(banner.tint?.to ?? '#FBE9EE');
  const accent = $derived(banner.tint?.accent ?? '#6E2340');
  const remaining = $derived(timeLeft(banner.endsAt));
</script>

<section
  class="strip"
  class:compact
  style={`--from:${from};--to:${to};--accent:${accent}`}
  aria-label={banner.headline}
>
  <!-- Tiled V-stitch, at low opacity. This is the pattern that makes the
       band read as crochet without drawing a single flower. -->
  <div class="strip-stitch" aria-hidden="true"></div>

  <div class="strip-inner">
    <div class="strip-copy">
      <p class="strip-headline">
        {banner.headline}{#if banner.subhead}<span class="strip-sub">{banner.subhead}</span>{/if}
      </p>
    </div>

    <div class="strip-side">
      {#if banner.percentOff > 0}
        <span class="bnr-offer">
          <span class="bnr-offer-num">{banner.percentOff}%</span>
          <span class="bnr-offer-word">off</span>
          {#if banner.code}<span class="bnr-offer-code">{banner.code}</span>{/if}
        </span>
      {:else if banner.code}
        <span class="strip-code">{banner.code}</span>
      {/if}
      <a class="bnr-cta" href={banner.ctaHref}>{banner.ctaLabel}</a>
      {#if remaining}<span class="bnr-meta strip-meta">{remaining}</span>{/if}
    </div>
  </div>
</section>

<style>
  .strip {
    position: relative;
    isolation: isolate;
    overflow: hidden;
    border-block: 1.5px solid color-mix(in oklab, var(--accent) 22%, transparent);
  }

  .strip-stitch {
    position: absolute;
    inset: 0;
    z-index: -1;
    background-color: var(--from);
    /* A chevron of two chains — the V-stitch, which is the most common
       texture in crochet and the easiest to read as "crochet" flat. */
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='16' viewBox='0 0 24 16'%3E%3Cpath d='M0 14 L6 4 L12 14 L18 4 L24 14' fill='none' stroke='%23ffffff' stroke-opacity='0.75' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-size: 24px 16px;
    opacity: 0.85;
  }

  /* A flat inner bar, so the type never sits on the pattern directly. */
  .strip-inner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.85rem 1.5rem;
    width: min(100% - 2rem, 68rem);
    margin-inline: auto;
    padding: 0.7rem 1rem;
    background: var(--to);
    border-radius: 0.4rem;
  }

  .strip.compact .strip-inner { padding-block: 0.5rem; }

  .strip-copy { min-width: 0; }

  .strip-headline {
    margin: 0;
    font-family: var(--font-display);
    font-variation-settings: 'SOFT' 30, 'WONK' 1, 'opsz' 22;
    font-size: 1.05rem;
    font-weight: 600;
    line-height: 1.2;
    color: var(--accent);
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.6rem;
  }

  .strip-sub {
    font-family: var(--font-body);
    font-size: 0.88rem;
    font-weight: 400;
    opacity: 0.8;
  }

  .strip-side {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.7rem;
  }

  .strip-code {
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--accent);
  }

  .strip-meta { white-space: nowrap; }
</style>
