# Audit & feasibility — static storefront + local-only admin

Analysed with `codebase-memory-mcp` (617 nodes, 879 edges, 4 languages) plus a
full read of every tracked source file.

- **Scope of the ask:** remove all runtime compute, keep only the static
  storefront, and replace the hosted admin panel with a local one backed by
  SQLite that commits to git and lets the SSG rebuild.
- **Explicitly out of scope:** order handling. Orders are already WhatsApp.
  Only the frontend matters.

---

## 1. Verdict up front

**Feasible, and unusually favourable.** The storefront is already ~95% static.
The two hard parts — the buyer journey and the checkout — are *already* pure
client-side code with no backend at all. What remains dynamic is an API that
exists almost entirely to serve the admin panel, plus six cosmetic
"revalidate on load" effects that are already written to degrade gracefully
when the API is missing.

Three findings that shape the plan:

1. **The cart and checkout need no server.** `apps/web/src/lib/stores/cart.ts`
   is `localStorage` + a `globalThis` singleton, and checkout is a
   `https://wa.me/…?text=…` URL built by `lib/contact.ts`. There is nothing to
   remove. This is the load-bearing reason the whole plan works.
2. **The admin UI is 2,611 lines and is 100% reusable.** It talks to the server
   through exactly one function, `adminFetch`. Repointing that at SQLite
   instead of HTTP is a contained change, not a rewrite.
3. **`lib/banner-engine.ts` is a pure function.** It imports only from
   `@crochet/shared` — no DB, no env, no network. The 401-line promotion
   auto-generator ports over as-is, and it is the single most valuable piece of
   logic in the repo.

Net: **−1,441 LOC** of API deleted, **+~250 LOC** of SQLite access layer,
**~3,400 LOC** of admin moved out of the deployed bundle. Effort ≈ **9 working
days** solo.

---

## 2. Current architecture

```
                    ┌──────────────────────────────┐
  Browser ────────► │ Cloudflare Pages (static)    │  22 prerendered HTML pages
       │            │  apps/web/dist               │  no secrets, no runtime
       │            └──────────────────────────────┘
       │ /admin          ▲
       │                 │ build-time GET /api/products
       │                 │ (falls back to committed catalog.json)
       ▼                 │
  Admin SPA  ─────────► Bun + Hono API  ──►  Supabase Postgres  (products, banners,
  (Svelte islands)      apps/api                orders, newsletter, auth)
       │                 │                 └─►  Supabase Storage (images)
       └─ POST /api/admin/products  ◄──── Better Auth (sessions, admin role)
                                    │
                                    └─► Cloudflare Pages deploy hook  (rebuild)
```

`astro.config.mjs` already sets `output: 'static'` with an explicit comment
"never switch to 'server'". So the static intent is settled; what remains is
consistent with it.

### The critical build-time coupling

`apps/web/src/pages/product/[slug].astro:22` calls `getCatalogue()` inside
`getStaticPaths`. **A product page only exists for products present at build
time.** This is the single fact that makes a "publish → rebuild" cycle
mandatory rather than optional, and it is the reason the admin panel and the
publish pipeline must be designed as one unit.

---

## 3. Inventory of dynamic logic

### 3.1 `apps/api` — 100% removable (1,441 LOC)

