<!--
  Custom-order enquiries.

  Read as a queue, not a table: the brief is the point, so it gets the most
  space, and the status control is right next to it rather than in a column
  off to the side.
-->

<script lang="ts">
  import { adminFetch } from '@/lib/auth';
  import { createFlash } from '@/lib/flash.svelte';
  import { formatDateTime } from '@/lib/format';
  import {
    ORDER_STATUSES,
    ORDER_STATUS_LABELS,
    type Category,
    type CustomOrder,
    type OrderStatus,
  } from '@crochet/shared';

  const CATEGORY_LABELS: Record<Category, string> = {
    keychains: 'Keychains',
    bags: 'Bags',
    purses: 'Purses',
    bouquets: 'Bouquets',
    custom: 'Custom',
  };

  let orders = $state<CustomOrder[]>([]);
  let loading = $state(true);
  let filter = $state<OrderStatus | 'all'>('all');
  const flash = createFlash();
  let notes = $state<Record<string, string>>({});
  let expanded = $state<string | null>(null);

  async function load() {
    loading = true;
    const { data, error } = await adminFetch<CustomOrder[]>(
      `/api/admin/orders?status=${filter}`,
    );
    if (data) orders = data;
    else if (error) flash.show('bad', error);
    loading = false;
  }

  $effect(() => {
    void load();
  });

  async function setStatus(order: CustomOrder, status: OrderStatus) {
    const { error } = await adminFetch(`/api/admin/orders/${order.id}`, {
      method: 'PATCH',
      json: { status },
    });
    if (error) return flash.show('bad', error);
    flash.show('ok', `Moved to ${ORDER_STATUS_LABELS[status].toLowerCase()}.`);
    await load();
  }

  async function saveNote(order: CustomOrder) {
    const note = (notes[order.id] ?? '').trim();
    if (!note) return;

    const { error } = await adminFetch(`/api/admin/orders/${order.id}`, {
      method: 'PATCH',
      json: { adminNote: note },
    });
    if (error) return flash.show('bad', error);
    flash.show('ok', 'Note saved.');
  }

  function toggle(order: CustomOrder) {
    expanded = expanded === order.id ? null : order.id;
    if (expanded && notes[order.id] === undefined) {
      notes = { ...notes, [order.id]: order.adminNote ?? '' };
    }
  }
</script>

