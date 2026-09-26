# Crochet & Co.

A handmade-crochet shop: static storefront, small admin panel, no framework
lock-in, and no database required to look at it.

```
apps/web      Astro 7 + Svelte 5 + Tailwind 4 + Skeleton 5   → static, hostable anywhere
apps/api      Bun + Hono + Better Auth + Postgres (Supabase)   → JSON only
shared/       types + zod schemas both sides import
```

---

## Look at it first, with nothing installed

The storefront renders a complete shop from a committed snapshot, so this
works before you have a database, an API, or a `.env` file:

```bash
bun install
bun run dev:offline        # http://localhost:4321
```

Every page works, the cart works, and the whole **admin panel** opens at
`/admin` in demo mode — catalogue, promotion editor with its live preview,
enquiry queue — with no sign-in and no database. See
[Demo mode](#demo-mode) below.

**Going live: follow [`docs/DEPLOY.md`](docs/DEPLOY.md).** It covers Supabase,
storage, the API host, both static hosts, and a verification checklist.

---

## The full stack

### 1. Database and storage (Supabase)

Create a project, then in **Settings → Database** copy the connection string
(use the **pooler** one — port 6543 — for a server that stays up).

In **Storage** create a bucket called `product-images` and set it to
**public**. Only the storefront reads from it, and it serves nothing but
product photos.

### 2. API

```bash
cp .env.example .env
openssl rand -base64 32        # → BETTER_AUTH_SECRET
$EDITOR .env
```

Then:

```bash
bun run db:migrate        # tables, including Better Auth's
bun run seed              # 12 products + one demo promotion
bun run create-admin      # your owner account
bun run dev:api           # http://localhost:8787
```

`create-admin` reads `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. Run it once.
It is idempotent, so it also restores your access if you ever lock yourself
out.

> After promoting yourself, **sign out and back in.** Better Auth caches the
> session in a signed cookie for five minutes, so a role change is invisible
> to the session you already have. This is a deliberate trade-off for fewer
> database round trips; `session.cookieCache.maxAge` in
> `apps/api/src/auth.ts` sets the window.

### 3. Storefront

```bash
echo 'PUBLIC_API_URL=http://localhost:8787' >> apps/web/.env
echo 'PUBLIC_SITE_URL=http://localhost:4321'  >> apps/web/.env
bun run dev               # http://localhost:4321
```

Open `/admin` and sign in.

### 4. Going live

Set `PUBLIC_API_URL` to your deployed API and `PUBLIC_SITE_URL` to the real
origin, then add that origin to the API's `BETTER_AUTH_TRUSTED_ORIGINS`.

The API is a single Bun process with no platform-specific bindings, so it
runs anywhere Bun does — Fly.io, Railway, Render, a VPS, or a Cloudflare
Worker. It is **not** part of the static site deploy.

---

## Deploying

### Cloudflare Pages

| Setting | Value |
| --- | --- |
| Build command | `bun run build` |
| Output directory | `apps/web/dist` |
| Environment | `PUBLIC_SITE_URL`, `PUBLIC_API_URL` |

`apps/web/public/_headers` is picked up automatically and sets a Content
Security Policy, HSTS, `X-Frame-Options: DENY`, and long-lived immutable
caching for hashed assets.

### GitHub Pages

`.github/workflows/deploy.yml` builds and publishes on every push to `main`.
Set **Settings → Pages → Source** to **GitHub Actions**.

GitHub Pages cannot set response headers, so `_headers` is ignored there.
Two consequences worth knowing:

- No CSP. Add one at the CDN in front of it, or accept the gap on a
  static brochure site.
- `/admin` is a static page like any other. It holds no secrets — the guard
  is `role === 'admin'` in the API — so exposing the file is fine.
  `robots.txt` and a `noindex` meta tag keep it out of search results.

### Keeping it current

`apps/web/src/data/catalog.json` is the snapshot. Refresh it when the API is
running:

```bash
bun run snapshot        # rewrites the snapshot from the live catalogue
```

Between deploys, the islands re-fetch from the API at runtime, so admin
edits usually appear without a rebuild. The snapshot is what a *new* visitor
gets until you deploy again.

---

## The sales-banner feature

The part worth reading the code for is `apps/api/src/lib/banner-engine.ts`.

A **banner** is a promotion. It carries a headline, a discount, a checkout
code, and a list of product ids. When it is live it does three things at
once: it appears in the storefront's promo rail, it stamps the reduced price
onto every product it is attached to, and it puts the code in the cart.

### Five pre-made components

Each template is one real component in `apps/web/src/components/banners/`:

| Template | Silhouette | Suits |
| --- | --- | --- |
| `bloom` | Petal-edged panel, headline left | a dated celebration |
| `marquee` | Headline over an endless ticker | a flash sale |
| `ribbon` | A bow-tied one-line bar | shipping news, a restock |
| `stitch-strip` | Crochet-patterned band with a solid inner bar | a standing 10% nudge |
| `editorial` | Image left, copy right, product rail | a curated drop |

They share one visual language — the same tint wash, offer chip and stitched
button — so five templates read as one shop. The map from database string to
component lives in `registry.ts`; a banner row cannot name a template that
does not exist.

### Auto-generation

Press **Generate a promotion** in `/admin`. The engine reads the live
catalogue and decides what is worth pushing:

- **Seasonal calendar first.** If a dated occasion is inside its lead window
  — Diwali in October, Christmas from early November — it uses that. Christmas
  gifting gets an `editorial` layout and a 25% offer, because that is what
  has worked before.
- **Otherwise, catalogue signals.** Low stock scores highest (a 2-left
  keychain is the easiest thing in the shop to sell), then anything added in
  the last three weeks, then pieces that have sat for months. Premium items
  get a nudge because a small percentage moves the number.
- **Discount is clamped to the narrowest margin in the set**, inferred from
  any previous compare-at price. A thin-margin piece is never accidentally
  over-discounted just by joining a group.
- **Codes are made unique** against campaigns already running.

It writes **nothing**. It returns a draft plus a plain-English explanation of
why it chose those products, and every field stays editable. A bot putting
40% off a product unsupervised is a bad idea, so the human stays in the loop.

### Adding a template

1. Add the key to `BANNER_TEMPLATES` and `BANNER_TEMPLATE_META` in
   `shared/src/index.ts`.
2. Add a migration `CHECK` constraint for the new value.
3. Write the component in `apps/web/src/components/banners/`.
4. Register it in `registry.ts`.

The admin's template picker, the preview and the storefront all read from the
same map, so nothing else changes.

---

## How selling actually works

**Currency.** Pakistani rupees. `money()` in `shared/src/index.ts` formats
integer paise as `en-PK` → "Rs 1,400", dropping the decimals for whole rupees
because this shop prices in round numbers. `amount()` gives the bare figure
for structured data.

**One city only.** The shop sells in `SALES_REGION` (Bahawalpur, Punjab) —
collection by appointment or local delivery. That lives in
`shared/src/index.ts` and is read by the product pages, the basket, the
shipping page and every outbound order message, so they cannot disagree.

It is a stated condition rather than a hard block, and that is deliberate: a
static site has no idea where the shopper is. A postcode gate would be a worse
experience than an honest sentence. Change the city in `shared/src/index.ts`
and every mention follows.

**Enquiries go over WhatsApp.** There is no contact form. `/custom-orders`
holds a composer: tap any combination of common questions — *different
colours*, *commission a piece*, *is it ready?*, *collection & delivery*, *care*,
*can it cost less?* — write your own words if you want, and it opens WhatsApp
with the whole thing assembled and the region stated.

`wa.me` is WhatsApp's own click-to-chat: no API key, nothing to configure. The
Business API would need a Meta app and approved message templates, and buys
nothing for a one-to-one shop conversation.

If the API happens to be running, the same message is also recorded in the
admin's enquiry list. That is fire-and-forget — the WhatsApp redirect opens
*first*, synchronously, because any `await` before a `window.open` loses the
user gesture and the browser blocks the popup.

The newsletter is still a form. You cannot subscribe somebody to a mailing
list over WhatsApp.

---

## Demo mode

`bun run dev:offline` (or `bun run --cwd apps/web dev:demo`) starts the dev
server with no API configured. In that state the admin panel at `/admin`
stops asking for a database and instead serves itself from
`apps/web/src/lib/admin-demo.ts`, seeded from the committed snapshot.

You get the real thing, not a screenshot: the catalogue with working filters,
the product editor, the promotion editor with a **live preview of the actual
banner component**, validation errors, the enquiry queue, and the storefront
picking up whatever you just published. Writes mutate an in-memory copy, so
editing feels real and a reload resets it. A yellow banner at the top says so
in as many words.

Demo mode requires `import.meta.env.DEV`. **There is no environment variable
that can enable it in a production build** — a production deploy either talks
to the real API or reports that there is none.

---

## Design

The brief was "premium, pink, girlish". The trap is that this collapses into
a generic look very easily, so a few decisions were deliberate:

- **The stitch is the ornament.** Chain-loop rules and puff-scallop edges
  divide real sections. They are used as structure, not wallpaper.
- **Ink is a deep plum, not black.** A tinted dark reads as printed.
- **Fraunces, turned up.** The `SOFT` and `WONK` axes are what make the
  headings look handmade. Body copy is Instrument Sans, which is warm without
  being a second display face.
- **Flat, not soft.** Panels have a 1px stitch border and a hard 3px offset
  instead of a soft grey shadow, and there are no gradient washes.
- **One bold thing.** The hero is a ball of yarn with a thread coming off it.
  Everything around it stays quiet.
- **Numbering is used only where it means something** — the commission steps
  are a real sequence; nothing else is.

The palette is generated, not hand-typed: `apps/web/scripts/build-theme.ts`
builds 66 OKLCH values in even perceptual steps. Re-run `bun run theme` after
changing a hue.

---

## Verifying

```bash
bun run typecheck        # API only; the storefront has no type check
bun run scan:dead        # exports referenced only at their own definition
```

A Playwright smoke script (pages, cart interaction, mobile overflow) and an
end-to-end API script (auth round trip, role guard, sale arithmetic, the
generator) live outside the repo in the working directory; the API e2e one
is the reason the Better Auth schema is trustworthy rather than hopeful.

### The Better Auth schema is hand-written

`migrations/0002_better_auth.sql` is not generated by the Better Auth CLI. The
CLI pulls in `better-sqlite3` and tries to build it natively, which fails on a
Bun-only machine with no `node-gyp` — even though this project only ever
talks to Postgres.

Every identifier in that file is **double-quoted, and that is load-bearing**.
Better Auth's Kysely adapter uses camelCase field names verbatim, so the
column is `"emailVerified"`. Postgres folds unquoted identifiers to lower
case, which creates `"emailverified"` and then fails every sign-in with
`column "emailVerified" of relation "user" does not exist`. Do not tidy the
quotes away.

---

## Security notes

What is actually enforced, and where:

| Concern | Where |
| --- | --- |
| Admin access | Session + `role === 'admin'`, server-side, in one middleware |
| CSRF | `SameSite=Lax` cookie **and** an `Origin` check on every admin mutation |
| CORS | Explicit allowlist; a disallowed origin gets no CORS headers at all |
| SQL injection | Every value is a bound parameter. The only interpolated SQL is a column allowlist and a clamped integer |
| XSS | Svelte escapes by default. The one `set:html` (JSON-LD) escapes `<`, `>`, `&` so a product name cannot break out of `<script>` |
| Open redirect | Promotion links must match `^/(?![/\\])` — `//evil.com` and `/\evil.com` are rejected |
| Image URLs | Scheme restricted to `http(s)`; `javascript:` and `data:` are rejected |
| Uploads | MIME allowlist, 8 MB ceiling checked from `Content-Length` *before* buffering, generated filenames, validated path segment |
| Rate limiting | Per-instance counters, capped map size, sign-in throttled hardest |
| Secrets | `.env` is gitignored. Only `PUBLIC_*` is ever read by the storefront, and only those get inlined into the bundle |
| Errors | Postgres messages are logged, never returned, in production |

Two things to know:

- **Rate-limit IP headers are off by default.** `cf-connect-ip` and
  `x-real-ip` are trivially spoofed by anyone who can reach the origin
  directly. Set `TRUSTED_PROXY=true` only when the API is genuinely
  unreachable except through Cloudflare or a reverse proxy. With it off, all
  unknown clients share one bucket — strict, but the safe failure mode.
- **The rate limiter is in memory**, so it is per-instance. Fine for one node;
  move it to Redis if you scale out.

### Before you launch

- [ ] `BETTER_AUTH_SECRET` is 32+ random characters and not in the repo
- [ ] `SEED_ADMIN_PASSWORD` removed from `.env` after `create-admin` runs
- [ ] `NODE_ENV=production`, so error messages stop leaking detail
- [ ] `TRUSTED_PROXY=true` if behind Cloudflare/Fly
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is server-side only — it bypasses RLS
- [ ] Supabase row-level security reviewed (the API uses the service role, so
      RLS is not your backstop here)
- [ ] `PUBLIC_SITE_URL` set, so canonical URLs and the sitemap are right

---

## Things deliberately not built

- **Card payments.** Checkout composes a WhatsApp or email message. Adding a
  gateway means PCI scope and a subscription, which is not what this is for.
  Point `checkout.channel` in `apps/web/src/lib/stores/cart.ts` at a Stripe
  Payment Link or similar when you want it.
- **Customer accounts.** Nobody should have to sign up to buy a keychain. The
  cart is `localStorage`; the API re-validates every price at checkout, so a
  tampered cart cannot change what is charged.
- **Shipping.** See "How selling actually works" above. One city, no postage.
- **Storage cleanup.** Removing an image URL leaves the object in the bucket.
  Cheap at this volume, and safer than a delete path that could remove the
  wrong object.
- **Shopper-facing search indexing.** The catalogue grid filters client-side
  from a fetched list. Fine to a few hundred products; past that you want
  Postgres full-text search.

---

## Two Astro+Svelte traps worth knowing

**Keyframes declared in a Svelte component get pruned.** Svelte scopes
`@keyframes` names and drops any it decides is unreferenced. With a custom
`animation:` shorthand it rewrote the declaration to
`animation: 34s linear infinite mq-scroll` and then removed the keyframes as
orphaned — leaving a ticker that reported `animation-play-state: running` and
never moved. Every animation in this project lives in `styles/global.css`,
which is neither scoped nor pruned.

**`client:visible` swallows the first click.** It hydrates on
scroll-into-view, so a shopper who scrolls and clicks immediately hits a
control with no handler yet. Every island here is something you can click, so
they all use `client:idle`.

**Cross-island state needs a store, not `$state`.** Astro hydrates each
`client:` island as its own Svelte app, so module-level `$state` is *not*
shared between them — the header's basket badge and the drawer's contents each
got their own copy and silently disagreed. `src/lib/stores/*` hang the store
off a `Symbol.for` key on `globalThis` so every island resolves the same
instance.

