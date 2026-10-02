# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

One product with two web surfaces. The shop is a static site on Cloudflare
Pages; the panel is a loopback-only SvelteKit app on the maker's own machine.
Mobile web is the same product as desktop web — the shop is not a native app and
must not drift into a native design language.

## Users

**The buyer.** Someone in or around Bahawalpur who already found the shop in an
Instagram post or a WhatsApp chat and followed a link to it. They arrive warm and
mid-conversation: they have seen at least one photograph of the actual work, and
they open the site with a question rather than an intention to browse. The job
they are doing is deciding whether to trust a stranger's photograph enough to
spend real money, and then getting to a message they can send. Cold persuasion is
not the job; answering the question that is already in their head is.

**The maker.** One person, with a full-time job, who makes every piece. They are
the only user of the panel, the only account with write access to `main`, and the
person a buyer ends up talking to. Their job in the panel is to change the
catalogue safely and publish deliberately — often on a phone-sized window, often
while a conversation with a customer is open in another tab.

## Product Purpose

Crochet & Co. is a shop for handmade crochet pieces — keychains, bags, purses and
never-wilt flowers — worked one at a time by one maker.

It exists to make a handmade object legible to someone who has never held it: what
it is, what it costs, why it costs that, when it can be collected, and how to pay.
Success is a WhatsApp conversation, not a checkout. A visitor who reads the page,
trusts the price, and sends one message with the order in it has been fully
served; the site has done its job the moment the message is sent.

The shop deliberately runs with no server. No backend, no payment gateway, no
order queue, no newsletter, no CMS. A publish is a git commit, and the push is
the deploy.

## Positioning

The maker is a named person with a full-time job who works in runs of one to ten
pieces and explains the arithmetic of the price from the making itself — yarn, the
counting at the end of every round, the blocking nobody sees. The shop's argument
is that a machine-made version of the same object is a different object.

A competitor cannot truthfully copy this because it is not a styling choice: the
first-person specificity, the runs of one to ten, and the made-to-order promise
are all load-bearing. Everything else follows from them — the basket hands over a
WhatsApp message rather than a payment, the order message carries the delivery
region and the 40% advance terms so there is no round trip before work starts,
and a promotion is a draft with written reasoning until a person decides it.

## Operating Context

**Making, not stocking.** Nothing is made until it is ordered. The buyer pays a
40% advance by JazzCash or SadaPay before yarn is bought, and the remainder when
the piece is handed over.

**Where it goes.** Bahawalpur, Punjab, Pakistan, and nowhere else. Collection is
by appointment; local delivery inside the city is possible for larger pieces, with
a day and a price agreed by message. This is stated plainly rather than shipped
nationwide, because a shop that sells nationwide and delivers locally disappoints
at exactly the wrong moment. Prices are in PKR, formatted `en-PK`, and whole
rupees print without decimals.

**The loop, and how a change reaches a buyer.**

```
  data/catalog.sqlite  →  apps/web/src/data/catalog.json  →  git push  →  Pages rebuilds
  (maker's machine,        (committed, the build's           (the          (static HTML,
   gitignored)             only input)                        trigger)      live in 1–2 min)
```

- The panel writes to SQLite locally. **Saving is not publishing.**
- Publish regenerates `catalog.json`, stages *only* the catalogue and the product
  images, commits, and pushes to `main`. Never `-A`; the index is checked first.
- The panel's status strip compares last-edit and last-publish and says "The shop
  is behind this catalogue" when they disagree. It is a permanent strip, not a
  toast, because "is it live yet?" is asked every time.
- The build needs no network, no credentials and no `.env`. It cannot fail
  because a service is down.

**The security boundary is write access to `main`.** The panel has no password,
no session and no login page; it binds to `127.0.0.1` and that is the entire
access control. It shows a red warning if served anywhere else — a warning, not
a control. Recommended: branch protection on `main`, no other writers, deploy
previews so a change is visible before it merges.

**Risks the maker already plans around.** The SQLite file is the only copy of
unpublished work — `catalog.json` reflects only what has been published, and the
export is one-way, with no import path back. Practice is to publish before doing
anything risky, and to copy the database file.

**Deployment.** Cloudflare Pages, Astro preset, `bun run build`, output
`apps/web/dist`, `main`. `BUN_VERSION=1.4.0` is required — Cloudflare's image
ships an older Bun that cannot parse this repo's lockfile. `PUBLIC_SITE_URL` is
the only storefront variable; there is no `PUBLIC_API_URL` and no `DATABASE_URL`.

**Also in the loop.** A WhatsApp Business catalog is exported as CSV
(`bun run catalog:whatsapp`) and imported at Meta Commerce Manager, capped at 500
products. This is free and needs no server, and it is the one piece of WhatsApp
commerce worth doing. Its images are currently broken — see Evidence.