| File | LOC | Verdict |
| --- | --- | --- |
| `src/index.ts` | 160 | **Delete.** Hono, CORS, rate limit, Better Auth mount, `Bun.serve`. |
| `src/auth.ts` | 77 | **Delete.** Better Auth server wiring. |
| `src/env.ts` | 139 | **Delete.** Zod schema for 6 Supabase/Better-Auth secrets. |
| `src/db.ts` | 534 | **Rewrite → SQLite** (~200–250 LOC). See §5.2. |
| `src/lib/http.ts` | 153 | **Delete.** Envelope, `rateLimit`, `clientIp`, `cached`, CORS-aware `fail`. |
| `src/lib/storage.ts` | 83 | **Replace** with local filesystem writes (§5.4). |
| `src/lib/deploy.ts` | 116 | **Delete.** Superseded by `git push` (§5.3). |
| `src/lib/banner-engine.ts` | 401 | **MOVE** to `apps/admin` verbatim. Zero-dependency. |
| `src/routes/public.ts` | 141 | **Delete.** Catalogue reads + `/orders` + `/newsletter`. |
| `src/routes/admin.ts` | 522 | **Rewrite → server routes** (~150 LOC). No auth/CORS/envelope. |
| `migrations/0001_storefront.sql` | 142 | **Port** 3 of 5 tables to SQLite DDL. |
| `migrations/0002_better_auth.sql` | 110 | **Delete.** 4 auth tables, no longer needed. |
| `migrations/0003_image_sources.sql` | 96 | **Port** `product_images`; drop the Postgres-specific backfill. |
| `scripts/migrate.ts` | — | **Rewrite** for `bun:sqlite`. |
| `scripts/create-admin.ts` | — | **Delete.** No accounts exist. |
| `scripts/seed.ts` | — | **Rewrite** to insert into SQLite. |
| `scripts/seed-data.ts` | — | **KEEP.** Pure fixture data; also the current source of `catalog.json`. |

Dead dependencies to drop: `hono`, `@hono/zod-validator`, `pg`, `better-auth`,
`@better-auth/infra`, `@supabase/supabase-js`, `@types/pg`.
**`apps/api` can be deleted from the workspace entirely** and its two reusable
assets (`banner-engine.ts`, `seed-data.ts`) relocated.

### 3.2 `apps/web` — dynamic surface

| Thing | LOC | Action |
| --- | --- | --- |
| `src/lib/auth.ts` (Better Auth client, `adminFetch`) | 133 | **Delete** — replaced by direct SQLite calls. |
| `src/lib/admin-demo.ts` (508 LOC in-memory mock API) | 508 | **Delete.** Its whole purpose was "no API configured". |
| `src/lib/publish.ts` | 25 | **Delete**, superseded by the new publish states. |
| `src/lib/api.ts` | 151 | **Slim.** Drop `fetchJson`/`revalidate`/`getCatalogue`; **keep** `productsIn`, `sortProducts`, `onSaleProducts`, `snapshotAge`. |
| `src/lib/config.ts` | 24 | **Slim** to `siteUrl` only. |
| `src/pages/admin.astro` | 29 | **Delete** from the deployed build. |
| `src/components/admin/*` (6 files) | 2,611 | **Move** to `apps/admin`. |
| `islands/BannerRail.svelte` `revalidate` effect | ~10 | **Delete** (§3.3). |
| `islands/CatalogGrid.svelte` `revalidate` effect | ~15 | **Delete** (§3.3). |
| `islands/Inquiry.svelte` `POST /api/orders` | ~40 | **Convert** to a `wa.me` link (§5.5). |

Also: remove `better-auth` from `apps/web/package.json` and
`build:offline` / `dev:demo` / `dev:offline` from the root `package.json` —
those three exist only to support demo mode.

### 3.3 The revalidation effects — safe to delete, with one caveat

Three islands call `revalidate()` at runtime to pick up changes made after the
last build:

- `BannerRail.svelte:46` — swaps in fresh banners, **keeps the build list on
  failure**. Purely cosmetic; the rail already renders from build data.
- `CatalogGrid.svelte:58` — same shape, same fallback.
- `catalog.json` is inlined as a prop at build time, so the static HTML is
  always complete before JS runs.

**Caveat — do this deliberately, not casually.** This is the *only* mechanism
by which a promotion currently appears without a rebuild. Deleting it means
**every** catalogue change requires a publish cycle. That is the intended
design, but it changes the owner's day-to-day workflow: today an edit is
instant-ish (deploy hook, ~2 min), after this change it is edit → publish →
push → Cloudflare build (~2–4 min) and **nothing reaches the site until
Publish is pressed.** The panel must make that explicit, and an autosave
debounce must not be mistaken for a publish.

