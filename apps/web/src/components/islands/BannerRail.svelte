<!--
  Banner rail.

  Renders the first live banner, with dots to move between them. Rotates on
  its own every 9 seconds and stops the moment the pointer is over it — a
  rotating element that keeps moving while you are trying to read it is
  hostile.

  Collapsed by default after the first visit. A full promotional banner at
  the top of every page pushes the actual shop down the screen, and a shopper
  who has already seen it should not have to see it again. The collapsed
  state is a one-line strip — still an ad, but it costs 28px instead of 300.

  The banner body is the pre-made component, chosen by `template`, and it is
  left mounted while collapsed so rotating between banners does not tear down
  and rebuild a marquee every nine seconds.
-->

<script lang="ts">
  import type { BannerView } from '@crochet/shared';
  import { API_ROUTES } from '@crochet/shared';
  import { bannerComponent } from '@/components/banners/registry';
  import { revalidate } from '@/lib/api';

  interface Props {
    /** Server-rendered live banners. */
    banners: BannerView[];
  }

  let { banners }: Props = $props();

  const COLLAPSED_KEY = 'crochet.banner.collapsed';
  const HIDDEN_KEY = 'crochet.banner.dismissed';

  // Hydrate from the API so a campaign published since the build shows up
  // without a redeploy. Keeps the server list if the API is unreachable.
  // `$state.snapshot` says plainly that this is a copy of the incoming value
  // and not a live binding to it — `list` is reassigned by the revalidation
  // below and by dismissal, so it must not alias the prop.
  let list = $state<BannerView[]>($state.snapshot(banners));
  let index = $state(0);
  let paused = $state(false);
  let expanded = $state(true);
  let ready = $state(false);

  $effect(() => {
    let cancelled = false;
    revalidate<BannerView[]>(API_ROUTES.activeBanners).then((fresh) => {
      if (!cancelled && fresh && fresh.length > 0) list = fresh;
    });
    return () => {
      cancelled = true;
    };
  });

  /* Read the stored preference once the island is on the client. Doing this
     in an effect rather than at module scope keeps the first server-rendered
     frame stable and avoids a hydration mismatch. */
  $effect(() => {
    if (ready) return;
    try {
      if (localStorage.getItem(COLLAPSED_KEY) === '1') expanded = false;
    } catch {
      // Private browsing: just use the default.
    }
    ready = true;
  });

  // Clamp if the list shrinks underneath us.
  $effect(() => {
    if (index > list.length - 1) index = 0;
  });

  /* Auto-rotate only while the banner is actually being shown. A collapsed
     strip rotating offers is just noise under the header. */
  $effect(() => {
    if (paused || !expanded || list.length < 2) return;

    const timer = setInterval(() => {
      index = (index + 1) % list.length;
    }, 9000);

    return () => clearInterval(timer);
  });

  const current = $derived(list[index] ?? null);
  const Component = $derived(current ? bannerComponent(current.template) : null);

  function toggleExpanded() {
    expanded = !expanded;
    try {
      localStorage.setItem(COLLAPSED_KEY, expanded ? '0' : '1');
    } catch {
      // Preference will not persist; the session still works.
    }
  }

  function dismiss() {
    if (!current) return;
    try {
      sessionStorage.setItem(HIDDEN_KEY, current.id);
    } catch {
      // Dismissal just will not persist.
    }
    list = list.filter((b) => b.id !== current!.id);
  }
</script>

