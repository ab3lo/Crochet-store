<!--
  Product image gallery.

  Thumbnails as real buttons with roving arrow-key support. The large
  image is a plain <img> rather than a background so it gets alt text and
  participates properly in the accessibility tree.
-->

<script lang="ts">
  import type { ProductView } from '@crochet/shared';

  interface Props {
    product: ProductView;
  }

  let { product }: Props = $props();

  const images = $derived(
    product.images.length > 0 ? product.images : ['/images/placeholder.svg'],
  );

  let active = $state(0);
  let thumbs = $state<HTMLButtonElement[]>([]);

  // A new product (client-side navigation) resets the selection.
  $effect(() => {
    void product.id;
    active = 0;
  });

  function move(delta: number) {
    const next = (active + delta + images.length) % images.length;
    select(next);
  }

  function select(i: number) {
    active = i;
    thumbs[i]?.focus();
  }

  function onThumbKeydown(event: KeyboardEvent, i: number) {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      select(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      select(images.length - 1);
    }
  }
</script>

<div class="gallery">
  <div class="stage">
    <img
      src={images[active]}
      alt={`${product.name} — view ${active + 1} of ${images.length}`}
      width="600"
      height="750"
    />

    {#if images.length > 1}
      <div class="stage-controls">
        <button type="button" onclick={() => move(-1)} aria-label="Previous image">
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
            <path
              d="M12 4l-6 6 6 6"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"></path>
          </svg>
        </button>
        <button type="button" onclick={() => move(1)} aria-label="Next image">
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
            <path
              d="M8 4l6 6-6 6"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"></path>
          </svg>
        </button>
      </div>
    {/if}
  </div>

  {#if images.length > 1}
    <div class="thumbs" role="group" aria-label="Product images">
      {#each images as src, i (src)}
        <button
          type="button"
          class="thumb"
          class:on={i === active}
          onclick={() => select(i)}
          onkeydown={(e) => onThumbKeydown(e, i)}
          bind:this={thumbs[i]}
          aria-label={`Show image ${i + 1}`}
          aria-current={i === active}
          tabindex={i === active ? 0 : -1}
        >
          <img src={src} alt="" width="72" height="72" loading="lazy" />
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .gallery { display: grid; gap: 0.75rem; }

  .stage {
    position: relative;
    aspect-ratio: 4 / 5;
    background: color-mix(in oklab, var(--color-blush) 40%, var(--color-paper));
    border: 1.5px solid color-mix(in oklab, var(--color-rose) 24%, transparent);
    border-radius: var(--radius-card);
    overflow: hidden;
  }

  .stage img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .stage-controls {
    position: absolute;
    inset-inline: 0;
    bottom: 0.75rem;
    display: flex;
    justify-content: center;
    gap: 0.5rem;
  }

  .stage-controls button {
    display: grid;
    place-items: center;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 999px;
    border: 1.5px solid var(--color-ink);
    background: color-mix(in oklab, var(--color-paper) 92%, transparent);
    color: var(--color-ink);
  }

  .stage-controls button:hover { background: var(--color-paper); }

  .thumbs {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .thumb {
    width: 4.5rem;
    height: 4.5rem;
    padding: 0;
    border-radius: 0.5rem;
    border: 1.5px solid transparent;
    background: transparent;
    overflow: hidden;
    opacity: 0.65;
    transition: opacity 130ms ease, border-color 130ms ease;
  }

  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }

  .thumb:hover { opacity: 1; }

  .thumb.on {
    opacity: 1;
    border-color: var(--color-rose-deep);
  }
</style>
