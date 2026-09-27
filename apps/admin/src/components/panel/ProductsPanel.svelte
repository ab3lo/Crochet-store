<!--
  Catalogue panel: list, create, edit, upload, delete.

  Uploads are written into `apps/web/public/images/products/` by the panel and
  committed by a publish, so an image and the product it belongs to change
  together in one commit. Images are managed as an ordered list because the
  first one is what the grid shows.

  ## Nothing here publishes

  Every action in this panel writes to the local database. The site changes
  when Publish is pressed, in the dashboard header. So none of the messages
  below claim a product is visible — they say it is saved locally, and the
  header carries the one thing that does claim the site has changed.
-->

<script lang="ts">
  import type { Category, ProductView } from '@crochet/shared';
  import { CATEGORIES, money } from '@crochet/shared';
  import { adminFetch } from '@/lib/api';
  import { createFlash } from '@/lib/flash.svelte';
  import ProductForm from './ProductForm.svelte';

  type Draft = Partial<ProductView> & { id?: string };

  interface Props {
    /**
     * Called after any successful write. The dashboard uses it to refresh the
     * publish bar — without it, "last edited" sits at its old value after an
     * edit, which reads as the change not having registered.
     */
    onChanged?: () => void;
  }

  let { onChanged = () => {} }: Props = $props();

  let products = $state<ProductView[]>([]);
  let loading = $state(true);
  const flash = createFlash();
  let editing = $state<Draft | null>(null);
  let filter = $state<'' | Category>('');
  let search = $state('');

  const CATEGORY_LABELS: Record<Category, string> = {
    keychains: 'Keychains',
    bags: 'Bags',
    purses: 'Purses',
    bouquets: 'Bouquets',
    custom: 'Custom',
  };

  /**
   * Load the whole catalogue. Once, and again after any mutation.
   *
   * This used to take the current `filter` and `search` and send them as query
   * params, and the `$effect` below therefore depended on both — so every
   * keystroke in the search box fired a request, and because nothing ordered
   * the responses a slow one could land last and leave `products` holding the
   * result for a query the user had already finished typing.
   *
   * Both params were redundant anyway: the `visible` derived below already
   * filters this exact array by category and by name/tagline. So the server
   * was being asked to do a subset of work the client was about to redo, on
   * every character, racily. Dropping them deletes the requests, the race and
   * the params in one go — and with nothing read synchronously, the effect
   * below has no dependencies and runs once.
   */
  async function load() {
    loading = true;

    const { data, error } = await adminFetch<ProductView[]>(
      '/api/admin/products?includeHidden=true',
    );

    if (data) products = data;
    else if (error) flash.show('bad', error);

    loading = false;
  }

  $effect(() => {
    void load();
  });

  /**
   * Swap one row for the server's version of it, without re-fetching.
   *
   * Every write endpoint already returns the row it wrote, so re-reading the
   * whole catalogue afterwards was a second round trip for data we were already
   * holding. That is what made saving feel slow: the list lagged behind the
   * dialog closing, and the publish bar's "last edited" stamp did not move
   * until something unrelated happened to refresh it.
   *
   * Falls back to a full `load()` if the server sends no row, so a future
   * endpoint change degrades to "slower" rather than "wrong".
   */
  function mergeProduct(updated: ProductView) {
    const known = products.some((p) => p.id === updated.id);
    products = known
      ? products.map((p) => (p.id === updated.id ? updated : p))
      : [updated, ...products];
    onChanged();
  }

  async function remove(product: ProductView) {
    const ok = confirm(
      `Delete "${product.name}"? It cannot be undone, and any promotion using it will be updated.`,
    );
    if (!ok) return;

    const { error } = await adminFetch(`/api/admin/products/${product.id}`, {
      method: 'DELETE',
    });

    flash.show(
      error ? 'bad' : 'ok',
      error ?? `Deleted ${product.name} from the local catalogue. Publish to take it off the shop.`,
    );

    if (error) await load();
    else products = products.filter((p) => p.id !== product.id);

    onChanged();
  }

  async function toggleHidden(product: ProductView) {
    const { data, error } = await adminFetch<{ product: ProductView }>(
      `/api/admin/products/${product.id}`,
      { method: 'PATCH', json: { hidden: !product.hidden } },
    );

    if (error) return flash.show('bad', error);

    // Hiding a product *removes* it from the storefront, so it is a real change
    // — but still only a change locally until published.
    flash.show(
      'ok',
      product.hidden
        ? `${product.name} will show on the shop again once published.`
        : `${product.name} hidden locally. Publish to take it off the shop.`,
    );

    if (data?.product) mergeProduct(data.product);
    else await load();
  }

  const visible = $derived(
    products.filter((p) => {
      if (filter && p.category !== filter) return false;
      if (!search.trim()) return true;
      const n = search.trim().toLowerCase();
      return p.name.toLowerCase().includes(n) || p.tagline.toLowerCase().includes(n);
    }),
  );
