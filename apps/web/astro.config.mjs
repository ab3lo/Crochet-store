import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

const SITE = process.env.PUBLIC_SITE_URL ?? 'https://crochet-and-co.pages.dev';

export default defineConfig({
  site: SITE,

  // Every page is prerendered. The storefront is static HTML; all dynamism
  // comes from Svelte islands reading the API at runtime, and from the API
  // itself. `output: 'static'` is deliberate — never switch to 'server'.
  output: 'static',

  trailingSlash: 'never',

  integrations: [svelte(), sitemap()],

  vite: {
    plugins: [tailwindcss()],
    // Fail the build rather than silently shipping a broken island.
    build: { reportCompressedSize: false },
  },

  build: {
    inlineStylesheets: 'auto',
  },

  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },

  image: {
    // Product photos come from the Supabase CDN; the placeholders are local
    // SVG. Nothing is optimised at build time because the catalogue is
    // populated at runtime, after the build.
    domains: ['*.supabase.co'],
  },
});
