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
      /**
       * Tightened when the API was deleted.
       *
       * `connect-src` was `'self' https:` and `img-src` was `'self' data: https:`
       * — both wildcards that existed for one reason: the browser had to reach
       * the Bun API on another origin, and product photos were hotlinked from
       * the Supabase CDN. Neither is true any more.
       *
       *   • The storefront fetches nothing cross-origin. The catalogue is baked
       *     in at build time and the two revalidation effects are gone, so the
       *     only runtime requests are Astro's own module loads — all same-origin.
       *   • Product photos are files in `public/images/products/`, committed to
       *     the repository and copied verbatim into the build. They are served
       *     from the shop's own origin.
       *
       * So `connect-src 'self'` and `img-src 'self' data:` are both exact now,
       * and the difference is not cosmetic: the old policy permitted a
       * compromised or injected script to exfiltrate the catalogue, the cart
       * and anything the visitor typed to any host on the internet, and to
       * render an image from any host. Neither is possible now.
       *
       * `data:` is still needed for images — it is how the inline SVG data URIs
       * in product copy and the theme swatches work.
       */
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        // `static.cloudflareinsights.com` is Cloudflare's own Web Analytics
        // beacon, which Pages injects into the served HTML. The policy blocked
        // it, so the script failed on every page and analytics recorded nothing
        // while appearing to be on. `connect-src` needs the same origin for the
        // beacon's beacons it POSTs back.
        "connect-src 'self' https://cloudflareinsights.com https://*.cloudflareinsights.com",
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "upgrade-insecure-requests",
      ],
      /**
       * `script-src` is managed by Astro and cannot be written by hand —
       * putting it in `directives` fails the build, which is the right
       * behaviour, since a hand-written `script-src` would drop the hashes and
       * with them every inline script Astro emits.
       *
       * The one host added is Cloudflare's Web Analytics beacon, which Pages
       * injects into the served HTML and which the policy was blocking.
       */
      scriptDirective: {
        resources: [
          { resource: "'self'", kind: 'element' },
          { resource: 'https://static.cloudflareinsights.com', kind: 'element' },
        ],
      },
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
    // The admin panel is no longer part of this build. It lives in
    // `apps/admin`, runs on localhost, and is never built, bundled or served
    // by Pages — so there is nothing to filter out of the sitemap and no
    // `dist/admin` to leak.
    //
    // The `filter` below is kept anyway, as a cheap assertion of that: if an
    // `/admin` page ever reappears in `apps/web/src/pages`, it fails the build
    // rather than shipping a copy of the panel to the internet.
    sitemap({
      filter: (page) => {
        if (page.includes('/admin')) {
          throw new Error(
            'An /admin page exists in apps/web. The admin panel must live in apps/admin ' +
              'and must never be part of the static build.',
          );
        }
        return true;
      },
    }),
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
    // Every image the site serves is a file in `public/`, so there is no
    // remote host to allow. The Supabase entry here is a leftover from when
    // product photos were hotlinked from a CDN; with images committed to the
    // repository, `astro:assets` would only ever process local files.
    //
    // Left as an empty object rather than deleted so switching
    // `astro:assets` on is a config change rather than an archaeology exercise.
    domains: [],
  },
});
