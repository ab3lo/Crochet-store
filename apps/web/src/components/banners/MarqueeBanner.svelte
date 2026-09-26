<!--
  Banner template 2 of 5 — "marquee"

  A headline bar over an endless ticker of yarn balls and the offer. Built
  for a flash sale: the motion is the message, and the repeated offer gives
  a shopper arriving halfway down the page a second, louder read.

  The track holds two identical runs and is translated -50%, so the loop has
  no seam. The script measures one offer's pitch and sizes each run to at
  least the viewport, which is what stops the band running out of text and
  leaving a dead gap at the right-hand edge.

  With `prefers-reduced-motion` the CSS stops the animation and the track
  simply shows its first copy.
-->

<script lang="ts">
  import type { BannerView } from '@crochet/shared';
  import { timeLeft } from '@/lib/format';

  interface Props {
    banner: BannerView;
    compact?: boolean;
  }

  let { banner, compact = false }: Props = $props();

  const from = $derived(banner.tint?.from ?? '#F6C9D6');
  const to = $derived(banner.tint?.to ?? '#FBE4EA');
  const accent = $derived(banner.tint?.accent ?? '#7A1F3D');
  const remaining = $derived(timeLeft(banner.endsAt));
  const label = $derived(banner.percentOff > 0 ? `${banner.percentOff}% off` : 'New in');

  /**
   * Ticker speed, in pixels per second.
   *
   * Duration is derived from the measured run width rather than hardcoded,
   * because the run holds however many offers the viewport needs. A fixed
   * `34s` would crawl on a wide monitor and race on a phone; deriving it keeps
   * every screen moving at the same pace.
   */
  const PX_PER_SECOND = 58;

  /**
   * What to render before anything has been measured. SSR has no viewport, so
   * these are guesses, and deliberately generous ones — a run that is briefly
   * too long only costs a slightly slower cycle, whereas one that is too short
   * shows a gap at the end of the band.
   */
  const SSR_UNITS = 24;
  const SSR_SECONDS = 34;

  /** Measured geometry. Zero until the first measure lands. */
  let pitch = $state(0);
  let viewportWidth = $state(0);

  /**
   * How many offers sit in one run.
   *
   * The old value was a fixed 16, roughly 1 900px of content, so any screen
   * wider than that showed a dead gap before the loop came round.
   * `min-width: 100%` was meant to prevent that, but a percentage min-width
   * resolves against the containing block — and the containing block here is
   * the `width: max-content` track. That is a cyclic dependency, so browsers
   * resolve it to zero and the rule did nothing. Even had it resolved, it
   * would have stretched the box rather than filling it with content.
   *
   * Measuring fixes both: the count is however many offers cover the viewport,
   * plus one more so the join is always off-screen.
   */
  const unitsPerRun = $derived(
    pitch > 0 ? Math.max(2, Math.ceil(viewportWidth / pitch) + 1) : SSR_UNITS,
  );

  /** Seconds for one full traverse, handed to the CSS as `--mq-duration`. */
  const duration = $derived(
    pitch > 0 ? Math.round(((unitsPerRun * pitch) / PX_PER_SECOND) * 100) / 100 : SSR_SECONDS,
  );

  const indices = $derived(Array.from({ length: unitsPerRun }, (_, i) => i));

  /**
   * Measure the band against the hidden probe, and keep it measured.
   *
   * An attachment rather than an effect: this is a DOM measurement with a
   * teardown, not state derived from props, and nothing here needs recomputing
   * when `banner` changes. It writes only the two measurements — `unitsPerRun`
   * and `duration` fall out of them as `$derived`.
   */
  function measureTicker(node: HTMLElement) {
    const read = () => {
      // Queried per read rather than captured once, so a stale or missing
      // probe cannot leave the measurement permanently wrong.
      const unit = node.querySelector<HTMLElement>('.mq-probe .mq-unit');
      const dot = node.querySelector<HTMLElement>('.mq-probe .mq-dot');
      if (!unit || !dot) return;

      // One pitch is one offer plus the separator trailing it. Flex rows do
      // not collapse margins, so the dot's inline margins are added, not
      // max()'d against the unit's own box.
      const dotStyle = getComputedStyle(dot);
      const next =
        unit.getBoundingClientRect().width +
        dot.getBoundingClientRect().width +
        parseFloat(dotStyle.marginLeft || '0') +
        parseFloat(dotStyle.marginRight || '0');

      // Not laid out yet, or the tab is hidden — nothing worth scaling to.
      if (next <= 0) return;

      pitch = next;
      viewportWidth = node.clientWidth;
    };

    read();

    // A webfont swap changes the width of the text without resizing the
    // viewport, and it lands after first paint.
    document.fonts?.ready.then(read).catch(() => {});

    // Fires for a window resize, a zoom change, a scrollbar appearing.
    const observer = new ResizeObserver(read);
    observer.observe(node);

    // The probe tracks the font, so observing it catches zoom and font
    // changes that leave the band's own box the same size.
    const probeEl = node.querySelector<HTMLElement>('.mq-probe');
    if (probeEl) observer.observe(probeEl);

    return () => observer.disconnect();
  }
