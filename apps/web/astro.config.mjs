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

  integrations: [
    svelte(),
    // The admin shell is a real page, so the sitemap integration would list it
    // by default — while robots.txt disallows it. A disallowed URL in a
    // sitemap is a contradiction, and it invites indexing of the one page that
    // has no business being in a result.
    sitemap({ filter: (page) => !page.includes('/admin') }),
  ],

  vite: {
    plugins: [tailwindcss()],
    // Fail the build rather than silently shipping a broken island.
    build: { reportCompressedSize: false },
  },

  build: {
    inlineStylesheets: 'auto',

    // Emit `about.html`, not `about/index.html`.
    //
    // Astro's default `directory` format writes a folder per route, and
    // Cloudflare Pages canonicalises a folder to its trailing slash: every
    // `/about` came back 308 → `/about/`. That contradicted `trailingSlash:
    // 'never'` above and, worse, pointed each page's own canonical tag and its
    // sitemap entry at a URL that only redirects. `file` format lets Pages
    // serve `/about` straight from `about.html`, so the links, the canonical
    // and the sitemap all agree and there is no hop.
    format: 'file',
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
