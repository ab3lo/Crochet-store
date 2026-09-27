# Crochet & Co.

A shop for handmade crochet pieces. Twelve products, five promotion layouts, a
basket, and a WhatsApp checkout.

**It is a static site.** There is no server, no database, no API and no deploy
hook. `apps/web` builds to plain HTML in `apps/web/dist` and that is the whole
deployable artifact. Orders are taken on WhatsApp, which is where a shop this
size actually wants them.

---

## Two commands

```bash
bun install
bun run dev      # the shop          → http://localhost:4321
bun run admin    # the admin panel   → http://127.0.0.1:4322
```

`bun run seed` first if you want the twelve demo pieces.

## How a change reaches the shop

```
  data/catalog.sqlite  →  src/data/catalog.json  →  git push  →  Pages rebuilds
  (you edit this)         (committed)              (the trigger)
```

The admin panel writes to a SQLite file on your machine. Publishing regenerates
`catalog.json` from it, commits **only** that file and your images, and pushes.
The push is the rebuild trigger.

**Saving is not publishing.** A save changes your computer. The site changes
when you press Publish. The panel's status strip says which state you are in,
and compares the last-edit and last-publish timestamps so you never have to
guess whether a price is live.

[`docs/DEPLOY.md`](docs/DEPLOY.md) covers publishing, backups, branch
protection and troubleshooting.

---

## Layout

```
  apps/web        the shop. Astro + Svelte 5, static output, 21 pages.
  apps/admin      the panel. SvelteKit, loopback-only, SQLite.
  shared          types, Zod schemas, currency and region constants.
  data/           catalog.sqlite — gitignored working file.
```

`shared` exists so the shop and the panel cannot disagree about a price
format, a category, or what a valid slug is. It is 700 lines and both apps
depend on it.

### What is where, and why

**`apps/web/src/data/catalog.json`** is the build's only input. Not a fallback,
not a cache — the input. The build has no credentials, makes no network
requests, and cannot fail because a service is down. Everything the shop shows
is in that one file, and it is committed, so `git diff` shows exactly what a
publish will change.

**`data/catalog.sqlite`** is the editable copy, gitignored. It holds products,
image attribution and promotions. `bun run export` turns it into
`catalog.json`; the panel's Publish button does the same and then commits.

**Product photos are files in `apps/web/public/images/products/`**, named
`<slug>-<content-hash>.<ext>`, committed alongside the product they belong to.
An image and the caption describing it are one change, so reverting one
reverts the other. The content hash means a changed photo is always a changed
URL, which is what makes the immutable cache header safe.

**`apps/admin` is not part of the build.** It is a separate workspace, and
`bun run build` cannot reach it. The sitemap integration throws if an `/admin`
page ever appears in `apps/web`, and the production checklist asserts
`dist/admin` does not exist.

---

## How selling works

The cart is `localStorage`. Checkout is a `wa.me` link with the basket, the
subtotal, the delivery region and the payment terms written into the message.

There is no payment gateway, deliberately. A maker-of-handmade-goods shop takes
payment over a link or in person, and wiring a gateway means PCI scope and a
subscription — which is not what this project is for.

Custom-order enquiries use the same mechanism: the visitor picks topics or
writes their own, and it arrives as one WhatsApp message. The conversation *is*
the record.

---

## The promotion engine

`apps/admin/src/lib/banner-engine.ts` — 401 lines, no dependencies beyond
`@crochet/shared`, and a pure function of its arguments.

It reads the catalogue and decides what to push: it scores products by stock,
recency and category, checks a seasonal calendar for an occasion inside its lead
window, picks one of five layouts, drafts the headline and the discount, and
returns the reasoning alongside the draft.

**It writes nothing.** You get a draft and an explanation, every field stays
editable, and the human decides. A sale should not go live from a button press.

### Five layouts

`bloom` · `marquee` · `ribbon` · `stitch-strip` · `editorial`

One registry maps a template name from the database to a component, so a
`Banner` row can never reference a layout that does not exist. The picker in
the panel is generated from the same list.

To add one: add the key to `BANNER_TEMPLATES` in `shared`, write the component
in `apps/web/src/components/banners/`, register it in `registry.ts`. Nothing
else needs touching — the panel, the previews and the storefront all read from
those two lists.

The most interesting one is `editorial`, which renders a product rail using the
real `ProductCard`. It is the reason the discount needs no bespoke layout: the
banner is a frame, not a reimplementation of the shop.

---

## Two Astro+Svelte traps worth knowing

Both of these cost real time here, and both fail *silently* — the pages look
correct because the HTML is prerendered.

**A CSP in `_headers` kills every island.** Astro emits its hydration bootstrap
as inline scripts. A hand-written `script-src 'self'` blocks them, so
`<astro-island>` is never defined and nothing hydrates — the cart, the filters
and the nav are all inert, and the build succeeds. The policy has to come from
`security.csp` in `astro.config.mjs`, which hashes the inline scripts it emits.
Only `frame-ancestors` stays in the header, because a `<meta>` policy cannot
enforce it.

**Module scope is not shared between islands.** Astro hydrates every `client:`
island as its own Svelte app, so a module-level `$state` in the cart store gave
the header's badge and the drawer separate copies that silently disagreed. The
store is hung off `globalThis` under a `Symbol.for` key, so every island —
however many Vite chunks it lands in — resolves to the same instance.

---

## Things deliberately not built

- **A backend.** The brief was a shop, and a shop is a catalogue, a basket and
  a way to get paid. A server would have been a thing to keep running.
- **Authentication on the panel.** It binds to `127.0.0.1` and that is the
  whole access control. There is no password to phish, steal or forget, and no
  network path to attack — but it does mean the panel can `git push` to
  production, so treat write access to `main` as the security boundary of the
  shop.
- **A payment gateway.** PCI scope and a subscription, for a shop that takes
  money over a link.
- **An order queue.** Orders are WhatsApp messages. A table tracking them would
  be a second copy of a conversation that already happened.
- **A newsletter.** There is no frontend collecting addresses, so there is
  nothing to store.
- **Server-side image optimisation.** Photos are committed at a sensible size
  and served as-is. `astro:assets` is configured and switched off; turning it
  on now that images are local would work.
- **A CMS.** The panel is the CMS. It is 4,000 lines instead of a dependency
  and a migration.

---

## Verifying

```bash
# the build needs no network and no .env
env -i PATH="$PATH" bun run build

# the panel is not in the build
test ! -d apps/web/dist/admin && echo "OK: no admin in dist"

# nothing in the client bundle talks to another origin
rg -o "fetch\(['\"]https?://[^'\"]+" apps/web/dist/_astro/*.js

# the catalogue the build used is the committed one
git diff --stat apps/web/src/data/catalog.json
```

`docs/DEPLOY.md` has the full production checklist.
