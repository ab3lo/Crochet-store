import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * SvelteKit config for the local admin panel.
 *
 * The adapter is declared so `vite build` works if a production build is ever
 * wanted, but the normal way to run this tool is `bun run admin`, which is the
 * dev server. That is a deliberate choice, not an oversight: this panel has
 * exactly one user, on one machine, and adding a compile step between "I want
 * to change a price" and "I can change a price" buys nothing.
 *
 * `adapter-node` would otherwise be dead weight in the workspace, and a
 * workspace that declares a build step nobody runs is one more thing to
 * remember.
 */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),

    /**
     * `@/…` → `src/…`, which is the alias the storefront used (Astro's `@`
     * points at `src` too). The banner components and the panel components
     * were carried over without rewriting their imports, and every one of them
     * says `@/lib/…`. Declaring the alias here is one line; the alternative is
     * editing 2,600 lines of untouched component code to change a prefix.
     */
    alias: { '@': 'src' },

    /**
     * Serve the storefront's `public/` as this app's static assets.
     *
     * Product photos are committed files in `apps/web/public/images/products/`,
     * and the panel needs to show them — a product list with broken thumbnails
     * is not reviewable, and "is this the right photo?" is one of the reasons
     * you open the catalogue at all.
     *
     * Without this the panel's dev server 404s every `/images/…` request,
     * because its own static directory (`apps/admin/static`) does not exist.
     * The alternatives — a symlink, or copying images across at seed time —
     * both create a second copy of the shop's images that can drift. This
     * points at the one real directory.
     */
    files: { assets: '../web/public' },

    // The panel is a tool, not a shopfront. Nothing here should ever be
    // indexed, prefetched, or crawled — and because it is loopback-only that
    // is belt and braces, but the intent is worth stating in config.
    prerender: { entries: [] },
  },
};