</script>

<section
  class="mq bnr-wash"
  class:compact
  style={`--from:${from};--to:${to};--accent:${accent}`}
  aria-label={banner.headline}
>
  <div class="mq-head">
    <h2 class="mq-headline">{banner.headline}</h2>
    {#if banner.subhead}<p class="mq-sub">{banner.subhead}</p>{/if}
    <div class="mq-actions">
      <a class="bnr-cta" href={banner.ctaHref}>{banner.ctaLabel}</a>
      {#if remaining}<span class="bnr-meta">{remaining}</span>{/if}
    </div>
  </div>

  <div class="mq-ticker" role="presentation" {@attach measureTicker}>
    <!--
      One real offer plus its separator, out of flow and hidden from assistive
      tech. It is what gets measured for a pitch, so the run can be filled to
      the viewport. Kept in the DOM rather than measured and discarded,
      because a re-measure on resize needs it to still be there.
    -->
    <div class="mq-probe" aria-hidden="true">
      <span class="mq-unit">
        <svg class="mq-ball" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.6" />
          <path
            d="M4 9c5 2.5 11 2.5 16 0M4 15c5 2.5 11 2.5 16 0M9 3.5c2.5 5 2.5 11 0 17"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
          />
        </svg>
        {label}
      </span>
      <span class="mq-dot">·</span>
    </div>

    <div class="mq-track" style={`--mq-duration:${duration}s`}>
      {#each [0, 1] as copy (copy)}
        <div class="mq-run" aria-hidden={copy === 1}>
          {#each indices as i (i)}
            <span class="mq-unit">
              <svg class="mq-ball" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.6" />
                <path
                  d="M4 9c5 2.5 11 2.5 16 0M4 15c5 2.5 11 2.5 16 0M9 3.5c2.5 5 2.5 11 0 17"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.2"
                  stroke-linecap="round"
                />
              </svg>
              {label}
            </span>
            <span class="mq-dot" aria-hidden="true">·</span>
          {/each}
        </div>
      {/each}
    </div>
  </div>
</section>

<style>
  .mq { position: relative; overflow: hidden; }
  .mq.compact .mq-head { padding-block: 1.5rem; }

  .mq-head {
    width: min(100% - 2.5rem, 68rem);
    margin-inline: auto;
    padding-block: 2.5rem 1.75rem;
    text-align: center;
  }

  .mq.compact .mq-head { padding-block: 1.5rem 1rem; }

  .mq-headline {
    font-size: var(--text-section);
    color: var(--accent);
    margin: 0 0 0.4rem;
  }

  .mq-sub {
    margin: 0 auto 1.1rem;
    max-width: 30rem;
    color: var(--accent);
    opacity: 0.85;
    font-size: 1rem;
    line-height: 1.5;
  }

  .mq-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 0.85rem;
  }

  /* Ticker band. A flat band in the accent colour, top and bottom closed by
     the same stitch rule the rest of the site uses, so it reads as sewn into
     the panel rather than pasted under it. The edges fade out so items enter
     and leave instead of being chopped off. */
  .mq-ticker {
    /* Containing block for the out-of-flow measuring probe. */
    position: relative;
    background: var(--accent);
    color: #fff;
    padding-block: 0.55rem;
    border-block: 1.5px solid color-mix(in oklab, var(--accent) 70%, #000);
    overflow: hidden;
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent);
    mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent);
  }

  /* The track holds exactly two runs, and the script sizes each run to at
     least the viewport. So:
       - the band is never left with a blank tail, at any width, and
       - translating -50% lands on a pixel-identical frame, so the loop has
         no seam and no visible jump at the wrap.
     `width: max-content` is what lets the runs overflow the ticker; the
     ticker clips them. */
  .mq-track {
    display: flex;
    width: max-content;
  }

  .mq-run {
    display: flex;
    align-items: center;
    /* The two runs must measure identically or the -50% wrap is visible, so
       neither may be squeezed. Their natural widths are equal by
       construction — same children, same styles. */
    flex-shrink: 0;
  }

  /* The measurement copy. Out of flow so it cannot widen the band, and
     invisible so it cannot flash before the first measure. */
  .mq-probe {
    position: absolute;
    visibility: hidden;
    pointer-events: none;
    display: flex;
    align-items: center;
    height: 0;
    overflow: hidden;
  }

  .mq-unit {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-weight: 700;
    font-size: 0.82rem;
    /* Enough tracking to read as a hand-stitched label, not enough to
       stretch the words apart. */
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  /* The separator is part of the run, not a margin on its neighbours, so the
     spacing is identical everywhere and the wrap point is invisible. Its
     inline margin is the x-gap between one offer's text and the next, so
     this is the knob for how much air sits between repeats. */
  .mq-dot {
    flex-shrink: 0;
    opacity: 0.45;
    margin-inline: 1.6rem;
  }

  .mq-ball { flex-shrink: 0; }
</style>
