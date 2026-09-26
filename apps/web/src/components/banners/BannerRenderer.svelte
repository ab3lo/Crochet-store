<!--
  Renders whichever pre-made component a banner's `template` names.

  Exists so `.astro` pages can use a plain static import instead of
  reaching for a dynamically-resolved Svelte component. Astro can render a
  component from a variable, but its type inference cannot see through the
  `Component<Props>` generic, which shows up as a type error on every prop.
-->

<script lang="ts">
  import type { BannerView } from '@crochet/shared';
  // Import the registry directly, NOT `./index` — that would create a cycle
  // with this file and break the dev server's SSR loader.
  import { bannerComponent } from './registry';

  interface Props {
    banner: BannerView;
    /** Tighten the padding — used inside a product page. */
    compact?: boolean;
  }

  let { banner, compact = false }: Props = $props();

  const Component = $derived(bannerComponent(banner.template));
</script>

<Component {banner} {compact} />