## Capabilities and Constraints

**Catalogue.** Five categories: keychains, bags, purses, bouquets & flowers, and
custom orders (an enquiry route, not a stocked category). A product carries name,
slug, tagline, one-paragraph description, price, optional "was" price, images with
position-matched attribution, free-form details (yarn, size, stitch, hardware,
care), stock, a made-to-order flag, hidden and sort-order flags. Twelve products
is the whole inventory scale of this shop.

**Selling.** The cart is `localStorage`, keyed per island off `globalThis` under a
`Symbol.for` key — module scope is *not* shared between Astro islands, and a
module-level store silently gives the header badge and the cart drawer separate
disagreeing copies. Price is captured at add-to-cart time. Checkout is a `wa.me`
link: one per product (names the piece, quotes the price, asks the right question
when sold out) and one for the basket (lines, subtotal, delivery region, payment
terms, address prompt). A `mailto:` fallback quotes the same order.

**Promotions.** A pure, 401-line engine reads the catalogue and produces a *draft*
plus its reasoning: it scores products by stock, recency and category, checks a
seasonal calendar for an occasion inside its lead window, picks one of five
layouts, drafts the headline and the discount, and writes nothing. Every field
stays editable. Five layouts: bloom, marquee, ribbon, stitch-strip, editorial.
One registry maps a template name to a component, so a banner row cannot
reference a layout that does not exist and the panel's picker is generated from
the same list. Adding a layout is three edits and nothing else.

**Constraints that fail silently, and therefore must be preserved.**

- The CSP must come from `security.csp` in `astro.config.mjs`, which hashes the
  inline scripts Astro emits. A hand-written `script-src 'self'` in `_headers`
  blocks the hydration bootstrap, `<astro-island>` is never defined, and no island
  hydrates — the pages still render, because the HTML is prerendered, so it looks
  like a successful deploy. Only `frame-ancestors` stays in the header.
- A PATCH must be built from the default-free field object, never from
  `productInputSchema.partial()`. Zod's `.partial()` does not stop a field's
  `.default()` from firing for absent keys, which turns a one-field update into a
  full overwrite that empties the description and un-hides the product.
- A "was" price at or below the price is refused at the schema, not the form. The
  storefront only renders a discount when `compareAtCents > priceCents`, so a bad
  row saves perfectly and then displays as no discount at all.
- Image URLs must be `http(s)` or a single-slash site path. `//evil.example` and
  `/\evil.example` both pass a bare `startsWith('/')` and normalise to a
  protocol-relative open redirect.
- Instagram and Pinterest are not permitted image sources: both block hotlinking.
  Stock images must carry a named, linked photographer.
- Product images are files named `<slug>-<content-hash>.<ext>`, committed with
  the product so a photo and the caption describing it revert together. Identical
  bytes produce an identical URL, which is the immutable cache header working as
  designed.
- `shared/` is the single authority for money format, categories, slugs, the
  delivery region and the payment terms, because the product pages, basket,
  shipping page and every outbound WhatsApp message have to agree about all of
  them. Both apps import it so the contract cannot drift.
- The panel is not part of the build. The sitemap integration throws if an
  `/admin` page ever appears in `apps/web`, and the production checklist asserts
  `dist/admin` does not exist.

**Not built, on purpose.** No backend. No authentication on the panel. No payment
gateway (PCI scope and a subscription). No order queue — orders are WhatsApp
messages, and a table would be a second copy of a conversation that already
happened. No newsletter. No server-side image optimisation — photos are committed
at a sensible size and served as-is. No CMS: the panel is the CMS, 4,000 lines
instead of a dependency and a migration.

**Open decisions.**

- **Enquiries are not recorded anywhere in the app.** `CustomOrder`,
  `OrderStatus`, `orderFilterSchema`, `newsletterInputSchema` and `AdminUser` in
  `shared/` are vestigial from an API that was deliberately removed; the stats
  endpoint documents that it stopped counting orders and subscribers for the same
  reason. A custom-order enquiry arrives as one WhatsApp message and stops there.
  Whether any record of it should ever exist is undecided.
- **Price scale is inconsistent between the seed dataset and the live catalogue.**
  `shared` formats paise as rupees, so the live catalogue reads plausibly
  (Rs 300 / 500 / 3000), while the twelve demo products in
  `apps/admin/scripts/seed-data.ts` carry values that display as Rs 14, 52, 38 and
  44 — whole rupees stored as paise. Which scale is authoritative for a real piece
  is undecided, and the seed copy is demo text, not the maker's real inventory.
- **`contact.community` is a placeholder.** The WhatsApp group invite in
  `apps/web/src/lib/contact.ts` is `REPLACE-WITH-INVITE-LINK`. Whether the stitch
  club is a live group the shop points at, or a concept to fill in later, is
  undecided.
