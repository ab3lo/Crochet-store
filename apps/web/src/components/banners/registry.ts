/**
 * Banner registry.
 *
 * The one place that maps a `BannerTemplate` from the database to an actual
 * component. A banner row can therefore never reference a template that does
 * not exist — the type system and this map are in agreement.
 *
 * Kept separate from `index.ts` on purpose. `BannerRenderer.svelte` needs the
 * map, and `index.ts` re-exports `BannerRenderer`; if the renderer imported
 * from the barrel the two would form a cycle, which Vite's SSR loader
 * resolves badly in `astro dev` (a "Could not import ./banners" 500 on every
 * page). Components import from `./registry`, never from the barrel.
 *
 * Adding a template: add the key to `BANNER_TEMPLATES` in `@crochet/shared`,
 * write the component, then add it here. The admin picker is generated from
 * the same list, so nothing else needs touching.
 */

import type { Component } from 'svelte';
import type { BannerTemplate, BannerView } from '@crochet/shared';

import BloomBanner from './BloomBanner.svelte';
import MarqueeBanner from './MarqueeBanner.svelte';
import RibbonBanner from './RibbonBanner.svelte';
import StitchStripBanner from './StitchStripBanner.svelte';
import EditorialBanner from './EditorialBanner.svelte';

export type BannerComponent = Component<{ banner: BannerView; compact?: boolean }>;

export const BANNER_COMPONENTS: Record<BannerTemplate, BannerComponent> = {
  bloom: BloomBanner,
  marquee: MarqueeBanner,
  ribbon: RibbonBanner,
  'stitch-strip': StitchStripBanner,
  editorial: EditorialBanner,
};

/** Unknown templates fall back to the smallest, calmest component. */
export function bannerComponent(template: BannerTemplate): BannerComponent {
  return BANNER_COMPONENTS[template] ?? RibbonBanner;
}