### 3.4 Static surface — keep untouched

`about` · `shipping` · `custom-orders` · `404` · `index` · `category/[category]`
· `product/[slug]` · `Header`/`Footer`/`HeroYarn`/`WhatsAppButton`/`RegionNotice`
/`PaymentNotice`/`CommunityLink` · 5 banner renderers · `styles/global.css` +
`theme-blush.css` · the CSP in `astro.config.mjs` · `_headers` · `robots.txt`.

`cart.ts`, `contact.ts`, `format.ts`, `navigation.ts`, `seo.ts`,
`stores/ui.ts` — **no backend dependency at all.** Leave them alone.

---

## 4. Target architecture

```
  ┌───────────────────── owner's machine, never exposed ─────────────────────┐
  │                                                                          │
  │  bun run admin  →  127.0.0.1:4322  (SvelteKit + Svelte 5)                │
  │                          │                                               │
  │                          ├── reads/writes  data/catalog.sqlite           │
  │                          └── banner-engine.ts (pure)                      │
  │                                                                          │
  │  "Publish"  →  write DB  →  export src/data/catalog.json                 │
  │                            →  git add <explicit paths>                    │
  │                            →  git commit  →  git push origin HEAD:main    │
  └──────────────────────────────────┬───────────────────────────────────────┘
                                     │ push
                                     ▼
                    Cloudflare Pages / GitHub Actions
                      reads catalog.json  →  astro build  →  static HTML
```

**Invariants of the new design:**

- Nothing in `apps/admin` is ever built, bundled, or served by the SSG.
- `astro build` requires no database, no network, no secrets. It reads one
  committed JSON file. A build can never fail because a service is down.
- The only thing that crosses a network boundary on publish is `git push`.
- There is no process that must be running for the shop to work.

---

## 5. Design decisions

### 5.1 Admin app: new `apps/admin` SvelteKit workspace

| Option | Verdict |
| --- | --- |
| **A. SvelteKit dev-server app, loopback only** | **Recommended.** Reuses all 6 Svelte components. `bun:sqlite` natively. |
| B. Astro SSR mode just for `/admin` | Rejected — mixing output modes in one Astro app is fragile and drags an adapter into the Pages build. |
| C. CLI only (`bun run admin set-price …`) | Rejected — throws away 2,611 LOC of finished UI. |
| D. Static admin + D1/R2 | Rejected — reintroduces exactly the online compute being removed. |

Why A: the components already isolate all server contact behind `adminFetch`,
all state behind `@/lib/flash.svelte`, and all formatting behind `@crochet/shared`.
Porting means replacing one function per component with a typed call, not
rewriting 852 lines of banner editor.

`apps/admin` must be a separate workspace so that `bun run build` (the Pages
build command) provably cannot reach it. Add an explicit CI assertion:

```bash
test ! -d apps/web/dist/admin || { echo "admin leaked into the build"; exit 1; }
```

### 5.2 The SQLite port — where the real work is

Keep: `products`, `product_images`, `banners`.
Drop: `custom_orders`, `newsletter`, `cache_invalidations`, and all four
Better Auth tables.

| Postgres | SQLite | Note |
| --- | --- | --- |
| `uuid` + `gen_random_uuid()` | `TEXT` + UUIDv4 in JS | No server-side default needed |
| `text[]` (`images`, `product_ids`) | `TEXT` holding a JSON array | `bun:sqlite` has no array type |
| `jsonb` (`details`, `tint`) | `TEXT` holding JSON | mappers already stringify |
| `timestamptz` | `TEXT` ISO-8601 UTC | mappers already call `.toISOString()` |
| `CHECK (x ~ 'regex')` | **drop** → Zod | SQLite has **no regex in CHECK** |
| `touch_updated_at()` trigger | set `updatedAt` in the write path | no triggers without a hook |
| `product_ids - $1::uuid[]` | filter in JS, then write | array subtraction has no SQLite form |
| `WHERE id = ANY($1::uuid[])` | `IN (…)` or filter in JS | |
| `pg_trgm` GIN index | drop | 12 products; `LIKE '%x%'` is instant |
| partial index `WHERE hidden=false` | plain index on `(category, sort_order)` | |
| `ON CONFLICT DO NOTHING` | supported natively | newsletter only — being dropped |

