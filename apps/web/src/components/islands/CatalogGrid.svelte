<!--
  Catalogue grid with filtering, sorting and search.

  The filter bar is real inputs on a URL that stays shareable: selecting a
  category rewrites the query string, so a filtered view can be linked to
  and survives a reload. The initial list is server-rendered by Astro, so
  the grid is in the HTML for crawlers; this island adds the interaction
  on top and only replaces the DOM when a filter changes.
-->

<script lang="ts">
  import type { Category, ProductView } from '@crochet/shared';
  import { CATEGORY_META } from '@crochet/shared';
  import { sortProducts, onSaleProducts } from '@/lib/api';
  import ProductCard from './ProductCard.svelte';

  interface Props {
    products: ProductView[];
    /** Locked to one category — the filter rail is then hidden. */
    lockedCategory?: Category;
  }

  let { products, lockedCategory = null }: Props = $props();

  type Sort = 'featured' | 'price-asc' | 'price-desc' | 'newest';

  const SORTS: { id: Sort; label: string }[] = [
    { id: 'featured', label: 'Featured' },
    { id: 'price-asc', label: 'Price, low to high' },
    { id: 'price-desc', label: 'Price, high to low' },
    { id: 'newest', label: 'Newest first' },
  ];

  // A snapshot of the incoming prop, not a live binding: `active` is the
  // user's filter selection and must not track the prop afterwards.
  const initialCategory = $state.snapshot(lockedCategory);
  let active = $state<Category | 'all'>(initialCategory ?? 'all');
  let sort = $state<Sort>('featured');
  let query = $state('');
  let reduced = $state(false);

  /* Read the URL once on mount, so a shared link opens filtered. */
  $effect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const cat = params.get('category');
    if (cat && !lockedCategory) {
      if (cat === 'all' || CATEGORY_META.some((c) => c.id === cat)) active = cat as Category | 'all';
    }
    const s = params.get('sort');
    if (s && SORTS.some((x) => x.id === s)) sort = s as Sort;
    if (params.get('sale') === '1') reduced = true;
  });

  /* Keep the address bar in step, without adding a history entry per
     keystroke. */
  $effect(() => {
    if (typeof window === 'undefined' || lockedCategory) return;
    const params = new URLSearchParams();
    if (active !== 'all') params.set('category', active);
    if (sort !== 'featured') params.set('sort', sort);
    if (reduced) params.set('sale', '1');
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  });

  const categories = $derived(
    CATEGORY_META.filter((c) => c.id !== 'custom' && products.some((p) => p.category === c.id)),
  );

  const visible = $derived.by(() => {
    const needle = query.trim().toLowerCase();

    let list = products.filter((p) => {
      if (active !== 'all' && p.category !== active) return false;
      if (reduced && !p.sale) return false;
      if (!needle) return true;
      return (
        p.name.toLowerCase().includes(needle) ||
        p.tagline.toLowerCase().includes(needle) ||
        p.description.toLowerCase().includes(needle)
      );
    });

    if (reduced && sort === 'featured') {
      // On the sale filter, "featured" means deepest discount.
      list = onSaleProducts(list);
    } else if (sort === 'price-asc') {
      list = [...list].sort(
        (a, b) => (a.sale?.salePriceCents ?? a.priceCents) - (b.sale?.salePriceCents ?? b.priceCents),
      );
    } else if (sort === 'price-desc') {
      list = [...list].sort(
        (a, b) => (b.sale?.salePriceCents ?? b.priceCents) - (a.sale?.salePriceCents ?? a.priceCents),
      );
    } else if (sort === 'newest') {
      list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } else {
      list = sortProducts(list);
    }

    return list;
  });

  /* This used to re-fetch the catalogue from the API whenever the category
     changed, with a generation token so a slow response could not overwrite a
     newer one, and an AbortController to cancel on unmount. All of that is
     gone.

     Filtering was already done client-side by the `visible` derived above —
     the fetch was a *refresh*, not the filter. With no API there is nothing to
     refresh from, and the products are baked into the page at build time, so
     the derived list is not merely equivalent to what the fetch produced, it
     is the same list without a round trip per category change.

     `loading` went with it. It existed to dim the grid and say "Checking for
     new pieces…" while a request was in flight. Filtering a list this size is
     synchronous, so that message would be a lie about work that is not
     happening. */
</script>

