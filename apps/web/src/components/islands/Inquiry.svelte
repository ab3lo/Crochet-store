<!--
  WhatsApp enquiry composer.

  Replaces the old enquiry form. A form that posts to a database was the
  wrong shape for this shop: a one-person business answers every message by
  hand, and the conversation has to happen somewhere the maker actually
  looks. WhatsApp is that place. A contact form in a separate admin panel is
  a second inbox nobody wants.

  Three ways to start, all landing in the same conversation:

    1. Tap a common question — "different colours", "commission", and so on.
       Each one writes itself into the message, so the maker can see what was
       being asked without a round trip.
    2. Type your own.
    3. Do both.

  The message is assembled here rather than in the link, because the link has
  to be a plain string and a 2 KB query string is not something to build by
  hand. It opens with `wa.me`, which is WhatsApp's own click-to-chat — there
  is no API key involved and nothing to configure.

  If the API happens to be running, the same message is also recorded in the
  admin's enquiry list. That is a convenience, not a dependency: the redirect
  opens first and the record is fire-and-forget, so a missing or broken API
  never blocks the conversation.
-->

<script lang="ts">
  import type { Category, ProductView } from '@crochet/shared';
  import { CATEGORIES } from '@crochet/shared';
  import { SALES_REGION, whatsappUrl } from '@/lib/contact';

  interface Props {
    /** Prefill with the piece being viewed, so the message is about it. */
    product?: ProductView | null;
    /** Overrides the default "what would you like to ask about" heading. */
    title?: string;
  }

  let { product = null, title = 'Ask about anything' }: Props = $props();

  /**
   * Common openers. `body` is what lands in the message — written as a
   * question so it reads as something to answer rather than a label.
   */
  const TOPICS = [
    {
      id: 'colours',
      label: 'Different colours',
      body: 'Could you make this in other colours? What shades are available?',
    },
    {
      id: 'commission',
      label: 'Commission a piece',
      body: 'I would like to commission something custom.',
    },
    {
      id: 'stock',
      label: 'Is it ready?',
      body: 'Is this one ready now, or made to order? How long would it take?',
    },
    {
      id: 'delivery',
      label: 'Collection & delivery',
      body: `How does collection or local delivery in ${SALES_REGION.city} work?`,
    },
    {
      id: 'care',
      label: 'How do I care for it?',
      body: 'How should I wash and store it?',
    },
    {
      id: 'budget',
      label: 'Can it cost less?',
      body: 'Could you make it for a smaller budget? What would change?',
    },
  ] as const;

  type TopicId = (typeof TOPICS)[number]['id'];

  const CATEGORY_LABELS: Record<Category, string> = {
    keychains: 'keychains',
    bags: 'bags',
    purses: 'purses',
    bouquets: 'bouquets',
    custom: 'a custom piece',
  };

  let chosen = $state<Set<TopicId>>(new Set());
  let ownMessage = $state('');
  let kind = $state<Category>('custom');
  let name = $state('');

  function toggle(id: TopicId) {
    // Copy the set: mutating a $state Set in place does not trigger.
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    chosen = next;
  }

  const hasContent = $derived(chosen.size > 0 || ownMessage.trim().length > 0);

  const productUrl = $derived(
    product && typeof window !== 'undefined'
      ? `${window.location.origin}/product/${product.slug}/`
      : '',
  );

  /** The full message, in the order a person would say it. */
  const message = $derived.by(() => {
    const parts: string[] = [];

    if (name.trim()) parts.push(`Hello, this is ${name.trim()}.`);
    else parts.push('Hello!');

    const asked = TOPICS.filter((t) => chosen.has(t.id));
    if (asked.length > 0) {
      parts.push(`About ${CATEGORY_LABELS[kind]}:`, ...asked.map((t) => `• ${t.body}`));
    } else {
      parts.push(`I'm writing about ${CATEGORY_LABELS[kind]}.`);
    }

    if (product) parts.push(`Specifically: ${product.name}${productUrl ? `\n${productUrl}` : ''}`);

    const own = ownMessage.trim();
    if (own) parts.push(`What I wanted to ask:\n${own}`);

    parts.push(SALES_REGION.orderNote);

    return parts.join('\n\n');
  });

  const href = $derived(whatsappUrl(message));

  function openWhatsApp() {
    // The whole enquiry. There is nothing else to do — the conversation *is*
    // the record.
    //
    // This used to also fire a `POST /api/orders` whose result was explicitly
    // ignored, "best-effort copy for the admin's enquiry list". That is gone
    // with the API. A fire-and-forget write that nobody checked, duplicating
    // a conversation that was already happening on WhatsApp, was a liability
    // rather than a backup: it could fail silently, and the panel's copy could
    // disagree with the actual thread.
    //
    // Open synchronously. Any `await` before a `window.open` loses the user
    // gesture and the browser blocks the popup.
    window.open(href, '_blank', 'noopener,noreferrer');
  }