{#if current && Component}
  <!-- Pausing uses pointer events, not mouse events: hovering is a pointer
       convenience with no keyboard equivalent, so it carries no accessibility
       contract. The keyboard half of the behaviour is onfocusin/out, which is
       what a keyboard user actually needs. -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="rail-wrap"
    class:rail-wrap--collapsed={!expanded}
    onpointerenter={() => (paused = true)}
    onpointerleave={() => (paused = false)}
    onfocusin={() => (paused = true)}
    onfocusout={() => (paused = false)}
  >
    {#if expanded}
      <Component banner={current} />
    {:else}
      <!-- Collapsed: one line. The offer is the only thing worth keeping. -->
      <div class="strip" style={`--accent:${current.tint?.accent ?? '#7A1F3D'}`}>
        <p class="strip-headline">{current.headline}</p>

        {#if current.percentOff > 0}
          <span class="strip-off">{current.percentOff}% off</span>
        {/if}

        <a class="strip-cta" href={current.ctaHref}>{current.ctaLabel}</a>
      </div>
    {/if}

    <div class="rail-controls">
      <button
        type="button"
        class="toggle"
        onclick={toggleExpanded}
        aria-expanded={expanded}
        aria-controls="banner-body"
      >
        <svg
          class="chev"
          class:chev--up={!expanded}
          viewBox="0 0 16 16"
          width="13"
          height="13"
          aria-hidden="true"
        >
          <path
            d="M3 6l5 5 5-5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"></path>
        </svg>
        {expanded ? 'Hide the banner' : 'Show the banner'}
      </button>

      {#if expanded}
        <div class="rail-right">
          {#if list.length > 1}
            <div class="dots" role="tablist" aria-label="Current promotions">
              {#each list as banner, i (banner.id)}
                <button
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Promotion ${i + 1}: ${banner.headline}`}
                  class="dot"
                  class:on={i === index}
                  onclick={() => (index = i)}
                ></button>
              {/each}
            </div>
          {/if}

          <button type="button" class="dismiss" onclick={dismiss}>
            Hide this
            <span class="visually-hidden">promotion</span>
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .rail-wrap { position: relative; }

  /* ── Collapsed strip ─────────────────────────────────────────────── */

  .strip {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: min(100% - 2rem, 68rem);
    margin-inline: auto;
    padding: 0.5rem 0.9rem;
    background: color-mix(in oklab, var(--accent) 10%, var(--color-paper));
    border: 1.5px solid color-mix(in oklab, var(--accent) 30%, transparent);
    border-radius: var(--radius-card);
  }

  .strip-headline {
    margin: 0;
    font-family: var(--font-display);
    font-variation-settings: 'SOFT' 35, 'WONK' 1, 'opsz' 20;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--accent);
    /* One line, ellipsised. A collapsed strip that wraps is not collapsed. */
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .strip-off {
    margin-left: auto;
    flex-shrink: 0;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  .strip-cta {
    flex-shrink: 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 2px;
    white-space: nowrap;
  }

  @media (max-width: 520px) {
    /* Headline plus offer only; the button is a whole extra line otherwise. */
    .strip-cta { display: none; }
  }

  /* ── Controls ────────────────────────────────────────────────────── */

  .rail-controls {
    width: min(100% - 2.5rem, 68rem);
    margin-inline: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding-block: 0.4rem;
  }

  .rail-right {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .dots { display: flex; gap: 0.4rem; }

  .dot {
    width: 0.55rem;
    height: 0.55rem;
    padding: 0;
    border-radius: 999px;
    border: 1.5px solid var(--color-rose);
    background: transparent;
    transition: background-color 140ms ease, transform 140ms ease;
  }

  .dot.on {
    background: var(--color-rose);
    transform: scale(1.15);
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    border: 0;
    background: none;
    padding: 0.2rem 0;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-ink-faint);
    cursor: pointer;
  }

  .toggle:hover { color: var(--color-rose-deep); }

  .chev {
    transition: transform 160ms ease;
  }

  /* The chevron points at what the button will do, not at where it is. */
  .chev--up { transform: rotate(180deg); }

  .dismiss {
    border: 0;
    background: none;
    padding: 0.25rem;
    font-size: 0.75rem;
    color: var(--color-ink-faint);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }

  .dismiss:hover { color: var(--color-rose-deep); }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