<div class="panel-head">
  <div>
    <h2>Enquiries</h2>
    <p class="muted">Every custom order form submission, newest first.</p>
  </div>

  <select bind:value={filter} aria-label="Filter by status">
    <option value="all">All</option>
    {#each ORDER_STATUSES as s (s)}
      <option value={s}>{ORDER_STATUS_LABELS[s]}</option>
    {/each}
  </select>
</div>

{#if flash.notice}
  <p class="flash" class:flash--bad={flash.notice.tone === 'bad'} role="status">
    {flash.notice.text}
  </p>
{/if}

{#if loading}
  <p class="muted">Loading…</p>
{:else if orders.length === 0}
  <p class="muted">Nothing here. Enquiries from the custom order form land in this list.</p>
{:else}
  <ul class="list">
    {#each orders as order (order.id)}
      <li class="enquiry">
        <button
          type="button"
          class="enquiry-head"
          onclick={() => toggle(order)}
          aria-expanded={expanded === order.id}
        >
          <span class="badge badge--{order.status}">{ORDER_STATUS_LABELS[order.status]}</span>
          <span class="who">{order.name}</span>
          <span class="what">
            {CATEGORY_LABELS[order.category] ?? order.category} ×{order.quantity}
            {#if order.budgetCents}&nbsp;· &nbsp;up to ${(order.budgetCents / 100).toFixed(0)}{/if}
          </span>
          <span class="when">{formatDateTime(order.createdAt)}</span>
        </button>

        {#if expanded === order.id}
          <div class="enquiry-body">
            <p class="brief">{order.brief}</p>

            <dl class="facts">
              <div>
                <dt>Email</dt>
                <dd><a href={`mailto:${order.email}`}>{order.email}</a></dd>
              </div>
              {#if order.contact}
                <div><dt>Contact</dt><dd>{order.contact}</dd></div>
              {/if}
              {#if order.needed_by}
                <div><dt>Needed by</dt><dd>{order.needed_by}</dd></div>
              {/if}
              <div><dt>Reference</dt><dd><code>{order.id.slice(0, 8).toUpperCase()}</code></dd></div>
            </dl>

            <div class="controls">
              <label for={`st-${order.id}`}>Status</label>
              <select
                id={`st-${order.id}`}
                value={order.status}
                onchange={(e) => setStatus(order, e.currentTarget.value)}
              >
                {#each ORDER_STATUSES as s (s)}
                  <option value={s}>{ORDER_STATUS_LABELS[s]}</option>
                {/each}
              </select>

              <button
                type="button"
                class="btn-stitch btn-stitch--ghost"
                onclick={() => saveNote(order)}
              >
                Save note
              </button>
            </div>

            <label for={`note-${order.id}`}>Private note</label>
            <textarea
              id={`note-${order.id}`}
              rows="3"
              bind:value={notes[order.id]}
              placeholder="Yarn quoted, colour agreed, advance received…"
            ></textarea>

            {#if order.adminNote && notes[order.id] !== order.adminNote}
              <p class="muted">Saved note: {order.adminNote}</p>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .panel-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
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

  .flash--bad { background: #fdf0ed; border-color: #e3b5aa; color: #8c3322; }

  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }

  .enquiry {
    background: var(--color-paper);
    border: 1.5px solid color-mix(in oklab, var(--color-rose) 20%, transparent);
    border-radius: 0.5rem;
    overflow: hidden;
  }

  .enquiry-head {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    width: 100%;
    padding: 0.7rem 0.9rem;
    font: inherit;
    text-align: left;
    background: none;
    border: 0;
    cursor: pointer;
    flex-wrap: wrap;
  }

  .enquiry-head:hover { background: color-mix(in oklab, var(--color-blush) 30%, transparent); }

  .who { font-size: 0.92rem; font-weight: 600; color: var(--color-ink); }
  .what { font-size: 0.8rem; color: var(--color-ink-soft); }
  .when { margin-left: auto; font-size: 0.75rem; color: var(--color-ink-faint); }

  .badge {
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 0.15rem 0.45rem;
    border-radius: 0.25rem;
  }

  .badge--new { background: #fdf1d8; color: #7a5a12; }
  .badge--in-progress { background: #dfe9f5; color: #2a4a6f; }
  .badge--shipped { background: #e6e0f5; color: #453a6f; }
  .badge--delivered { background: #dff0e2; color: #25603a; }
  .badge--declined { background: #f0e6e6; color: #7a4a4a; }

  .enquiry-body {
    display: grid;
    gap: 0.6rem;
    padding: 0.9rem;
    border-top: 1.5px solid color-mix(in oklab, var(--color-rose) 18%, transparent);
    background: color-mix(in oklab, var(--color-blush) 16%, var(--color-paper));
  }

  .brief { margin: 0; font-size: 0.9rem; line-height: 1.6; color: var(--color-ink); }

  .facts {
    display: grid;
    gap: 0.4rem 1rem;
    margin: 0;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    font-size: 0.8rem;
  }

  .facts > div { display: grid; gap: 0.1rem; }
  .facts dt { color: var(--color-ink-faint); font-size: 0.72rem; }
  .facts dd { margin: 0; color: var(--color-ink); }
  .facts a { color: var(--color-rose-deep); }

  code {
    font-family: ui-monospace, monospace;
    font-size: 0.85em;
    background: color-mix(in oklab, var(--color-blush) 60%, transparent);
    padding: 0.05rem 0.3rem;
    border-radius: 0.25rem;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .controls label { font-size: 0.8rem; font-weight: 600; color: var(--color-ink-soft); }

  select, textarea {
    font: inherit;
    font-size: 0.88rem;
    padding: 0.45rem 0.7rem;
    border-radius: 0.45rem;
    border: 1.5px solid color-mix(in oklab, var(--color-ink) 18%, transparent);
    background: var(--color-paper);
    color: var(--color-ink);
  }

  textarea { width: 100%; resize: vertical; line-height: 1.5; }

  select:focus, textarea:focus {
    outline: none;
    border-color: var(--color-rose);
  }

  .btn-stitch { font-size: 0.8rem; padding-block: 0.45rem; }
</style>
