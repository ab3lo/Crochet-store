/**
 * Barrel for the banner components.
 *
 * Components should import from `./registry` (or a specific `.svelte` file)
 * rather than from here — see the note in `registry.ts` about the import
 * cycle that a barrel creates with `BannerRenderer`.
 */

export {
  BANNER_COMPONENTS,
  bannerComponent,
  type BannerComponent,
} from './registry';

export { default as BannerRenderer } from './BannerRenderer.svelte';
export { default as BloomBanner } from './BloomBanner.svelte';
export { default as MarqueeBanner } from './MarqueeBanner.svelte';
export { default as RibbonBanner } from './RibbonBanner.svelte';
export { default as StitchStripBanner } from './StitchStripBanner.svelte';
export { default as EditorialBanner } from './EditorialBanner.svelte';