<div class="catalog">
  {#if !lockedCategory}
    <div class="controls">
      <div class="rail" role="group" aria-label="Filter by category">
        <button
          type="button"
          class="chip"
          class:on={active === 'all'}
          onclick={() => (active = 'all')}
          aria-pressed={active === 'all'}
        >Everything</button>

        {#each categories as cat (cat.id)}
          <button
            type="button"
            class="chip"
            class:on={active === cat.id}
            onclick={() => (active = cat.id)}
            aria-pressed={active === cat.id}
          >{cat.title}</button>
        {/each}

        <button
          type="button"
          class="chip chip--sale"
          class:on={reduced}
          onclick={() => (reduced = !reduced)}
          aria-pressed={reduced}
        >Reduced</button>
      </div>

      <div class="controls-right">
        <label class="search">
          <span class="visually-hidden">Search the shop</span>
          <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
            <circle
              cx="9"
              cy="9"
              r="5.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"></circle>
            <path
              d="M13.5 13.5L17 17"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"></path>
          </svg>
          <input
            type="search"
            placeholder="Search"
            bind:value={query}
            aria-label="Search the shop"
          />
        </label>

        <label class="sort">
          <span class="visually-hidden">Sort by</span>
          <select bind:value={sort} aria-label="Sort products">
            {#each SORTS as option (option.id)}
              <option value={option.id}>{option.label}</option>
            {/each}
          </select>
        </label>
      </div>
    </div>
  {/if}

  <p class="count" aria-live="polite">
    {visible.length}
    {visible.length === 1 ? 'piece' : 'pieces'}
    {#if active !== 'all'}
      in {CATEGORY_META.find((c) => c.id === active)?.title}
    {/if}
    {#if reduced}&nbsp;· reduced{/if}
  </p>

  {#if visible.length === 0}
    <div class="empty">
      <div class="chain-rule" aria-hidden="true"></div>
      <p>Nothing matches that yet.</p>
      <button
        type="button"
        class="btn-stitch btn-stitch--ghost"
        onclick={() => {
          active = 'all';
          reduced = false;
          query = '';
        }}
      >
        Show everything
      </button>
    </div>
  {:else}
    <ul class="grid">
      {#each visible as product (product.id)}
        <li>
          <ProductCard {product} />
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .catalog { display: grid; gap: 1.25rem; }

  .controls {
    display: grid;
    gap: 0.85rem;
  }

  @media (min-width: 860px) {
    .controls {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
    }
  }

  .chip {
    flex-shrink: 0;
    padding: 0.4rem 0.9rem;
    border-radius: 999px;
    border: 1.5px solid color-mix(in oklab, var(--color-ink) 16%, transparent);
    background: var(--color-paper);
    color: var(--color-ink-soft);
    font-size: 0.85rem;
    font-weight: 500;
    white-space: nowrap;
    transition: background-color 130ms ease, color 130ms ease, border-color 130ms ease;
  }

  .chip:hover { border-color: var(--color-rose); color: var(--color-ink); }

  .chip.on {
    background: var(--color-ink);
    border-color: var(--color-ink);
    color: var(--color-shell);
  }

  .chip--sale { border-style: dashed; }

  .controls-right { display: flex; gap: 0.5rem; }

  .search {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0 0.7rem;
    border-radius: 999px;
    border: 1.5px solid color-mix(in oklab, var(--color-ink) 16%, transparent);
    background: var(--color-paper);
    color: var(--color-ink-faint);
  }

  .search:focus-within { border-color: var(--color-rose); }

  .search input {
    border: 0;
    background: none;
    font: inherit;
    font-size: 0.85rem;
    color: var(--color-ink);
    width: 6rem;
    padding-block: 0.42rem;
  }

  .search input:focus { outline: none; }
  .search input::-webkit-search-cancel-button { -webkit-appearance: none; }

  .sort select {
    font: inherit;
    font-size: 0.85rem;
    padding: 0.42rem 0.6rem;
    border-radius: 999px;
    border: 1.5px solid color-mix(in oklab, var(--color-ink) 16%, transparent);
    background: var(--color-paper);
    color: var(--color-ink);
  }

  .count {
    margin: 0;
    font-size: 0.82rem;
    color: var(--color-ink-faint);
  }

  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 1.25rem;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  }

  /* A brief dim while revalidating, so a swap does not feel like a jump. */

  .empty {
    display: grid;
    justify-items: center;
    gap: 0.9rem;
    padding: 3rem 1rem;
    text-align: center;
  }

  .empty :global(.chain-rule) { width: min(100%, 14rem); }

  .empty p { margin: 0; color: var(--color-ink-soft); }

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
