<!--
  Admin dashboard: counters, then the three working areas.

  Tabs are real ARIA tabs with arrow-key movement, and the active panel is
  only rendered when selected so a broken product editor cannot take down
  the orders list.
-->

<script lang="ts">
  import type { AdminUser } from '@crochet/shared';
  import { adminFetch } from '@/lib/auth';
  import ProductsPanel from './ProductsPanel.svelte';
  import BannersPanel from './BannersPanel.svelte';
  import OrdersPanel from './OrdersPanel.svelte';

  interface Props {
    user: AdminUser;
    onSignOut: () => void;
    /** Demo mode: there is no session to end, so the control is hidden. */
    demo?: boolean;
  }

  let { user, onSignOut, demo = false }: Props = $props();

  type Tab = 'products' | 'banners' | 'orders';
  type Stats = {
    products: number;
    new_orders: number;
    subscribers: number;
    active_banners: number;
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'products', label: 'Catalogue' },
    { id: 'banners', label: 'Promotions' },
    { id: 'orders', label: 'Enquiries' },
  ];

  let tab = $state<Tab>('products');
  let stats = $state<Stats | null>(null);
  let tabRefs = $state<HTMLButtonElement[]>([]);

  $effect(() => {
    void adminFetch<Stats>('/api/admin/stats').then((r) => {
      if (r.data) stats = r.data;
    });
  });

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
      <span class="who">{user.email}</span>
      {#if !demo}
        <button type="button" class="top-link" onclick={onSignOut}>Sign out</button>
      {/if}
    </div>
  </header>

  <dl class="stats">
    <div><dt>Pieces listed</dt><dd>{stats?.products ?? '—'}</dd></div>
    <div><dt>Live promotions</dt><dd>{stats?.active_banners ?? '—'}</dd></div>
    <div><dt>New enquiries</dt><dd class:hot={(stats?.new_orders ?? 0) > 0}>{stats?.new_orders ?? '—'}</dd></div>
    <div><dt>Subscribers</dt><dd>{stats?.subscribers ?? '—'}</dd></div>
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
        {#if t.id === 'orders' && (stats?.new_orders ?? 0) > 0}
          <span class="pip">{stats?.new_orders}</span>
        {/if}
      </button>
    {/each}
  </div>

  {#if tab === 'products'}
    <div role="tabpanel" id="panel-products" aria-labelledby="tab-products">
      <ProductsPanel />
    </div>
  {:else if tab === 'banners'}
    <div role="tabpanel" id="panel-banners" aria-labelledby="tab-banners">
      <BannersPanel />
    </div>
  {:else}
    <div role="tabpanel" id="panel-orders" aria-labelledby="tab-orders">
      <OrdersPanel />
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

  .stats dd.hot { color: var(--color-rose-deep); }

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
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .tab:hover { color: var(--color-ink); }

  .tab.on {
    color: var(--color-ink);
    border-bottom-color: var(--color-rose);
    font-weight: 600;
  }

  .pip {
    min-width: 1.15rem;
    height: 1.15rem;
    padding-inline: 0.25rem;
    display: inline-grid;
    place-items: center;
    border-radius: 999px;
    background: var(--color-rose-deep);
    color: #fff;
    font-size: 0.68rem;
    font-weight: 700;
  }
</style>