- **The secondary contact email is unverified.** `contact.email` is
  `hibot@doxxed.com`, which does not match the shop's name or domain. Preserved
  as-is until the maker corrects or confirms it.

## Brand Commitments

- **Name:** Crochet & Co., with the ampersand. The site is "the shop"; the maker
  writes as "I". Not "Crochet and Co", not "Crochet & Company".
- **Voice: the maker in first person, warm and specific.** "I keep a count on a
  scrap of paper beside the work." "Message me on WhatsApp." Short, concrete,
  a bit understated, and free of marketing filler — the committed copy on
  `about.astro`, in the category blurbs and in the payment terms sets the bar.
  Explanations of cost are told plainly rather than apologised for or hidden.
- **Enquiries open the conversation with `Assalamu Alaikum!`** in both the shop's
  own copy and every outbound WhatsApp message. This is deliberate and must be
  preserved in anything that writes a message to a customer.
- **The group is called "the stitch club."** The noun, not "community", because
  the shop voice is warmer than a platform footer.
- **Honest smallness is a brand asset.** "Everything here is made in runs of one to
  ten. That is not marketing, it is arithmetic." Never imply scale, speed,
  industrial sourcing, or a team.

## Evidence on Hand

Real, in the repository:

- **`apps/web/src/data/catalog.json`** — the build's committed input. Three live
  products: Jellyfish Keychain (Rs 500), Sunflower Bag Charm (Rs 300), Floral
  crochet Bag (Rs 3000, was Rs 4000). All three are `madeToOrder` with stock 0,
  all three have an empty `description` and empty `details`.
- **Two real photographs**: `jellyfish-keychain-552cc8d596.png` and
  `floral-crochet-bag-eb3dcac590.png`. The maker supplies real photography,
  uploaded through the panel and committed with its product.
- **Thirteen SVG placeholders** in `apps/web/public/images/products/`, one per
  demo seed product. Plus `placeholder.svg`, `og-default.svg`, `favicon.svg`,
  `apple-touch-icon.png`.
- **`apps/admin/scripts/seed-data.ts`** — twelve demo products written as a maker
  would write them: taglines, two-paragraph descriptions, and real detail blocks
  (yarn, finished size, stitch, hardware, care). This is the strongest available
  sample of the maker's voice about a product.
- **`README.md` and `docs/DEPLOY.md`** — authoritative operating documentation,
  including the reasoning behind the loopback-only panel, the publish model, the
  backup gap, and the two Astro+Svelte traps.

Absences, which future work must not fabricate around:

- **No customer photography, no orders, no testimonials, no reviews, no sales
  figures.** Orders are WhatsApp messages that live outside this repository, and
  the conversation *is* the record. Nothing in the product may claim
  best-selling, loved-by-customers, or a repeat-customer count.
- **No stock counts to trust.** Every live product is stock 0 / made-to-order.
  Stock counters and urgency copy have nothing real behind them.
- **No delivery promise beyond the city.** No shipping window, no courier, no
  nationwide option exists; copy that implies one is unsupported.
- **No care, size or material claim that is not in that product's `details` block.**
- **The WhatsApp catalog export currently has broken images** — every product
  photo is an SVG placeholder and WhatsApp does not render SVG. DEPLOY.md names
  this as the one thing standing between the catalogue and a working WhatsApp
  catalog. Real photography is the fix; inventing imagery is not.

## Product Principles

1. **The conversation is the record.** An order is a WhatsApp message, and the
   site's job ends the moment that message is well formed. Never build a place to
   re-store a conversation that already happened.
2. **Explain the price; never apologise for it.** Yarn, hours, blocking, the row
   of counting. A visitor who understands the arithmetic does not need a
   discount to be persuaded.
3. **Say the constraint before it surprises them.** One city, made to order, 40%
   advance, no card. Stated plainly on the page beats discovered at the handover.
4. **A human decides what goes live.** A promotion is a draft with reasoning; a
   publish is a commit. The same discipline governs the shop and the panel.
5. **Small is the point.** Runs of one to ten, a dozen pieces, one maker. Growth
   in catalogue size would cost the thing the shop is selling.

## Accessibility & Inclusion

No formal accessibility standard has been set by the maker. The incumbent
implementation already carries `:focus-visible` styling and
`prefers-reduced-motion` branches, so motion and focus are handled in code and
must not be lost.

The confirmed device reality is a constraint in its own right: the primary buyer
arrives on a phone from a link inside Instagram or WhatsApp, often in an in-app
browser, often on mobile data. Anything that depends on hover, on a wide
viewport, or on a large asset download is working against the real user. A
concrete standard remains an open decision.