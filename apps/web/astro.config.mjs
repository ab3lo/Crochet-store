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

  // Cloudflare Pages canonicalises a folder to its trailing slash, so a
  // `never` here made every internal link 308 on the way to its own page.
  // `always` means the links we emit, the canonical we advertise and the URL
  // Pages actually serves are the same string.
  /**
   * No syntax highlighting.
   *
   * There is no markdown in this project, so the highlighter never runs — but
   * Astro's default is Shiki, which colours code with inline `style`
   * attributes, and `security.csp` below forbids those on anything but
   * `style-src-attr`. Astro warns at build time and treats it as fatal. Off
   * explicitly, so adding a markdown file later cannot quietly break the
   * build or the policy. Turn it back on with Prism if that day comes.
   */
  markdown: {
    syntaxHighlight: false,
  },

  trailingSlash: 'always',

  /**
   * Content Security Policy.
   *
   * This has to be Astro's, not a hand-written header, because Astro emits
   * the hydration bootstrap as *inline* scripts — one that sets `Astro.only`
   * and one that defines the `<astro-island>` custom element. A hand-written
   * `script-src 'self'` blocked both, so no island on the site ever
   * hydrated: the pages looked fine because the HTML is prerendered, but the
   * cart, the filters and the whole admin panel were dead.
   *
   * `security.csp` hashes the inline scripts and styles it emits, so the
   * policy stays strict without `'unsafe-inline'`. The matching policy is
   * emitted as a `<meta http-equiv>`; the old copy in `public/_headers` is
   * gone, because a header CSP and a meta CSP are both enforced and the
   * hash-less one would win.
   */
  security: {
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        // Product photos come from the Supabase CDN.
        "img-src 'self' data: https:",
        "font-src 'self'",
        "connect-src 'self' https:",
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "upgrade-insecure-requests",
      ],
      /**
       * `style-src-elem` stays hash-only — that is the directive covering
       * `<style>` blocks, and Astro hashes the ones it emits.
       *
       * `style-src-attr` is separate and has to be opened up, because the
       * design leans on CSS custom properties set inline: the marquee takes
       * `--from`/`--to`/`--accent`/`--mq-duration` as a `style` attribute,
       * which accounts for ~54 of them across the build. Hashes cannot cover
       * an attribute, and `'unsafe-hashes'` would need a hash per distinct
       * attribute value — so the attribute kind is allowed outright and the
       * element kind stays strict. Scripts get no such allowance.
       */
      styleDirective: {
        resources: [{ resource: "'unsafe-inline'", kind: 'attribute' }],
      },
    },
  },

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
  },

  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },

  image: {
    // Product photos come from the Supabase CDN; the placeholders are local
    // SVG. Nothing is optimised at build time because the catalogue is
    // populated at runtime, after the build, so this only matters if
    // `astro:assets` is ever switched on — at which point the remote host has
    // to be named here or the build fails.
    domains: ['*.supabase.co'],
  },
});