The two genuine semantic traps, both called out in code comments already:

- **`replaceProductImages` keeps `products.images` (denormalised URLs) and
  `product_images` (attribution) in step, positionally.** Any port must keep
  them consistent, or the storefront renders a photographer's credit on the
  wrong photo. The existing `creditByUrl` index-by-URL approach is the right
  defence — keep it.
- **Regex CHECKs must move to Zod.** `shared/src/index.ts` already exports
  `imageUrlSchema` and `internalPathSchema` doing exactly this, so validation
  quality goes *up*, not down.

Use `bun:sqlite` (verified working on Bun 1.4.0, zero native deps, no
`node-gyp`). `node:sqlite` also works, but Bun is already the toolchain.

### 5.3 Publish: `git push` replaces the deploy hook

Delete `apps/api/src/lib/deploy.ts`. The comment there already reasons that the
hook is "a bearer secret" and that `git push` is the alternative — the
alternative is now the only path, which removes the secret entirely.

`git push` to `main` *is* the rebuild trigger, so no deploy hook is configured
and nothing burns build minutes on a no-op.

**Extend the existing `PublishState` union.** The current three states
(`triggered` / `not-configured` / `failed`) were designed precisely so the
owner can never be told "Saved." when nothing was published. Preserve that
property with states that reflect the new failure modes:

| State | Meaning |
| --- | --- |
| `pushed` | DB written, JSON exported, commit pushed. Build is running. |
| `committed-not-pushed` | Saved and committed; the push failed. Retryable. |
| `pushed-build-unknown` | Pushed, but the build outcome is not observable from here. |
| `dirty-tree` | Refused: unrelated changes in the working tree. |
| `failed` | Nothing was written. |

**Non-negotiable: explicit pathspecs only.**

```bash
# NEVER `git add -A` — a stray edit must not be published as a product change.
git add apps/web/src/data/catalog.json apps/web/public/images/products
```

And refuse to publish when `git status --porcelain` shows changes outside those
paths. This is the highest-consequence failure mode in the whole design: a
blind `git add -A` would sweep an in-progress refactor into a commit labelled
"Update product". A scripted commit is not a safety net.

**Fix the branch mismatch first.** Local branch is `master`; the remote default
is `main` and Cloudflare Pages builds `main`. Publishing before this is fixed
means every push is either a refspec surprise or a no-op on the deploy.

**The `.sqlite` file must not be committed.** `.gitignore` already blocks
`*.sqlite` and `*.db` — leave that in place. The exported `catalog.json` is the
build input, deliberately: JSON diffs reviewably in a PR, and Cloudflare's
builder needs no database driver. Pointing CI at a committed binary SQLite file
would make opaque merge conflicts the norm for the one file that defines the
shop.

**Show drift in the panel.** The existing `snapshotAge` field already records
when the snapshot was generated. Surface "last published" next to the DB's
`updatedAt` so the owner can see when the site is behind the database.

### 5.4 Images — unresolved decision

`storage.ts` writes to Supabase Storage via the service-role key. The panel
needs a new home for uploaded images. Two viable answers:

- **(a) Commit to the repo** — `apps/web/public/images/products/<slug>-<n>.webp`.
  Fully static, zero third-party dependency, hotlink-proof, versioned with the
  product. Costs repo size (mitigate: resize to ~1600px, `webp`, and check
  `astro:assets` for build-time optimisation). *This is the coherent choice
  given "no online compute"* — a CDN is not compute, but it is an online
  dependency and a separate failure mode.
- **(b) Keep Supabase Storage as a dumb image host** — no compute, no API, no
  service-role key needed if uploads go through the panel. Accepts the 5 GB/mo
  egress ceiling already documented in `storage.ts` (~1,400 pageviews/month).