</script>

<div class="inquiry">
  <h2 class="inquiry-title">{title}</h2>
  <p class="inquiry-note">
    Pick anything that applies, or just write your own. It all arrives as one
    WhatsApp message.
  </p>

  <div class="field">
    <span class="label" id="kind-label">What is it about?</span>
    <div class="chips" role="group" aria-labelledby="kind-label">
      {#each CATEGORIES as c (c)}
        <button
          type="button"
          class="chip"
          class:on={kind === c}
          onclick={() => (kind = c)}
          aria-pressed={kind === c}
        >
          {CATEGORY_LABELS[c]}
        </button>
      {/each}
    </div>
  </div>

  <div class="field">
    <span class="label" id="topic-label">Common questions</span>
    <div class="chips chips--topics" role="group" aria-labelledby="topic-label">
      {#each TOPICS as topic (topic.id)}
        <button
          type="button"
          class="chip chip--topic"
          class:on={chosen.has(topic.id)}
          onclick={() => toggle(topic.id)}
          aria-pressed={chosen.has(topic.id)}
        >
          <span class="tick" aria-hidden="true">
            {#if chosen.has(topic.id)}
              <svg viewBox="0 0 14 14" width="11" height="11">
                <path
                  d="M2.5 7.2l3 3L11.5 4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                  stroke-linejoin="round"></path>
              </svg>
            {/if}
          </span>
          {topic.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="field">
    <label for="inq-own">Or write it yourself</label>
    <textarea
      id="inq-own"
      bind:value={ownMessage}
      rows="4"
      placeholder="Sizes, colours, a date you need it by, a wedding you are dressing…"
    ></textarea>
  </div>

  <div class="field field--narrow">
    <label for="inq-name">Your name <span class="optional">optional</span></label>
    <input id="inq-name" bind:value={name} autocomplete="name" placeholder="So I know who I am talking to" />
  </div>

  <div class="actions">
    <button
      type="button"
      class="btn-stitch"
      disabled={!hasContent}
      onclick={openWhatsApp}
    >
      <svg class="wa-mark" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m0 1.67c2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.25 8.24a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24"
        ></path>
      </svg>
      Send on WhatsApp
    </button>

    <p class="hint">
      {#if hasContent}
        Opens WhatsApp with your message ready to send.
      {:else}
        Pick a question or write something first.
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
    gap: 0.35rem;
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

  /* The tick is a fixed-width box whether or not it holds a glyph, so
     selecting a chip does not make the row jump sideways. */
  .tick {
    display: inline-grid;
    place-items: center;
    width: 0.9rem;
    height: 0.9rem;
    flex-shrink: 0;
    color: var(--color-rose-deep);
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

  .btn-stitch:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .wa-mark { flex-shrink: 0; }

  .hint { margin: 0; font-size: 0.78rem; color: var(--color-ink-faint); }
</style>
