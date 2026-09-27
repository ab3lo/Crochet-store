<!--
  Admin dashboard: the publish bar, the counters, and the two working areas.

  ## The publish bar is the most important thing on this screen

  Everything below it writes to a local database. The shop is a static build
  of `catalog.json`, and that file only changes when someone presses Publish,
  which commits it and pushes, which is what makes Cloudflare rebuild.

  So this component owns the one piece of state that distinguishes "I have made
  changes" from "the shop has my changes", and it is deliberately the loudest,
  most permanent element on the page — a status strip, not a toast.

  The two timestamps underneath it are the same idea made concrete:

      last edited   12:04
      last published 11:30

  When the first is later than the second, the shop is behind the database,
  and that is stated in words rather than left for the owner to infer from a
  timestamp.

  ## Access control

  There is none, and that is the design. This server binds to 127.0.0.1 and
  nothing else can reach it — no password, no session, no token. The previous
  version had Better Auth with four tables, cookie sessions, CSRF origin
  checks and a role column, protecting a route only its owner could use, on a
  site whose data was a public product list. All of that bought nothing that
  "there is no network path" does not buy for free.
-->

<script lang="ts">
  import { adminFetch } from '@/lib/api';
  import { createFlash } from '@/lib/flash.svelte';
  import type { PublishResult, PublishState } from '@/lib/publish';
  import ProductsPanel from './ProductsPanel.svelte';
  import BannersPanel from './BannersPanel.svelte';

  type Tab = 'products' | 'banners';

  type Stats = {
    products: number;
    hidden_products: number;
    live_banners: number;
    /** When `catalog.json` was last regenerated — i.e. the last publish. */
    publishedAt: string | null;
    /** Newest `updated_at` across the catalogue. */
    lastEditedAt: string | null;
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'products', label: 'Catalogue' },
    { id: 'banners', label: 'Promotions' },
  ];

  let tab = $state<Tab>('products');
  let stats = $state<Stats | null>(null);
  let tabRefs = $state<HTMLButtonElement[]>([]);

  let publishing = $state(false);
  let lastPublish = $state<PublishResult | null>(null);
  let blockers = $state<string[]>([]);
  const flash = createFlash(8000);

  async function loadStats() {
    const { data } = await adminFetch<Stats>('/api/admin/stats');
    if (data) stats = data;
  }

  $effect(() => {
    void loadStats();
  });

  /**
   * Keep the publish bar honest without anyone having to remember to refresh.
   *
   * The bar answers "is the site showing what I just typed?", and it was only
   * refreshed on mount and after a publish — so after an edit it sat at its old
   * timestamp, which looks exactly like the change not having registered. Two
   * fixes, both cheap because `/api/admin/stats` is a ~5 ms local read:
   *
   *   • `onChanged` from the panels below refreshes it the moment a write lands.
   *   • A 3-second poll catches anything this tab did not do — a change made in
   *     another tab, or by `bun run seed` in a terminal.
   *
   * Polling pauses while the tab is hidden, so a backgrounded panel costs
   * nothing. WebSockets or SSE would be the "proper" answer, and are absurd for
   * a single-user tool on loopback.
   */
  $effect(() => {
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void loadStats();
      }
    }, 3000);

    return () => clearInterval(timer);
  });

  /**
   * Are there local edits the shop has not seen?
   *
   * String comparison of two ISO timestamps is safe here precisely because
   * `nowIso()` always emits UTC with a `Z`, so the lexicographic order is the
   * chronological order. A timestamp written by hand in local time without a
   * zone would compare wrongly — hence the comment in `lib/db.ts` about only
   * ever writing through `nowIso()`.
   */
  const unpublished = $derived(
    stats?.lastEditedAt != null && stats?.publishedAt != null
      ? stats.lastEditedAt > stats.publishedAt
      : stats?.lastEditedAt != null,
  );

  const stateTone = $derived<Record<PublishState, 'ok' | 'warn' | 'bad'>>({
    pushed: 'ok',
    'committed-not-pushed': 'warn',
    'dirty-tree': 'warn',
    'nothing-to-publish': 'ok',
    failed: 'bad',
  });

  async function publishNow() {
    publishing = true;
    blockers = [];

    const { data, error, fields } = await adminFetch<PublishResult>('/api/admin/publish', {
      method: 'POST',
      json: {},
    });

    publishing = false;

    if (data) {
      lastPublish = data;
      if (data.state === 'pushed' || data.state === 'nothing-to-publish') {
        flash.show('ok', data.message);
      } else {
        flash.show('bad', data.message);
      }
    } else {
      // `dirty-tree` arrives as a 409 with the blockers in `fields`, because
      // a refusal is a normal answer rather than a server fault.
      const listed = fields?.blockers;
      blockers = listed ? listed.split('\n').filter(Boolean) : [];
      flash.show('bad', error ?? 'Publish failed.');
    }

    // Counters move on both outcomes: a successful publish advances
    // `publishedAt`, and a refusal means something is still unedited.
    await loadStats();
  }

  function onTabKey(event: KeyboardEvent, i: number) {
    const map: Record<string, number> = {
      ArrowRight: i + 1,
      ArrowLeft: i - 1,
      Home: 0,
      End: TABS.length - 1,
    };
    const next = map[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = (next + TABS.length) % TABS.length;
    tab = TABS[target]!.id;
    tabRefs[target]?.focus();
  }

  /** "2 minutes ago" / "3 days ago" — a human-scale hint beside each stamp. */
  function ago(iso: string | null): string {
    if (!iso) return 'never';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return 'just now';
    const mins = Math.floor(ms / 60_000);
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} h ago`;
    return `${Math.floor(hours / 24)} d ago`;
  }

  const clock = (iso: string | null): string =>
    iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
</script>

<div class="shell">
  <header class="top">
    <div class="top-brand">
      <svg viewBox="0 0 34 20" width="28" height="17" aria-hidden="true">
        <path
          d="M2 17 Q9 3 17 17 Q25 3 32 17"
          fill="none"
          stroke="var(--color-rose)"
          stroke-width="2.4"
          stroke-linecap="round"></path>
      </svg>
      <span>Shop admin</span>
    </div>

    <div class="top-right">
      <a class="top-link" href="/" target="_blank" rel="noopener">View the shop</a>
      <span class="who">local only</span>
    </div>
  </header>

  <!-- ── The publish bar ──────────────────────────────────────────── -->

  <section class="publish" aria-label="Publishing">
    <div class="publish-main">
      <div class="publish-copy">
        <p class="publish-title">
          {#if unpublished}
            <span class="dot dot--warn" aria-hidden="true"></span>
            The shop is behind this catalogue
          {:else}
            <span class="dot dot--ok" aria-hidden="true"></span>
            The shop matches this catalogue
          {/if}
        </p>

        <p class="publish-stamps">
          <span>
            last edited <strong>{clock(stats?.lastEditedAt ?? null)}</strong>
            <span class="muted">({ago(stats?.lastEditedAt ?? null)})</span>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            last published <strong>{clock(stats?.publishedAt ?? null)}</strong>
            <span class="muted">({ago(stats?.publishedAt ?? null)})</span>
          </span>
        </p>
      </div>

      <button
        type="button"
        class="btn-publish"
        onclick={publishNow}
        disabled={publishing}
        aria-describedby="publish-hint"
      >
        {publishing ? 'Publishing…' : unpublished ? 'Publish to the shop' : 'Check for changes'}
      </button>
    </div>

    <p id="publish-hint" class="publish-hint">
      Saving here changes this computer only. Publishing writes
      <code>catalog.json</code>, commits it, and pushes — the push is what makes
      Cloudflare rebuild the site, which takes a minute or two.
    </p>

    {#if lastPublish}
      <p
        class="publish-result"
        class:bad={stateTone[lastPublish.state] === 'bad'}
        class:warn={stateTone[lastPublish.state] === 'warn'}
        role="status"
      >
        {lastPublish.message}
      </p>
    {/if}

    {#if blockers.length > 0}
      <div class="blockers">
        <p>Uncommitted changes that are blocking the publish:</p>
        <ul>
          {#each blockers as b (b)}
            <li><code>{b}</code></li>
          {/each}
        </ul>
        <p class="muted">
          Commit or stash these, then publish again. A publish only ever commits the
          catalogue and your images — it will not sweep these in.
        </p>
      </div>
    {/if}
  </section>

  {#if flash.notice}
    <p class="flash" class:flash--bad={flash.notice.tone === 'bad'} role="status">
      {flash.notice.text}
    </p>
  {/if}

  <!-- ── Counters ──────────────────────────────────────────────────── -->

  <dl class="stats">
    <div><dt>Pieces listed</dt><dd>{stats?.products ?? '—'}</dd></div>
    <div><dt>Hidden</dt><dd>{stats?.hidden_products ?? '—'}</dd></div>
    <div><dt>Live promotions</dt><dd>{stats?.live_banners ?? '—'}</dd></div>
    <div>
      <dt>Orders</dt>
      <dd class="muted-dash" title="Orders are taken on WhatsApp">WhatsApp</dd>
    </div>
  </dl>

  <div class="tabs" role="tablist" aria-label="Admin sections">
    {#each TABS as t, i (t.id)}
      <button
        type="button"
        role="tab"
        id={`tab-${t.id}`}
        aria-selected={tab === t.id}
        aria-controls={`panel-${t.id}`}
        tabindex={tab === t.id ? 0 : -1}
        class="tab"
        class:on={tab === t.id}
        onclick={() => (tab = t.id)}
        onkeydown={(e) => onTabKey(e, i)}
        bind:this={tabRefs[i]}
      >
        {t.label}
      </button>
    {/each}
  </div>

  {#if tab === 'products'}
    <div role="tabpanel" id="panel-products" aria-labelledby="tab-products">
      <ProductsPanel onChanged={loadStats} />
    </div>
  {:else}
    <div role="tabpanel" id="panel-banners" aria-labelledby="tab-banners">
      <BannersPanel onChanged={loadStats} />
    </div>
  {/if}
</div>

<style>
  .shell {
    width: min(100% - 2rem, 68rem);
    margin-inline: auto;
    padding-block: 1.5rem 4rem;
  }

  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding-bottom: 1.25rem;
    border-bottom: 1.5px solid color-mix(in oklab, var(--color-rose) 20%, transparent);
  }

  .top-brand {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--font-display);
    font-variation-settings: 'SOFT' 35, 'WONK' 1, 'opsz' 24;
    font-weight: 600;
    font-size: 1.1rem;
  }

  .top-right { display: flex; align-items: center; gap: 0.9rem; flex-wrap: wrap; }

  .who { font-size: 0.82rem; color: var(--color-ink-faint); }

  .top-link {
    font-size: 0.85rem;
    color: var(--color-ink-soft);
    background: none;
    border: 0;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .top-link:hover { color: var(--color-rose-deep); }

  /* ── Publish bar ──────────────────────────────────────────────────── */

  .publish {
    margin: 1.25rem 0 0;
    padding: 1.1rem 1.25rem;
    background: var(--color-paper);
    border: 2px solid color-mix(in oklab, var(--color-rose) 30%, transparent);
    border-radius: var(--radius-card);
  }

  .publish-main {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .publish-copy { flex: 1; min-width: 14rem; }

  .publish-title {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1rem;
    font-weight: 600;
  }

  .dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 999px;
    flex-shrink: 0;
  }
  .dot--ok { background: #2f7a4d; }
  .dot--warn { background: #b5761d; }

  .publish-stamps {
    margin: 0.35rem 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: var(--color-ink-soft);
  }

  .publish-stamps strong { font-weight: 600; }

  .muted { color: var(--color-ink-faint); }

  .btn-publish {
    font: inherit;
    font-weight: 600;
    padding: 0.65rem 1.2rem;
    border: 0;
    border-radius: 0.5rem;
    background: var(--color-rose-deep);
    color: #fff;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-publish:hover:not(:disabled) { filter: brightness(1.08); }
  .btn-publish:disabled { opacity: 0.6; cursor: progress; }

  .btn-publish:focus-visible {
    outline: 2px solid var(--color-ink);
    outline-offset: 2px;
  }

  .publish-hint {
    margin: 0.75rem 0 0;
    font-size: 0.8rem;
    line-height: 1.55;
    color: var(--color-ink-faint);
  }

  /**
   * The `color` is set explicitly, and that is the point.
   *
   * This rule used to style only the background, so the text colour came from
   * whatever else styled a bare `code` element. Skeleton did, with
   * `--color-surface-950-50` — near-white — which against this pale background
   * rendered as an empty pink pill with invisible text.
   *
   * Skeleton is no longer imported (see `apps/web/src/styles/global.css` for
   * the whole story), so this would inherit correctly now. Setting `color`
   * anyway is one declaration, and it means a `<code>` here stays legible
   * whatever else lands in the cascade later.
   */
  .publish-hint code,
  .blockers code {
    font-family: ui-monospace, monospace;
    font-size: 0.85em;
    color: var(--color-ink-soft);
    background: color-mix(in oklab, var(--color-blush) 60%, transparent);
    padding: 0.05rem 0.3rem;
    border-radius: 0.25rem;
  }

  .publish-result {
    margin: 0.85rem 0 0;
    padding: 0.6rem 0.9rem;
    border-radius: 0.5rem;
    font-size: 0.85rem;
    line-height: 1.5;
    background: color-mix(in oklab, var(--color-blush) 55%, var(--color-paper));
    border: 1.5px solid color-mix(in oklab, var(--color-rose) 35%, transparent);
    white-space: pre-wrap;
  }

  .publish-result.warn {
    background: #fdf6ec;
    border-color: #e0c89a;
    color: #6b4d10;
  }

  .publish-result.bad {
    background: #fdf0ed;
    border-color: #e3b5aa;
    color: #8c3322;
  }

  .blockers {
    margin-top: 0.85rem;
    padding: 0.75rem 0.9rem;
    border-radius: 0.5rem;
    background: #fdf6ec;
    border: 1.5px solid #e0c89a;
    font-size: 0.82rem;
    color: #6b4d10;
  }

  .blockers p { margin: 0 0 0.4rem; }
  .blockers ul { margin: 0 0 0.5rem; padding-left: 1.1rem; }
  .blockers li { margin-bottom: 0.15rem; }

  .flash {
    margin: 1rem 0 0;
    padding: 0.6rem 0.9rem;
    border-radius: 0.5rem;
    font-size: 0.86rem;
    background: color-mix(in oklab, var(--color-blush) 60%, var(--color-paper));
    border: 1.5px solid color-mix(in oklab, var(--color-rose) 35%, transparent);
  }

  .flash--bad {
    background: #fdf0ed;
    border-color: #e3b5aa;
    color: #8c3322;
  }

  /* ── Counters ─────────────────────────────────────────────────────── */

  .stats {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
    margin: 1.25rem 0;
  }

  @media (min-width: 720px) { .stats { grid-template-columns: repeat(4, 1fr); } }

  .stats > div {
    padding: 0.8rem 1rem;
    border-radius: 0.5rem;
    background: var(--color-paper);
    border: 1.5px solid color-mix(in oklab, var(--color-rose) 20%, transparent);
  }

  .stats dt {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--color-ink-faint);
  }

  .stats dd {
    margin: 0.2rem 0 0;
    font-family: var(--font-display);
    font-variation-settings: 'SOFT' 45, 'WONK' 0, 'opsz' 30;
    font-size: 1.75rem;
    font-weight: 600;
    line-height: 1;
  }

  /* "WhatsApp" is prose, not a count — so it should not be set at display
     scale like the numbers around it. */
  .stats dd.muted-dash {
    font-size: 1.05rem;
    color: var(--color-ink-faint);
    padding-top: 0.45rem;
  }

  /* ── Tabs ─────────────────────────────────────────────────────────── */

  .tabs {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1.5px solid color-mix(in oklab, var(--color-rose) 20%, transparent);
    margin-bottom: 1.5rem;
  }

  .tab {
    position: relative;
    padding: 0.6rem 1rem;
    font: inherit;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--color-ink-soft);
    background: none;
    border: 0;
    border-bottom: 2px solid transparent;
    margin-bottom: -1.5px;
    cursor: pointer;
  }

  .tab:hover { color: var(--color-ink); }

  .tab.on {
    color: var(--color-ink);
    border-bottom-color: var(--color-rose);
    font-weight: 600;
  }
</style>