Either way the CSP in `astro.config.mjs` must be revisited: `img-src 'self'
data: https:` was written for hotlinked Supabase URLs. With (a) it tightens to
`img-src 'self' data:` — a genuine improvement. Under (b), keep an explicit
`https://<project>.supabase.co` rather than the wildcard `https:` currently
allowed for `connect-src`, and note that `connect-src https:` exists solely to
let the browser reach the API; with no API it should become `connect-src 'self'`.

### 5.5 Enquiries → WhatsApp

`Inquiry.svelte` already builds a WhatsApp deep link, then *additionally*
fire-and-forgets a `POST /api/orders` whose result is ignored
(`void fetch(...)`, `if (!hasApi) return`). Since orders live on WhatsApp,
delete the POST and keep the link. `whatsappOrderUrl` in `lib/contact.ts` is
the proven pattern — reuse it for a brief/category message so the same
`SALES_REGION` and `PAYMENT_TERMS` notes appear.

Net effect: **the entire order path becomes zero-backend**, and the
`custom_orders` table, `/api/orders`, `OrdersPanel.svelte` (306 LOC),
`/newsletter`, and `admin_note` all disappear.

### 5.6 Access control: loopback, and nothing else

Binding to `127.0.0.1` with no tunnel is the *entire* security model. This is a
strictly stronger posture than what it replaces — today there is a public HTTPS
API guarded by Better Auth plus a publicly deployed admin page.

What this does and does not buy:

- ✅ **No network path to the panel exists.** Not "guarded" — absent. CSRF,
  session theft, credential stuffing and origin spoofing are all structurally
  impossible rather than defended against.
- ⚠️ Anything that can execute code on the machine can drive the panel,
  including a malicious postinstall in the dev dependency tree. Mitigate with a
  committed lockfile, `--frozen-lockfile`, and treating new deps as a review
  event.
- ⚠️ `catalog.sqlite` is plaintext on disk. The `.gitignore` already covers
  `*.sqlite`, so it cannot be committed by accident.
- ⚠️ **The real write control on the live site is git push access to `main`.**
  That is now the crown jewel. Enable branch protection, restrict it to the
  owner's key, and turn on deploy previews for PRs.

Explicitly **do not**:

- Do **not** put the panel behind `cloudflared tunnel`. That would recreate the
  exact public surface this project is removing — and `DEPLOY.md` currently
  documents the tunnel setup for the API, so that section must be deleted too,
  or someone will follow it.
- Do **not** add a password. On loopback it protects nothing and adds a stored
  secret to protect.

### 5.7 The repo becomes the production database

`ab3lo/Crochet-store` is **public** (verified via the GitHub API). Three
consequences:

1. **Confidentiality stops mattering** — the committed artefact is a public
   product list, already fully visible on the live site. Prices and stock are
   not secrets.
2. **Integrity becomes the whole security model.** Anyone who can write to
   `main` can change what the shop sells. That was already true via the deploy
   hook, but it is now unambiguous.
3. **Keep it public** unless there is a reason not to. Making it private would
   remove the free Pages build-from-git and force a different trigger.

Secret scan of the full history: 29 matches for secret-shaped patterns, **all
of them placeholders** (`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` truncated in
docs, `SUPABASE_SERVICE_ROLE_KEY=""`, or prose). No credential material is in
git. The `.gitignore` is thorough — all `.env*` variants with `.env.example`
re-admitted, key/cert extensions, `.pgpass`, `.netrc`, `*.sqlite`, `*.db`.
`PAGES_DEPLOY_HOOK` was env-only by design and leaves with the file.

---

## 6. Work plan

