<!--
  Custom-order composer.

  Only used on the custom-orders page. It used to be a five-category picker
  plus six canned questions plus a textarea plus a name box, which produced a
  draft the customer then had to edit before sending — a form that does not
  submit a form.

  Now: one free-text box and three intents that change what the message opens
  with. The category chips went because they duplicated what the URL already
  says, and six canned questions were six ways to send the same vague message.
-->

<script lang="ts">
  import { whatsappHref } from '@/lib/contact';

  interface Props {
    title?: string;
  }

  let { title = 'Tell me what you have in mind' }: Props = $props();

  const INTENTS = [
    {
      id: 'commission',
      label: 'A whole new piece',
      text: "I'd like something made from scratch.",
    },
    {
      id: 'change',
      label: 'An existing piece, changed',
      text: "I'd like one of your existing pieces made differently.",
    },
    {
      id: 'quantity',
      label: 'Several of something',
      text: "I'd like to order several of the same piece.",
    },
  ] as const;

  type IntentId = (typeof INTENTS)[number]['id'];

  let intent = $state<IntentId>('commission');
  let details = $state('');
  let name = $state('');

  const seed = $derived(INTENTS.find((i) => i.id === intent)!.text);
  const body = $derived([seed, details.trim()].filter(Boolean).join(' '));

  const canSend = $derived(body.trim().length > 0);

  const href = $derived(
    whatsappHref({ kind: 'custom', text: body, name: name.trim() || undefined }),
  );
</script>

<div class="inquiry">
  <h2 class="inquiry-title">{title}</h2>
  <p class="inquiry-note">
    Tell me what you need and it arrives as one WhatsApp message, ready to send.
  </p>

  <div class="field">
    <span class="label" id="intent-label">What kind of order is this?</span>
    <div class="chips" role="group" aria-labelledby="intent-label">
      {#each INTENTS as i (i.id)}
        <button
          type="button"
          class="chip"
          class:on={intent === i.id}
          onclick={() => (intent = i.id)}
          aria-pressed={intent === i.id}
        >
          {i.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="field">
    <label for="inq-own">What would you like made?</label>
    <textarea
      id="inq-own"
      bind:value={details}
      rows="5"
      placeholder="Colours, size, a date you need it by, a wedding you are dressing…"
    ></textarea>
  </div>

  <div class="field field--narrow">
    <label for="inq-name">Your name <span class="optional">optional</span></label>
    <input id="inq-name" bind:value={name} autocomplete="name" placeholder="So I know who I am talking to" />
  </div>

  <div class="actions">
    <a
      class="btn-stitch"
      class:disabled={!canSend}
      aria-disabled={!canSend}
      onclick={(e) => !canSend && e.preventDefault()}
      {href}
      target="_blank"
      rel="noopener noreferrer"
    >
      <svg class="wa-mark" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m0 1.67c2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.25 8.24a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24"
        ></path>
      </svg>
      Send on WhatsApp
    </a>

    <p class="hint">
      {#if canSend}
        Opens WhatsApp with your message ready to send.
      {:else}
        Write a line about what you need first.
      {/if}
    </p>
  </div>
</div>

<style>
  .inquiry {
    display: grid;
    gap: 1.15rem;
    padding: 1.5rem;
    background: var(--color-paper);
    border: 1.5px solid color-mix(in oklab, var(--color-rose) 26%, transparent);
    border-radius: var(--radius-card);
    box-shadow: 3px 3px 0 color-mix(in oklab, var(--color-rose) 24%, transparent);
  }

  .inquiry-title {
    margin: 0;
    font-size: 1.35rem;
    font-variation-settings: 'SOFT' 45, 'WONK' 1, 'opsz' 36;
  }

  .inquiry-note {
    margin: -0.6rem 0 0;
    font-size: 0.88rem;
    line-height: 1.5;
    color: var(--color-ink-soft);
  }

  .field { display: grid; gap: 0.4rem; }

  .label,
  label {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--color-ink-soft);
  }

  .optional { font-weight: 400; color: var(--color-ink-faint); }

  /* ── Chips ─────────────────────────────────────────────────────── */

  .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }

  .chip {
    display: inline-flex;
    align-items: center;
    padding: 0.4rem 0.8rem;
    border-radius: 999px;
    border: 1.5px solid color-mix(in oklab, var(--color-ink) 16%, transparent);
    background: var(--color-paper);
    color: var(--color-ink-soft);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 130ms ease, color 130ms ease, border-color 130ms ease;
  }

  .chip:hover { border-color: var(--color-rose); color: var(--color-ink); }

  .chip.on {
    background: color-mix(in oklab, var(--color-blush) 75%, var(--color-paper));
    border-color: var(--color-rose-deep);
    color: var(--color-ink);
    font-weight: 600;
  }

  /* ── Fields ────────────────────────────────────────────────────── */

  textarea,
  input {
    font: inherit;
    font-size: 0.92rem;
    padding: 0.6rem 0.85rem;
    border-radius: 0.5rem;
    border: 1.5px solid color-mix(in oklab, var(--color-ink) 18%, transparent);
    background: var(--color-paper);
    color: var(--color-ink);
    width: 100%;
  }

  .field--narrow { max-width: 22rem; }

  textarea { resize: vertical; line-height: 1.55; }

  textarea:focus,
  input:focus {
    outline: none;
    border-color: var(--color-rose);
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-blush) 70%, transparent);
  }

  /* ── Actions ───────────────────────────────────────────────────── */

  .actions { display: grid; gap: 0.5rem; justify-items: start; }

  /* An anchor cannot be `:disabled`, so the blocked state is a class. It also
     has to stop the navigation, not just look inert — see `onclick`. */
  .btn-stitch.disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .wa-mark { flex-shrink: 0; }

  .hint { margin: 0; font-size: 0.78rem; color: var(--color-ink-faint); }
</style>
