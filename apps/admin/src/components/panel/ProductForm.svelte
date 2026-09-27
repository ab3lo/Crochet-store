<!--
  Product create/edit form.

  A dialog, not a page — the list stays behind it. Focus is trapped, Escape
  closes, and the first field is focused on open. Prices are entered in
  major units because that is what a shopkeeper types, then converted to
  minor units on the way out so the database never sees a float.

  ## Saving is not publishing

  This form writes to the local database and stops there. It used to end with a
  deploy-hook call, so a save *was* a publish; that is no longer true, and the
  message at the end says so. A saved product is not on the shop until Publish
  is pressed, and telling the owner otherwise would be the most damaging lie
  this panel could tell.
-->

<script lang="ts">
  import type { Category, ProductView } from '@crochet/shared';
  import { CATEGORIES } from '@crochet/shared';
  import { adminFetch, uploadImage } from '@/lib/api';

  type Draft = Partial<ProductView> & { id?: string };

  interface Props {
    product: Draft;
    onClose: () => void;
    /**
     * Called after a successful write. `updated` is the row the server just
     * wrote, so the list can patch itself in place rather than re-fetching the
     * whole catalogue — which is what made a save feel like it hung.
     */
    onSaved: (message: string, updated: ProductView | null) => void;
  }

  let { product, onClose, onSaved }: Props = $props();

  // One snapshot of the incoming product, then every field is seeded from it.
  // A dialog is opened per product and closed on save, so seeding once is the
  // intent — but it has to be a *copy*. Aliasing the prop would make the
  // component track it, and a deep read of `initial` reads as capturing the
  // value rather than binding to it.
  const initial = $state.snapshot(product);

  const isNew = !initial.id;

  let name = $state(initial.name ?? '');
  let slug = $state(initial.slug ?? '');
  let tagline = $state(initial.tagline ?? '');
  let description = $state(initial.description ?? '');
  let price = $state(((initial.priceCents ?? 0) / 100).toString());
  let compareAt = $state(
    initial.compareAtCents ? (initial.compareAtCents / 100).toString() : '',
  );
  let category = $state<Category>(initial.category ?? 'keychains');
  let stock = $state(String(initial.stock ?? 0));
  let madeToOrder = $state(initial.madeToOrder ?? false);
  let hidden = $state(initial.hidden ?? false);
  let sortOrder = $state(String(initial.sortOrder ?? 0));
  let details = $state<[string, string][]>(
    Object.entries(initial.details ?? {}).map(([k, v]) => [k, v]),
  );
  let images = $state<string[]>(initial.images ?? []);

  /**
   * Set once the upload path has had to create the product server-side.
   * `initial.id` is fixed for the life of the dialog, so without this the
   * later Save would create a duplicate and fail on the unique slug.
   */
  let savedId = $state<string | undefined>(initial.id);

  let saving = $state(false);
  let error = $state('');
  let fields = $state<Record<string, string>>({});
  let uploading = $state(false);
  let uploadError = $state('');

  let dialog = $state<HTMLElement | null>(null);
  let firstInput = $state<HTMLInputElement | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);

  const CATEGORY_LABELS: Record<Category, string> = {
    keychains: 'Keychains',
    bags: 'Bags',
    purses: 'Purses',
    bouquets: 'Bouquets',
    custom: 'Custom orders',
  };

  /* Offer a slug from the name until the user edits it themselves. */
  let slugTouched = $state(!isNew);
  $effect(() => {
    if (slugTouched) return;
    slug.value = name.value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  });

  $effect(() => {
    queueMicrotask(() => firstInput?.focus());
  });

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialog) return;

    const focusables = dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;

    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function upload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    uploading = true;
    uploadError = '';

    // The filename stem comes from the slug, so a new product needs one
    // before the photo can be named. Create the row first — which is also
    // what the old flow did, for the same reason.
    if (!savedId) {
      const created = await adminFetch<{ id: string }>('/api/admin/products', {
        method: 'POST',
        json: payload(),
      });
      if (created.error || !created.data) {
        uploading = false;
        uploadError = created.error ?? 'Could not create the piece to attach the image to.';
        input.value = '';
        return;
      }
      // Remember it. The prop never changes, so without this the eventual
      // Save would POST a second product and collide on the slug.
      savedId = created.data.id;
    }

    try {
      const res = await uploadImage(file, slug.trim());

      if (res.error || !res.data) {
        uploadError = res.error ?? 'The upload did not go through.';
      } else {
        images = [...images, res.data.url];
        // Persist immediately so a later save does not drop the image.
        await adminFetch(`/api/admin/products/${savedId}`, {
          method: 'PATCH',
          json: { images },
        });
      }
    } finally {
      uploading = false;
      input.value = '';
    }
  }

  function payload() {
    const toCents = (v: string) => Math.max(0, Math.round(Number(v || 0) * 100));
    return {
      name: name.trim(),
      slug: slug.trim(),
      tagline: tagline.trim(),
      description: description.trim(),
      priceCents: toCents(price),
      compareAtCents: compareAt.trim() ? toCents(compareAt) : null,
      category,
      images,
      details: Object.fromEntries(
        details
          .filter(([k, v]) => k.trim() && v.trim())
          .map(([k, v]) => [k.trim(), v.trim()]),
      ),
      stock: Math.max(0, Number(stock || 0)),
      madeToOrder,
      hidden,
      sortOrder: Number(sortOrder || 0),
    };
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    saving = true;
    error = '';
    fields = {};

    const body = payload();

    // `savedId` rather than `initial.id`: an upload may have created the row
    // already, and POSTing again would hit the unique slug constraint.
    const res = savedId
      ? await adminFetch<{ id: string; product: ProductView }>(
          `/api/admin/products/${savedId}`,
          { method: 'PATCH', json: body },
        )
      : await adminFetch<{ id: string; product: ProductView }>('/api/admin/products', {
          method: 'POST',
          json: body,
        });

    saving = false;

    if (res.error) {
      error = res.error;
      fields = res.fields;
      return;
    }

    // "Saved" and "live" are different claims, and saying only "Saved" is the
    // one thing this panel must never do.
    onSaved(
      `${initial.id ? 'Saved' : 'Added'} ${name.trim()} to the local catalogue. ` +
        `Not on the shop yet — press Publish when you are ready.`,
      res.data?.product ?? null,
    );
  }

  function addDetail() {
    details = [...details, ['', '']];
  }

  function removeDetail(index: number) {
    details = details.filter((_, i) => i !== index);
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="scrim" role="presentation" onclick={onClose}></div>

<div
  class="pf-dialog"
  role="dialog"
  aria-modal="true"
  aria-labelledby="pf-title"
  bind:this={dialog}
>
  <form onsubmit={save} novalidate>
    <header class="head">
      <h2 id="pf-title">{isNew ? 'New piece' : `Edit ${initial.name}`}</h2>
      <button type="button" class="x" onclick={onClose} aria-label="Close">
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </button>
    </header>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    <div class="body">
      <div class="row">
        <div class="field">
          <label for="pf-name">Name</label>
          <input
            id="pf-name"
            bind:value={name}
            bind:this={firstInput}
            required
            aria-invalid={fields.name ? 'true' : undefined}
            aria-describedby={fields.name ? 'pf-name-err' : undefined}
          />
          {#if fields.name}<p class="field-error" id="pf-name-err">{fields.name}</p>{/if}
        </div>

        <div class="field">
          <label for="pf-slug">URL</label>
          <input
            id="pf-slug"
            bind:value={slug}
            oninput={() => (slugTouched = true)}
            required
            aria-invalid={fields.slug ? 'true' : undefined}
            aria-describedby={fields.slug ? 'pf-slug-err' : 'pf-slug-hint'}
          />
          {#if fields.slug}
            <p class="field-error" id="pf-slug-err">{fields.slug}</p>
          {:else}
            <p class="hint" id="pf-slug-hint">/product/{slug || 'your-piece'}</p>
          {/if}
        </div>
      </div>

      <div class="field">
        <label for="pf-tagline">Tagline</label>
        <input id="pf-tagline" bind:value={tagline} placeholder="One short line under the name" />
      </div>

      <div class="field">
        <label for="pf-description">Description</label>
        <textarea id="pf-description" bind:value={description} rows="6"></textarea>
        <p class="hint">Leave a blank line between paragraphs.</p>
      </div>

      <div class="row row--3">
        <div class="field">
          <label for="pf-price">Price</label>
          <input id="pf-price" type="number" step="0.01" min="0" bind:value={price} required />
        </div>
        <div class="field">
          <label for="pf-compare">Was <span class="optional">optional</span></label>
          <input id="pf-compare" type="number" step="0.01" min="0" bind:value={compareAt} />
        </div>
        <div class="field">
          <label for="pf-category">Category</label>
          <select id="pf-category" bind:value={category}>
            {#each CATEGORIES as c (c)}
              <option value={c}>{CATEGORY_LABELS[c]}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="row row--3">
        <div class="field">
          <label for="pf-stock">In stock</label>
          <input id="pf-stock" type="number" min="0" bind:value={stock} disabled={madeToOrder} />
        </div>
        <div class="field field--check">
          <label for="pf-mto">
            <input id="pf-mto" type="checkbox" bind:checked={madeToOrder} />
            Made to order
          </label>
        </div>
        <div class="field">
          <label for="pf-sort">Sort order</label>
          <input id="pf-sort" type="number" bind:value={sortOrder} />
        </div>
      </div>

      <div class="field field--check">
        <label for="pf-hidden">
          <input id="pf-hidden" type="checkbox" bind:checked={hidden} />
          Hide from the storefront
        </label>
      </div>

      <!-- Images -->
      <fieldset>
        <legend>Images</legend>

        {#if images.length > 0}
          <ul class="thumbs">
            {#each images as src, i (src)}
              <li>
                <img src={src} alt="" width="72" height="72" />
                {#if i === 0}<span class="lead">Main</span>{/if}
                <button
                  type="button"
                  class="thumb-x"
                  onclick={() => (images = images.filter((u) => u !== src))}
                  aria-label={`Remove image ${i + 1}`}
                >×</button>
              </li>
            {/each}
          </ul>
        {/if}

        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
          onchange={upload}
          bind:this={fileInput}
          disabled={uploading}
          aria-label="Add an image"
        />
        <p class="hint">
          JPEG, PNG, WebP, AVIF or GIF, up to 8 MB. The first image is the one the
          catalogue grid uses.
        </p>
        {#if uploading}<p class="hint">Uploading…</p>{/if}
        {#if uploadError}<p class="field-error" role="alert">{uploadError}</p>{/if}
      </fieldset>

      <!-- Details -->
      <fieldset>
        <legend>Details and care</legend>

        {#each details as [key, value], i (i)}
          <div class="detail-row">
            <input
              bind:value={details[i][0]}
              placeholder="Finished size"
              aria-label="Detail label"
            />
            <input bind:value={details[i][1]} placeholder="38 × 34 cm" aria-label="Detail value" />
            <button
              type="button"
              class="link"
              onclick={() => removeDetail(i)}
              aria-label="Remove this detail"
            >Remove</button>
          </div>
        {/each}

        <button type="button" class="link" onclick={addDetail}>Add a detail</button>
      </fieldset>
    </div>

    <footer class="foot">
      <button type="button" class="btn-stitch btn-stitch--ghost" onclick={onClose}>Cancel</button>
      <button type="submit" class="btn-stitch" disabled={saving}>
        {saving ? 'Saving' : isNew ? 'Add this piece' : 'Save changes'}
      </button>
    </footer>
  </form>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 70;
    background: color-mix(in oklab, var(--color-ink) 42%, transparent);
  }

  /**
   * `pf-dialog`, not `dialog`.
   *
   * Skeleton v5 ships a global `.dialog` rule for its own modal component:
   *
   *   .dialog { --dialog-translate: -50% -50%; translate: var(--dialog-translate);
   *             --dialog-width: fit-content; --dialog-max-width: 640px; ... }
   *
   * The admin inherits that CSS, because `app.css` imports the storefront's
   * `global.css` and the storefront uses Skeleton. The CSS `translate` property
   * and the `transform` property *compose*, so the two `translate(-50%, -50%)`
   * declarations stacked and the dialog was shifted by half its own size twice
   * over — landing at x:60 y:-307 instead of x:380 y:61, which put most of the
   * form off the top of the screen.
   *
   * The prefix is the fix. Renaming is cheaper than trying to out-specify a
   * framework class, and it cannot regress. It also means the next generic name
   * to reach for in here cannot do this again.
   */
  .pf-dialog {
    position: fixed;
    z-index: 71;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(100% - 2rem, 42rem);
    max-height: min(90dvh, 46rem);
    overflow-y: auto;
    background: var(--color-paper);
    border-radius: var(--radius-card);
    border: 1.5px solid color-mix(in oklab, var(--color-rose) 30%, transparent);
    box-shadow: 4px 4px 0 color-mix(in oklab, var(--color-rose) 26%, transparent);
  }

  form { display: grid; }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.25rem;
    border-bottom: 1.5px solid color-mix(in oklab, var(--color-rose) 20%, transparent);
  }

  .head h2 { margin: 0; font-size: 1.2rem; }

  .x {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 999px;
    border: 1.5px solid color-mix(in oklab, var(--color-ink) 20%, transparent);
    background: none;
    color: var(--color-ink);
    cursor: pointer;
  }

  .x:hover { background: var(--color-blush); }

  .error {
    margin: 0;
    padding: 0.6rem 1.25rem;
    background: #fdf0ed;
    border-bottom: 1.5px solid #e3b5aa;
    color: #8c3322;
    font-size: 0.85rem;
  }

  .body { display: grid; gap: 1rem; padding: 1.25rem; }

  .row { display: grid; gap: 1rem; grid-template-columns: 1fr; }

  @media (min-width: 620px) {
    .row { grid-template-columns: 1fr 1fr; }
    .row--3 { grid-template-columns: repeat(3, 1fr); }
  }

  .field { display: grid; gap: 0.25rem; align-content: start; }

  .field--check { align-self: end; padding-bottom: 0.5rem; }

  label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-ink-soft);
  }

  .field--check label {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-weight: 500;
    cursor: pointer;
  }

  .optional { font-weight: 400; color: var(--color-ink-faint); }

  /* The form uses untyped, number, checkbox and file inputs. `input:not([type])`
     covers the untyped ones, which is most of them. */
  input:not([type]),
  input[type='number'],
  input[type='file'] {
    font: inherit;
    font-size: 0.9rem;
    padding: 0.5rem 0.7rem;
    border-radius: 0.45rem;
    border: 1.5px solid color-mix(in oklab, var(--color-ink) 18%, transparent);
    background: var(--color-paper);
    color: var(--color-ink);
    width: 100%;
  }

  input[type='checkbox'] {
    width: auto;
    flex-shrink: 0;
  }

  textarea { resize: vertical; line-height: 1.5; }

  input:focus,
  textarea:focus {
    outline: none;
    border-color: var(--color-rose);
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-blush) 70%, transparent);
  }

  input[aria-invalid='true'] { border-color: #b4442f; }
  input:disabled { opacity: 0.5; }

  .hint { margin: 0; font-size: 0.75rem; color: var(--color-ink-faint); }

  .field-error { margin: 0; font-size: 0.78rem; color: #a33a26; }

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

  .thumbs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .thumbs li { position: relative; }

  .thumbs img {
    width: 4.5rem;
    height: 4.5rem;
    object-fit: cover;
    border-radius: 0.4rem;
    border: 1px solid color-mix(in oklab, var(--color-ink) 15%, transparent);
  }

  .lead {
    position: absolute;
    bottom: 0.2rem;
    left: 0.2rem;
    font-size: 0.6rem;
    font-weight: 700;
    background: var(--color-ink);
    color: var(--color-shell);
    padding: 0.05rem 0.25rem;
    border-radius: 0.2rem;
  }

  .thumb-x {
    position: absolute;
    top: -0.35rem;
    right: -0.35rem;
    width: 1.3rem;
    height: 1.3rem;
    border-radius: 999px;
    border: 0;
    background: var(--color-ink);
    color: var(--color-paper);
    font-size: 0.85rem;
    line-height: 1;
    cursor: pointer;
  }

  .detail-row {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.3fr) auto;
    gap: 0.4rem;
    align-items: center;
  }

  .link {
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    font-size: 0.8rem;
    color: var(--color-rose-deep);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }

  .foot {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    padding: 1rem 1.25rem;
    border-top: 1.5px solid color-mix(in oklab, var(--color-rose) 20%, transparent);
    background: color-mix(in oklab, var(--color-blush) 22%, var(--color-paper));
    position: sticky;
    bottom: 0;
  }

  .btn-stitch { font-size: 0.88rem; }
  .btn-stitch:disabled { opacity: 0.6; cursor: progress; }
</style>