</script>

<div class="panel-head">
  <div>
    <h2>Catalogue</h2>
    <p class="muted">
      {visible.length} of {products.length} shown. Hidden pieces stay in the shop admin
      but disappear from the storefront.
    </p>
  </div>

  <button
    type="button"
    class="btn-stitch"
    onclick={() => (editing = { category: 'keychains', images: [], details: {}, stock: 0 })}
  >
    New piece
  </button>
</div>

{#if flash.notice}
  <p class="flash" class:flash--bad={flash.notice.tone === 'bad'} role="status">
    {flash.notice.text}
  </p>
{/if}

<div class="filters">
  <input
    type="search"
    placeholder="Search the catalogue"
    bind:value={search}
    aria-label="Search the catalogue"
  />

  <select bind:value={filter} aria-label="Filter by category">
    <option value="">All categories</option>
    {#each CATEGORIES as c (c)}
      <option value={c}>{CATEGORY_LABELS[c]}</option>
    {/each}
  </select>
</div>

{#if loading}
  <p class="muted">Loading…</p>
{:else if visible.length === 0}
  <p class="muted">Nothing here. Add a piece, or clear the filters.</p>
{:else}
  <ul class="list">
    {#each visible as product (product.id)}
      <li class="row" class:row--hidden={product.hidden}>
        <img
          src={product.images[0] ?? '/images/placeholder.svg'}
          alt=""
          width="56"
          height="56"
          loading="lazy"
        />

        <div class="row-body">
          <p class="row-name">
            {product.name}
            {#if product.hidden}<span class="badge badge--hidden">Hidden</span>{/if}
            {#if product.sale}<span class="badge badge--sale">{product.sale.percentOff}% off</span>{/if}
          </p>
          <p class="row-meta">
            {CATEGORY_LABELS[product.category]} ·
            {product.madeToOrder ? 'made on demand' : `${product.stock} in stock`} ·
            {money(product.priceCents)}
          </p>
        </div>

        <div class="row-actions">
          <button type="button" class="link" onclick={() => (editing = product)}>Edit</button>
          <button type="button" class="link" onclick={() => toggleHidden(product)}>
            {product.hidden ? 'Unhide' : 'Hide'}
          </button>
          <button type="button" class="link link--bad" onclick={() => remove(product)}>
            Delete
          </button>
        </div>
      </li>
    {/each}
  </ul>
{/if}

{#if editing}
  <ProductForm
    product={editing}
    onClose={() => (editing = null)}
    onSaved={(message, updated) => {
      editing = null;
      flash.show('ok', message);
      if (updated) mergeProduct(updated);
      else void load();
    }}
  />
{/if}

<style>
  .panel-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  h2 { margin: 0 0 0.2rem; font-size: 1.3rem; }

  .muted { margin: 0; font-size: 0.85rem; color: var(--color-ink-faint); }

  .flash {
    margin: 0 0 1rem;
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

  .filters { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; }

  .filters input,
  .filters select {
    font: inherit;
    font-size: 0.88rem;
    padding: 0.45rem 0.75rem;
    border-radius: 0.5rem;
    border: 1.5px solid color-mix(in oklab, var(--color-ink) 18%, transparent);
    background: var(--color-paper);
    color: var(--color-ink);
  }

  .filters input { flex: 1; min-width: 12rem; }

  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }

  .row {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.6rem 0.85rem;
    background: var(--color-paper);
    border: 1.5px solid color-mix(in oklab, var(--color-rose) 20%, transparent);
    border-radius: 0.5rem;
  }

  .row--hidden { opacity: 0.6; }

  .row img {
    width: 3.5rem;
    height: 3.5rem;
    object-fit: cover;
    border-radius: 0.4rem;
    background: var(--color-blush);
    flex-shrink: 0;
  }

  .row-body { flex: 1; min-width: 0; }

  .row-name {
    margin: 0;
    font-size: 0.92rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .row-meta { margin: 0.1rem 0 0; font-size: 0.78rem; color: var(--color-ink-faint); }

  .badge {
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 0.1rem 0.35rem;
    border-radius: 0.25rem;
  }

  .badge--hidden { background: var(--color-ink); color: var(--color-shell); }
  .badge--sale { background: var(--color-rose-deep); color: #fff; }

  .row-actions { display: flex; gap: 0.7rem; flex-shrink: 0; }

  .link {
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    font-size: 0.8rem;
    color: var(--color-ink-soft);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }

  .link:hover { color: var(--color-rose-deep); }
  .link--bad:hover { color: #a33a26; }

  @media (max-width: 560px) {
    .row { flex-wrap: wrap; }
    .row-actions { width: 100%; justify-content: flex-end; }
  }
</style>
