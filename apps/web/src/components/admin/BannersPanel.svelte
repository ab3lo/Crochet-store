<!--
  Promotions panel — the sales-banner feature.

  Flow the maker actually wants:
    1. Press "Generate a promotion". The API reads the live catalogue,
       works out what to push, picks one of the five pre-made components,
       drafts the copy and the discount, and explains itself.
    2. Review the draft. The rationale is shown in full, and every field
       stays editable — the generator proposes, the human decides.
    3. Pick which products it applies to. The preview updates live, using
       the real component, so you see what you are publishing.
    4. Publish, schedule, or leave it as a draft.

  Nothing goes live without an explicit save.
-->

<script lang="ts">
  import {
    BANNER_TEMPLATES,
    BANNER_TEMPLATE_META,
    CATEGORIES,
    type BannerTemplate,
    type BannerView,
    type ProductView,
  } from '@crochet/shared';
  import { adminFetch } from '@/lib/auth';
  import { createFlash } from '@/lib/flash.svelte';
  import { bannerComponent } from '@/components/banners/registry';
  import { formatDateTime } from '@/lib/format';
  import { publishMessage } from '@/lib/publish';
  import type { PublishState } from '@crochet/shared';

  type Draft = Partial<BannerView> & { id?: string };

  let banners = $state<BannerView[]>([]);
  let products = $state<ProductView[]>([]);
  let loading = $state(true);
  const flash = createFlash(6000);

  let draft = $state<Draft | null>(null);
  let generating = $state(false);
  let saving = $state(false);
  let fields = $state<Record<string, string>>({});
  let productQuery = $state('');

  const CATEGORY_LABELS: Record<string, string> = {
    keychains: 'Keychains',
    bags: 'Bags',
    purses: 'Purses',
    bouquets: 'Bouquets',
    custom: 'Custom',
  };

  async function load() {
    loading = true;
    const [b, p] = await Promise.all([
      adminFetch<BannerView[]>('/api/admin/banners'),
      adminFetch<ProductView[]>('/api/admin/products?includeHidden=false'),
    ]);
    if (b.data) banners = b.data;
    if (p.data) products = p.data;
    if (b.error) flash.show('bad', b.error);
    loading = false;
  }

  $effect(() => {
    void load();
  });

  /* ── Generate ─────────────────────────────────────────────────────── */

  async function generate(opts: { category?: string; noOccasion?: boolean } = {}) {
    generating = true;
    fields = {};

    const { data, error } = await adminFetch<{
      input: Draft;
      rationale: string;
      trigger: string;
    }>('/api/admin/banners/generate', { method: 'POST', json: opts });

    generating = false;

    if (error || !data) {
      flash.show('bad', error ?? 'The generator could not find anything to promote.');
      return;
    }

    // Open it as an unsaved draft with a forced-unique slug.
    draft = {
      ...data.input,
      slug: `${data.input.slug}-${Date.now().toString(36).slice(-3)}`,
      status: 'draft',
    };
  }

  /* ── Editing ──────────────────────────────────────────────────────── */

  function edit(banner: BannerView) {
    draft = { ...banner };
    fields = {};
    productQuery = '';
  }

  function newBanner() {
    draft = {
      name: '',
      slug: '',
      template: 'stitch-strip',
      status: 'draft',
      headline: '',
      subhead: '',
      ctaLabel: 'Shop the drop',
      ctaHref: '/category/keychains/',
      percentOff: 0,
      code: null,
      tint: null,
      productIds: [],
      startsAt: null,
      endsAt: null,
      rationale: null,
    };
    fields = {};
    productQuery = '';
  }

  function toggleProduct(id: string) {
    if (!draft) return;
    const set = new Set(draft.productIds ?? []);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    // Preserve the order they were clicked in — the editorial banner's
    // product rail follows it.
    draft.productIds = [...set];
  }

  /* ── Preview ──────────────────────────────────────────────────────── */

  const preview = $derived.by<BannerView | null>(() => {
    if (!draft) return null;
    const ids = draft.productIds ?? [];
    return {
      id: draft.id ?? 'preview',
      slug: draft.slug ?? 'preview',
      name: draft.name ?? 'Untitled promotion',
      template: draft.template ?? 'stitch-strip',
      status: draft.status ?? 'draft',
      headline: draft.headline || 'Your headline goes here',
      subhead: draft.subhead ?? '',
      ctaLabel: draft.ctaLabel || 'Shop the drop',
      ctaHref: draft.ctaHref || '/',
      percentOff: draft.percentOff ?? 0,
      code: draft.code ?? null,
      tint: draft.tint ?? null,
      productIds: ids,
      startsAt: draft.startsAt ?? null,
      endsAt: draft.endsAt ?? null,
      revision: draft.revision ?? 0,
      rationale: draft.rationale ?? null,
      createdAt: draft.createdAt ?? new Date().toISOString(),
      updatedAt: draft.updatedAt ?? new Date().toISOString(),
      isLive: false,
      salePriceCents: null,
      products: ids
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is ProductView => Boolean(p))
        .map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          priceCents: p.priceCents,
          compareAtCents: p.compareAtCents,
          images: p.images,
        })),
    };
  });

  const PreviewComponent = $derived(draft ? bannerComponent(draft.template ?? 'stitch-strip') : null);

  const filteredProducts = $derived(
    products.filter((p) =>
      productQuery.trim()
        ? p.name.toLowerCase().includes(productQuery.trim().toLowerCase()) ||
          CATEGORY_LABELS[p.category]?.toLowerCase().includes(productQuery.trim().toLowerCase())
        : true,
    ),
  );

  /* ── Save ─────────────────────────────────────────────────────────── */

  async function save(publish: boolean) {
    if (!draft) return;
    saving = true;
    fields = {};

    const body = {
      name: draft.name?.trim(),
      slug: draft.slug?.trim(),
      template: draft.template,
      status: publish ? 'live' : (draft.status ?? 'draft'),
      headline: draft.headline?.trim(),
      subhead: draft.subhead?.trim() ?? '',
      ctaLabel: draft.ctaLabel?.trim() || 'Shop the drop',
      ctaHref: draft.ctaHref?.trim() || '/',
      percentOff: Number(draft.percentOff ?? 0),
      code: draft.code?.trim() ? draft.code.trim().toUpperCase() : null,
      tint: draft.tint ?? null,
      productIds: draft.productIds ?? [],
      startsAt: draft.startsAt ?? null,
      endsAt: draft.endsAt ?? null,
      rationale: draft.rationale ?? null,
    };

    const res = draft.id
      ? await adminFetch<BannerView & { publish: PublishState }>(
          `/api/admin/banners/${draft.id}`,
          { method: 'PATCH', json: body },
        )
      : await adminFetch<{ publish: PublishState }>('/api/admin/banners', {
          method: 'POST',
          json: body,
        });

    saving = false;

    if (res.error) {
      fields = res.fields;
      flash.show('bad', res.error);
      return;
    }

    const name = body.name || 'Promotion';
    const subject = publish ? `${name} is live.` : `${name} saved as a draft.`;
    draft = null;
    // A promotion that is "live" in the database but not yet on the site is
    // the exact confusion this message exists to prevent.
    flash.show('ok', res.data?.publish ? publishMessage(res.data.publish, subject) : subject);
    await load();
  }

  async function remove(banner: BannerView) {
    if (!confirm(`Delete "${banner.name}"?`)) return;
    const { data, error } = await adminFetch<{ publish: PublishState }>(
      `/api/admin/banners/${banner.id}`,
      { method: 'DELETE' },
    );
    if (error) return flash.show('bad', error);
    flash.show(
      'ok',
      data?.publish
        ? publishMessage(data.publish, `Deleted ${banner.name}.`)
        : `Deleted ${banner.name}.`,
    );
    await load();
  }

  async function toggleLive(banner: BannerView) {
    const next = banner.status === 'live' ? 'draft' : 'live';
    const { data, error } = await adminFetch<{ publish: PublishState }>(
      `/api/admin/banners/${banner.id}`,
      { method: 'PATCH', json: { status: next } },
    );
    if (error) return flash.show('bad', error);

    const subject = next === 'live' ? `${banner.name} is live.` : `${banner.name} pulled.`;
    flash.show('ok', data?.publish ? publishMessage(data.publish, subject) : subject);
    await load();
  }

  const statusLabel: Record<string, string> = {
    draft: 'Draft',
    scheduled: 'Scheduled',
    live: 'Live',
    archived: 'Archived',
  };