| # | Phase | Days | Notes |
| --- | --- | --- | --- |
| 0 | Recon: reconcile `master`/`main`; back up the live Supabase catalogue | 0.5 | Do this first. Phase 3 pushes to `main`. |
| 1 | SQLite schema + access layer; port `db.ts` | 2 | The real work. Import existing data, verify row counts. |
| 2 | `apps/admin` SvelteKit skeleton; port the 6 components | 3 | `adminFetch` → typed direct call. Port `banner-engine.ts` unchanged. |
| 3 | Publish pipeline: export → explicit `git add` → commit → push → states | 1 | Dirty-tree refusal + branch protection. |
| 4 | Delete `apps/api`; strip `apps/web` (`api.ts`, `config.ts`, islands, deps) | 1.5 | |
| 5 | Enquiry form → WhatsApp; delete `OrdersPanel` + orders/newsletter | 0.5 | |
| 6 | Docs: rewrite `DEPLOY.md`; delete the tunnel section; update `README` | 0.5 | |
| 7 | Decide images (§5.4); tighten CSP; verify build isolation | 0.5 | |
| | **Total** | **9.5** | ~2 calendar weeks solo |

### Verification gates

- [ ] `bun run build` succeeds with **no** network access and **no** `.env`
- [ ] `apps/web/dist/admin` does not exist; the admin SPA is not in any chunk
- [ ] No `fetch` to a non-`self` origin survives in the built JS
- [ ] A product added locally → publish → its page exists after the build
- [ ] Deleting a product removes its page (and its banner links are cleaned)
- [ ] Editing a price with an unrelated dirty file refuses to publish
- [ ] `git log -1` after publish shows only `catalog.json` (+ images)
- [ ] Schema round-trips `details` JSON, `images` array order, and image credits
- [ ] The old API endpoint is dead (no host, tunnel removed from `DEPLOY.md`)

---

## 7. Risk register

| # | Risk | Sev | Mitigation |
| --- | --- | --- | --- |
| 1 | `git add -A`-style sweep publishes unrelated work | **High** | Explicit pathspecs; refuse on dirty tree. Test it. |
| 2 | SQLite port changes `images`/`product_images` sync or credit mapping | **High** | Keep index-by-URL; add a round-trip test on credit attribution. |
| 3 | Publish is not instant — 2–4 min, and only on Publish | Med | Expected. Say so in the UI. Consider batching. |
| 4 | Push to `main` = write access to the live shop | Med | Branch protection, single writer, deploy previews. |
| 5 | `BannersPanel.svelte` (852 LOC) is the most complex surface to port | Med | Port it first as a spike; if it resists, ship products-only and add banners after. |
| 6 | Images undecided (§5.4) | Med | Blocks phase 7 and the CSP. Decide before phase 2. |
| 7 | Cloudflare Pages build minutes | Low | ~30/month at daily cadence. Batch edits. |
| 8 | No server means no uptime monitoring | Low | Trade-off, accepted by design. |

---

## 8. What is deliberately kept

- **The whole cart and checkout.** Already static. `wa.me` needs no backend.
- **The CSP in `astro.config.mjs`.** Correctly built (hashed inline scripts) and
  the comment explaining why a hand-written `_headers` CSP silently killed every
  island is worth preserving verbatim.
- **`banner-engine.ts`.** 401 lines of promotion logic, zero dependencies.
- **`snapshotAge` → `lastPublished`.** The instinct that "saved" and "published"
  are different facts, and that the owner must be able to tell them apart.
- **The public repo.** A product list is not a secret; the build-from-git
  integration is worth more than the concealment.

## 9. What is deleted

`apps/api` in full (1,441 LOC, 6 dependencies) · Better Auth (4 tables, 2
integrations, 210 LOC) · the Supabase project, Storage bucket, and service-role
key · `custom_orders`, `newsletter`, `cache_invalidations` · the Cloudflare
deploy hook · `admin-demo.ts` (508 LOC) · runtime revalidation in 2 islands ·
`OrdersPanel.svelte` (306 LOC) · `PUBLIC_API_URL` / `PUBLIC_AUTH_URL` ·
`build:offline` / `dev:demo` / `dev:offline` · the `cloudflared` section of
`DEPLOY.md`.

**Roughly 4,900 lines and 8 dependencies gone. One committed JSON file and one
`git push` in their place.**