</script>

<div class="panel-head">
  <div>
    <h2>Promotions</h2>
    <p class="muted">
      A promotion carries a discount onto the products you attach it to. The
      storefront shows it in the rail, stamps the reduced price on each product, and
      applies the code at checkout.
    </p>
  </div>

  <div class="head-actions">
    <button type="button" class="btn-stitch btn-stitch--ghost" onclick={newBanner}>
      Blank promotion
    </button>
    <button type="button" class="btn-stitch" onclick={() => generate()} disabled={generating}>
      {generating ? 'Reading the catalogue…' : 'Generate a promotion'}
    </button>
  </div>
</div>

<p class="muted gen-note">
  The generator looks at stock, age and the calendar, then drafts something for you to
  edit. It never publishes on its own.
</p>

{#if flash.notice}
  <p class="flash" class:flash--bad={flash.notice.tone === 'bad'} role="status">
    {flash.notice.text}
  </p>
{/if}

{#if loading}
  <p class="muted">Loading…</p>
{:else}
  <ul class="list">
    {#each banners as banner (banner.id)}
      <li class="row">
        <div class="row-top">
          <span class="badge badge--{banner.status}">{statusLabel[banner.status]}</span>
          <span class="row-name">{banner.name}</span>
          <span class="row-meta">
            {BANNER_TEMPLATE_META[banner.template]?.label ?? banner.template} ·
            {banner.percentOff > 0 ? `${banner.percentOff}% off` : 'no discount'} ·
            {banner.productIds.length} product{banner.productIds.length === 1 ? '' : 's'}
          </span>
        </div>

        {#if banner.rationale}
          <p class="rationale">{banner.rationale}</p>
        {/if}

        <div class="row-bottom">
          <span class="muted">
            {#if banner.endsAt}ends {formatDateTime(banner.endsAt)}{:else}no end date{/if}
          </span>
          <div class="row-actions">
            <button type="button" class="link" onclick={() => edit(banner)}>Edit</button>
            <button type="button" class="link" onclick={() => toggleLive(banner)}>
              {banner.status === 'live' ? 'Pull it' : 'Go live'}
            </button>
            <button type="button" class="link link--bad" onclick={() => remove(banner)}>
              Delete
            </button>
          </div>
        </div>
      </li>
    {:else}
      <li class="muted">No promotions yet. Generate one, or start blank.</li>
    {/each}
  </ul>
{/if}

<!-- ── Editor ─────────────────────────────────────────────────────────── -->
{#if draft}
  <div class="scrim" role="presentation" onclick={() => (draft = null)}></div>

  <div class="editor" role="dialog" aria-modal="true" aria-labelledby="ed-title">
    <header class="ed-head">
      <h2 id="ed-title">{draft.id ? `Edit ${draft.name}` : 'New promotion'}</h2>
      <button type="button" class="x" onclick={() => (draft = null)} aria-label="Close">×</button>
    </header>

    <div class="ed-body">
      {#if draft.rationale}
        <div class="rationale-box">
          <p class="rationale-title">Why the generator chose this</p>
          <p>{draft.rationale}</p>
        </div>
      {/if}

      <!-- Component picker -->
      <fieldset>
        <legend>Component</legend>
        <p class="hint">
          Five pre-made layouts. Each one is rendered exactly as the storefront will
          render it, in the preview below.
        </p>
        <div class="templates">
          {#each BANNER_TEMPLATES as t (t)}
            <button
              type="button"
              class="template"
              class:on={draft.template === t}
              onclick={() => (draft.template = t as BannerTemplate)}
              aria-pressed={draft.template === t}
            >
              <span class="template-name">{BANNER_TEMPLATE_META[t].label}</span>
              <span class="template-blurb">{BANNER_TEMPLATE_META[t].blurb}</span>
            </button>
          {/each}
        </div>
      </fieldset>

      <!-- Live preview -->
      <section class="preview">
        <h3 class="preview-title">Preview</h3>
        <div class="preview-frame">
          {#if preview && PreviewComponent}
            <PreviewComponent banner={preview} />
          {/if}
        </div>
      </section>

      <div class="row">
        <div class="field">
          <label for="ed-name">Internal name</label>
          <input id="ed-name" bind:value={draft.name} placeholder="Christmas gifting 2026" />
          {#if fields.name}<p class="field-error">{fields.name}</p>{/if}
        </div>
        <div class="field">
          <label for="ed-slug">URL slug</label>
          <input id="ed-slug" bind:value={draft.slug} />
          {#if fields.slug}<p class="field-error">{fields.slug}</p>{/if}
        </div>
      </div>

      <div class="field">
        <label for="ed-headline">Headline</label>
        <input id="ed-headline" bind:value={draft.headline} maxlength="90" />
        {#if fields.headline}<p class="field-error">{fields.headline}</p>{/if}
      </div>

      <div class="field">
        <label for="ed-subhead">Subhead <span class="optional">optional</span></label>
        <input id="ed-subhead" bind:value={draft.subhead} maxlength="160" />
      </div>

      <div class="row row--3">
        <div class="field">
          <label for="ed-off">Discount %</label>
          <input id="ed-off" type="number" min="0" max="90" bind:value={draft.percentOff} />
          {#if fields.percentOff}<p class="field-error">{fields.percentOff}</p>{/if}
        </div>
        <div class="field">
          <label for="ed-code">Code <span class="optional">optional</span></label>
          <input id="ed-code" bind:value={draft.code} placeholder="XMAS25" />
          {#if fields.code}<p class="field-error">{fields.code}</p>{/if}
        </div>
        <div class="field">
          <label for="ed-cta">Button label</label>
          <input id="ed-cta" bind:value={draft.ctaLabel} />
        </div>
      </div>

      <div class="field">
        <label for="ed-href">Button links to</label>
        <input id="ed-href" bind:value={draft.ctaHref} placeholder="/category/purses/" />
        {#if fields.ctaHref}<p class="field-error">{fields.ctaHref}</p>{/if}
      </div>

      <div class="row">
        <div class="field">
          <label for="ed-starts">Starts <span class="optional">optional</span></label>
          <input
            id="ed-starts"
            type="datetime-local"
            value={toLocalInput(draft.startsAt)}
            onchange={(e) => (draft.startsAt = fromLocalInput(e.currentTarget.value))}
          />
        </div>
        <div class="field">
          <label for="ed-ends">Ends <span class="optional">optional</span></label>
          <input
            id="ed-ends"
            type="datetime-local"
            value={toLocalInput(draft.endsAt)}
            onchange={(e) => (draft.endsAt = fromLocalInput(e.currentTarget.value))}
          />
        </div>
      </div>

      <!-- Product selection -->
      <fieldset>
        <legend>
          Applies to {draft.productIds?.length ?? 0} product{(draft.productIds?.length ?? 0) === 1 ? '' : 's'}
        </legend>

        <input
          type="search"
          placeholder="Filter products"
          bind:value={productQuery}
          aria-label="Filter products"
        />

        <ul class="picked">
          {#each draft.productIds ?? [] as id, i (id)}
            {@const p = products.find((x) => x.id === id)}
            {#if p}
              <li>
                <img src={p.images[0] ?? '/images/placeholder.svg'} alt="" width="32" height="32" />
                <span>{p.name}</span>
                <span class="muted">#{i + 1}</span>
                <button
                  type="button"
                  class="link"
                  onclick={() => toggleProduct(id)}
                  aria-label={`Remove ${p.name}`}
                >Remove</button>
              </li>
            {/if}
          {:else}
            <li class="muted">Nothing attached yet — a promotion with no products shows in the rail but discounts nothing.</li>
          {/each}
        </ul>

        <ul class="choices">
          {#each filteredProducts as p (p.id)}
            <li>
              <label>
                <input
                  type="checkbox"
                  checked={draft.productIds?.includes(p.id) ?? false}
                  onchange={() => toggleProduct(p.id)}
                />
                <img src={p.images[0] ?? '/images/placeholder.svg'} alt="" width="28" height="28" />
                <span class="choice-name">{p.name}</span>
                <span class="muted">
                  {CATEGORY_LABELS[p.category]} ·
                  {p.madeToOrder ? 'made to order' : `${p.stock} left`}
                </span>
              </label>
            </li>
          {/each}
        </ul>
        {#if fields.productIds}<p class="field-error">{fields.productIds}</p>{/if}
      </fieldset>
    </div>

    <footer class="ed-foot">
      <button type="button" class="btn-stitch btn-stitch--ghost" onclick={() => (draft = null)}>
        Cancel
      </button>
      <button
        type="button"
        class="btn-stitch btn-stitch--ghost"
        onclick={() => save(false)}
        disabled={saving}
      >
        Save as draft
      </button>
      <button type="button" class="btn-stitch" onclick={() => save(true)} disabled={saving}>
        {saving ? 'Saving' : 'Publish now'}
      </button>
    </footer>
  </div>
{/if}

<style>
  .panel-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }

  h2 { margin: 0 0 0.2rem; font-size: 1.3rem; }
  h3.preview-title { margin: 0 0 0.5rem; font-size: 0.95rem; }

  .head-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }

  .muted { margin: 0; font-size: 0.85rem; color: var(--color-ink-faint); }
  .panel-head .muted { max-width: 40rem; line-height: 1.55; }

  .gen-note { margin-bottom: 1.25rem; max-width: 40rem; line-height: 1.5; }

  .flash {
    margin: 0 0 1rem;
    padding: 0.6rem 0.9rem;
    border-radius: 0.5rem;
    font-size: 0.86rem;
    background: color-mix(in oklab, var(--color-blush) 60%, var(--color-paper));
    border: 1.5px solid color-mix(in oklab, var(--color-rose) 35%, transparent);
  }

  .flash--bad { background: #fdf0ed; border-color: #e3b5aa; color: #8c3322; }

  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }

  .row {
    padding: 0.85rem 1rem;
    background: var(--color-paper);
    border: 1.5px solid color-mix(in oklab, var(--color-rose) 20%, transparent);
    border-radius: 0.5rem;
  }

  .row-top { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }

  .row-name { font-size: 0.95rem; font-weight: 600; }
  .row-meta { font-size: 0.78rem; color: var(--color-ink-faint); }

  .badge {
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 0.15rem 0.45rem;
    border-radius: 0.25rem;
  }

  .badge--live { background: #dff0e2; color: #25603a; }
  .badge--draft { background: #eeeae6; color: #5d554e; }
  .badge--scheduled { background: #fdf1d8; color: #7a5a12; }
  .badge--archived { background: #f0e6e6; color: #7a4a4a; }

  .rationale {
    margin: 0.5rem 0 0;
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--color-ink-soft);
  }

  .row-bottom {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: 0.6rem;
  }

  .row-actions { display: flex; gap: 0.7rem; }

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

  /* ── Editor dialog ──────────────────────────────────────────────── */

  .scrim {
    position: fixed;
    inset: 0;
    z-index: 70;
    background: color-mix(in oklab, var(--color-ink) 42%, transparent);
  }

  .editor {
    position: fixed;
    z-index: 71;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(100% - 2rem, 52rem);
    max-height: 92dvh;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    background: var(--color-paper);
    border-radius: var(--radius-card);
    border: 1.5px solid color-mix(in oklab, var(--color-rose) 30%, transparent);
    box-shadow: 4px 4px 0 color-mix(in oklab, var(--color-rose) 26%, transparent);
  }

  .ed-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.9rem 1.25rem;
    border-bottom: 1.5px solid color-mix(in oklab, var(--color-rose) 20%, transparent);
  }

  .ed-head h2 { margin: 0; font-size: 1.1rem; }

  .x {
    width: 2rem;
    height: 2rem;
    border-radius: 999px;
    border: 1.5px solid color-mix(in oklab, var(--color-ink) 20%, transparent);
    background: none;
    font-size: 1.1rem;
    line-height: 1;
    color: var(--color-ink);
    cursor: pointer;
  }

  .x:hover { background: var(--color-blush); }

  .ed-body { display: grid; gap: 1.1rem; padding: 1.25rem; overflow-y: auto; }

  .rationale-box {
    padding: 0.75rem 0.9rem;
    border-radius: 0.5rem;
    background: color-mix(in oklab, var(--color-blush) 45%, var(--color-paper));
    border: 1.5px dashed color-mix(in oklab, var(--color-rose) 40%, transparent);
  }

  .rationale-box p { margin: 0; font-size: 0.82rem; line-height: 1.55; color: var(--color-ink-soft); }
  .rationale-title { font-weight: 700; color: var(--color-ink) !important; margin-bottom: 0.2rem !important; }

  fieldset {
    border: 1.5px solid color-mix(in oklab, var(--color-rose) 22%, transparent);
    border-radius: 0.5rem;
    padding: 0.9rem;
    margin: 0;
    display: grid;
    gap: 0.6rem;
  }

  legend {
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-ink-faint);
    padding-inline: 0.35rem;
  }

  .templates { display: grid; gap: 0.4rem; grid-template-columns: 1fr; }

  @media (min-width: 560px) { .templates { grid-template-columns: 1fr 1fr; } }

  .template {
    display: grid;
    gap: 0.15rem;
    padding: 0.6rem 0.7rem;
    text-align: left;
    border-radius: 0.45rem;
    border: 1.5px solid color-mix(in oklab, var(--color-ink) 15%, transparent);
    background: var(--color-paper);
    cursor: pointer;
  }

  .template:hover { border-color: var(--color-rose); }

  .template.on {
    border-color: var(--color-rose-deep);
    background: color-mix(in oklab, var(--color-blush) 40%, var(--color-paper));
  }

  .template-name { font-size: 0.88rem; font-weight: 600; color: var(--color-ink); }
  .template-blurb { font-size: 0.75rem; line-height: 1.4; color: var(--color-ink-faint); }

  .preview {
    border: 1.5px solid color-mix(in oklab, var(--color-rose) 22%, transparent);
    border-radius: 0.5rem;
    overflow: hidden;
  }

  .preview-title { padding: 0.6rem 0.9rem; border-bottom: 1.5px solid color-mix(in oklab, var(--color-rose) 18%, transparent); }
  .preview-frame { overflow-x: auto; }

  .row { display: grid; gap: 1rem; grid-template-columns: 1fr; }

  @media (min-width: 620px) {
    .row { grid-template-columns: 1fr 1fr; }
    .row--3 { grid-template-columns: repeat(3, 1fr); }
  }

  .field { display: grid; gap: 0.25rem; align-content: start; }

  label { font-size: 0.8rem; font-weight: 600; color: var(--color-ink-soft); }
  .optional { font-weight: 400; color: var(--color-ink-faint); }

  /* Only inputs: this panel has no <select> or <textarea> — the template
     picker is a button group and the code is a text input. */
  input {
    font: inherit;
    font-size: 0.9rem;
    padding: 0.5rem 0.7rem;
    border-radius: 0.45rem;
    border: 1.5px solid color-mix(in oklab, var(--color-ink) 18%, transparent);
    background: var(--color-paper);
    color: var(--color-ink);
    width: 100%;
  }

  input:focus {
    outline: none;
    border-color: var(--color-rose);
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-blush) 70%, transparent);
  }

  .hint { margin: 0; font-size: 0.75rem; color: var(--color-ink-faint); line-height: 1.45; }
  .field-error { margin: 0; font-size: 0.78rem; color: #a33a26; }

  .picked, .choices { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.3rem; }

  .picked li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
    border-radius: 0.35rem;
    background: color-mix(in oklab, var(--color-blush) 35%, var(--color-paper));
    font-size: 0.82rem;
  }

  .picked img, .choices img {
    width: 1.75rem;
    height: 1.75rem;
    object-fit: cover;
    border-radius: 0.25rem;
    flex-shrink: 0;
  }

  .choices { max-height: 14rem; overflow-y: auto; }

  .choices label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0.4rem;
    border-radius: 0.35rem;
    cursor: pointer;
    font-weight: 400;
    font-size: 0.82rem;
  }

  .choices label:hover { background: color-mix(in oklab, var(--color-blush) 30%, transparent); }
  .choices input { width: auto; flex-shrink: 0; }

  .choice-name { flex: 1; color: var(--color-ink); min-width: 0; }

  .ed-foot {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0.9rem 1.25rem;
    border-top: 1.5px solid color-mix(in oklab, var(--color-rose) 20%, transparent);
    background: color-mix(in oklab, var(--color-blush) 22%, var(--color-paper));
  }

  .btn-stitch { font-size: 0.85rem; }
  .btn-stitch:disabled { opacity: 0.6; cursor: progress; }
</style>

<!-- `datetime-local` needs a local-time string; the API stores ISO. -->
<script module lang="ts">
  function toLocalInput(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fromLocalInput(value: string): string | null {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
</script>
