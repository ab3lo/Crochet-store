# Connecting Supabase & deploying

Written for someone setting this up for the first time. Follow it in order —
step 3 needs step 1's connection string, and step 7 needs step 6.

---

## Contents

1. [What you are deploying](#1-what-you-are-deploying)
2. [Create the Supabase project](#2-create-the-supabase-project)
3. [Set up the database](#3-set-up-the-database)
4. [Set up storage for product photos](#4-set-up-storage-for-product-photos)
5. [Run the API locally](#5-run-the-api-locally)
6. [Deploy the API](#6-deploy-the-api)
7. [Deploy the storefront](#7-deploy-the-storefront)
8. [Verify](#8-verify)
9. [Everyday use](#9-everyday-use)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. What you are deploying

Two separate things. They do not deploy together and they do not talk at
build time.

| | What | Where | Needs secrets? |
| --- | --- | --- | --- |
| **Storefront** | `apps/web` — 22 static HTML pages | Cloudflare Pages | No. Only two public URLs. |
| **API** | `apps/api` — a Bun + Hono process | Fly.io, Railway, Render, a VPS | Yes. Five secrets. |

The storefront is fully static. It renders from a committed snapshot
(`apps/web/src/data/catalog.json`), so a build never fails because the
database is down. The API is only needed at *runtime*, for the admin panel
and for the catalogue to update between deploys.

```
  Browser ──────► Cloudflare Pages                  (static HTML, no secrets)
     │                            │
     │  /admin  ────────────────► │  calls the API with the session cookie
     ▼                            ▼
  shopper                    Bun + Hono API  ────►  Supabase Postgres
                                 │                └──►  Supabase Storage
                                 └── Better Auth (sessions, admin role)
```

---

## 2. Create the Supabase project

1. Go to <https://supabase.com/dashboard> → **New project**.
2. Name it anything (`crochet-shop`). Pick the region **closest to Bahawalpur**
   — Mumbai (ap-south-1) is the nearest one. Database latency is the one thing
   you can still change cheaply later.
3. **Save your database password.** This is the one password you cannot
   recover from the dashboard.
4. Wait ~2 minutes for provisioning.

You need two things from **Settings → API**:

| Field | Where | Goes to |
| --- | --- | --- |
| Project URL | Project Settings → API | `SUPABASE_URL` |
| Service Role Key | Project Settings → API → *service_role* | `SUPABASE_SERVICE_ROLE_KEY` |

> The **service role key bypasses Row Level Security.** It is a master
> password for your database. It goes in the API's environment and nowhere
> else — never in `apps/web`, never in git, never in a Cloudflare Pages
> environment variable. If you ever paste one into a chat, rotate it in the
> dashboard immediately.

---

## 3. Set up the database

### 3a. Create the file

```bash
cp .env.example .env
```

Now fill in `.env`:

```bash
NODE_ENV=production
PORT=8787

# openssl rand -base64 32
BETTER_AUTH_SECRET=paste_a_32_plus_character_random_string_here
BETTER_AUTH_URL=https://your-api.fly.dev
BETTER_AUTH_TRUSTED_ORIGINS=https://your-shop.pages.dev

# Settings → Database → Connection string → URI
# Use the DIRECT one, or the SESSION pooler on port 5432.
# Do NOT use port 6543: that is transaction mode only, and its role
# (`postgres.<ref>`) neither owns the tables nor bypasses RLS — so every
# query would return zero rows with no error, which looks like an empty shop.
DATABASE_URL=postgresql://postgres.yourref:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres

# Product images are in Supabase Storage.
# Cloudflare R2 would be the better host — its egress is free and unmetered,
# where this free plan allows 5 GB/month across all services and then bills
# $0.09/GB uncached (~1,400 homepage views a month at 12 product images).
# R2 needs a payment method on the Cloudflare account, so it is not worth the
# trade at this size. If image traffic grows, move the bucket: nothing in
# product_images knows which host serves the bytes.
SUPABASE_URL=https://yourref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_STORAGE_BUCKET=product-images
SEED_ADMIN_EMAIL=you@example.com
```

**Use the pooler connection string.** A long-lived server on a direct
connection exhausts Supabase's connection slots quickly, and you will get
`too many connections` errors that look nothing like the cause.

**`BETTER_AUTH_TRUSTED_ORIGINS` is a comma-separated list.** Your storefront
origin must be in it or the admin panel gets blocked by CORS. Localhost too,
while you are developing.

### 3b. Run the migrations

```bash
bun install
bun run db:migrate
```

This creates every table. Expected output:

```
  ✓ 0001_storefront.sql
  ✓ 0002_better_auth.sql
Applied 2 migration(s).
```

> **`0002_better_auth.sql` is hand-written, and the quotes matter.** Better
> Auth's Kysely adapter uses camelCase field names verbatim, so the column is
> `"emailVerified"`. Postgres folds *unquoted* identifiers to lower case,
> which would create `"emailverified"` and then break every sign-in with
> `column "emailVerified" of relation "user" does not exist`. If you ever
> extend that file, quote every identifier.
>
> The Better Auth CLI is not used, on purpose: it depends on `better-sqlite3`,
> which needs a native build (`node-gyp`) even though this project only ever
> talks to Postgres. That fails on a Bun-only machine.

### 3c. Optional: seed the demo catalogue

```bash
bun run seed
```

Twelve products and one promotion, so the shop is not empty on first load.
Skip it if you would rather enter your own pieces through the admin panel.

---

## 4. Set up storage for product photos

1. **Storage** → **New bucket**
2. Name: `product-images` (must match `SUPABASE_STORAGE_BUCKET`)
3. **Public bucket**: on
4. **File size limit**: 10 MB (the API rejects anything over 8 MB)
5. Save.

The bucket is public because the storefront has to hotlink images from it. It
contains nothing but product photos. Uploads still go through the API's
authenticated endpoint, so only you can add to it.

No RLS policies are needed: the API uses the service-role key, and reads are
anonymous. Do **not** add a public write policy — that would let anyone
upload to your bucket.

---

## 5. Run the API locally

```bash
bun run dev:api        # http://localhost:8787
```

Check it: <http://localhost:8787/api/health> should return
`{"ok":true,"data":{"status":"up",…}}`.

Then the storefront:

```bash
echo 'PUBLIC_API_URL=http://localhost:8787' >> apps/web/.env
echo 'PUBLIC_SITE_URL=http://localhost:4321'  >> apps/web/.env
bun run dev            # http://localhost:4321
```

Create your owner account and sign in at <http://localhost:4321/admin>:

```bash
SEED_ADMIN_EMAIL=you@example.com \
SEED_ADMIN_PASSWORD='a long passphrase of at least 12 characters' \
bun run create-admin
```

> After this, **sign out and back in.** Better Auth caches the session in a
> signed cookie for five minutes, so a role change is invisible to the session
> you already have. Run `create-admin` again at any time to restore access —
> it is idempotent.

---

## 6. Deploy the API

The API is one Bun process with no platform-specific bindings, so any Bun host
works. Fly.io is the shortest path.

### Fly.io

```bash
bunx fly@latest auth login
bunx fly@latest launch --no-deploy --name crochet-api --region bom
bunx fly@flyctl.dev secrets set \
  NODE_ENV=production \
  BETTER_AUTH_SECRET="..." \
  BETTER_AUTH_URL="https://crochet-api.fly.dev" \
  BETTER_AUTH_TRUSTED_ORIGINS="https://your-shop.pages.dev,http://localhost:4321" \
  DATABASE_URL="postgresql://...?sslmode=require" \
  SUPABASE_URL="https://yourref.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="..." \
  TRUSTED_PROXY=false
bunx fly@latest deploy
bunx fly@flyctl.org scale count 1      # do not scale to 2
```

Two things to know:

- **Keep it at one instance.** The rate limiter is in memory, so a second
  instance doubles every allowance. At this shop's traffic one is plenty.
- **`TRUSTED_PROXY`** stays `false` on Fly, because Fly terminates TLS itself
  and the origin is public. Set it to `true` only if you put the API behind
  Cloudflare, which overwrites `cf-connect-ip`.

Your API is now at `https://crochet-api.fly.dev`.

### Railway / Render

Equivalent: build command `bun install`, start command `bun run --cwd apps/api
start`, root directory `apps/api`, and add the same seven environment
variables. Railway needs a `bunfig.toml`-free setup; nothing special.

### A VPS

```bash
# Docker
docker run -d --name crochet-api --restart unless-stopped -p 8787:8787 \
  --env-file .env oven/bun:1 docker-entrypoint bun run --cwd apps/api start
```

Put nginx or Caddy in front for TLS. Set `BETTER_AUTH_URL` to the https URL.

### The API's Docker image (optional)

```dockerfile
FROM oven/bun:1
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --production
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
CMD ["bun", "run", "--cwd", "apps/api", "start"]
```

---

## 7. Deploy the storefront

The storefront is static, so it goes to any static host.

### Cloudflare Pages

The storefront deploys here. Connect the repo under **Workers & Pages →
`<project>` → Settings → Builds → Connect to Git**, production branch `main`.

| Setting | Value |
| --- | --- |
| Framework preset | Astro |
| Build command | `bun run build` |
| Build output directory | `apps/web/dist` |
| Root directory | *(leave blank)* |

Build variables and environment variables → **both** Production and Preview:

| Variable | Kind | Value |
| --- | --- | --- |
| `BUN_VERSION` | build | `1.4.0` |
| `PUBLIC_SITE_URL` | env | your shop's public origin |
| `PUBLIC_API_URL` | env | your deployed API, or leave unset for snapshot-only |

`BUN_VERSION` is not optional. Cloudflare's build image ships Bun 1.2, and
`bun.lock` is `lockfileVersion: 2`, which 1.2 cannot parse. Without it the
build fails at `bun install --frozen-lockfile` with `Unknown lockfile
version`. Pin it to the Bun that generated the lockfile rather than `latest`,
so the build stays reproducible.

`apps/web/public/_headers` is picked up automatically. It sets HSTS,
`X-Frame-Options: DENY` and immutable caching for hashed assets.

**The Content Security Policy is not in `_headers`.** It comes from
`security.csp` in `astro.config.mjs`, which hashes the inline scripts and
styles Astro emits. A hand-written `script-src 'self'` in `_headers` blocks
Astro's hydration bootstrap, so `<astro-island>` is never defined and no Svelte
island on the site hydrates — the pages still render, because the HTML is
prerendered, so it looks like a successful deploy. Only `frame-ancestors`
stays in the header, because a policy in a `<meta>` tag cannot enforce it.

### GitHub Pages

Not used. A workflow for it existed and was removed: the storefront is on
Cloudflare Pages, and leaving a second deploy path wired up only meant a
failing run on every push to `main`.

GitHub Pages cannot set response headers, so `_headers` is ignored there —
which would mean no CSP at all. For the same reason it is not a fallback
worth keeping. `/admin` is a static page like any other; it holds no secrets
(the guard is `role === 'admin'` in the API), and `robots.txt` plus a
`noindex` meta tag keep it out of search results.

### Adding a custom domain

Cloudflare Pages: **Custom domains** → add the domain → add the CNAME it gives
you at your DNS provider. TLS is automatic.

Then update two things, or you will ship a site with the wrong canonical URLs:

- `PUBLIC_SITE_URL` on the storefront
- `BETTER_AUTH_TRUSTED_ORIGINS` on the API

---

## 8. Verify

Work down this list. Each one catches a specific misconfiguration.

```bash
# 1. The API is up and the database is reachable
curl https://crochet-api.fly.dev/api/health
#    → {"ok":true,...}

# 2. CORS is scoped to your storefront, not the world
curl -si -X OPTIONS https://crochet-api.fly.dev/api/products \
  -H "Origin: https://your-shop.pages.dev" \
  -H "Access-Control-Request-Method: GET" | grep -i access-control-allow-origin
#    → Access-Control-Allow-Origin: https://your-shop.pages.dev

curl -si -X OPTIONS https://crochet-api.fly.dev/api/products \
  -H "Origin: https://evil.example" \
  -H "Access-Control-Request-Method: GET" | grep -ci access-control-allow-origin
#    → 0   (no header, which is the point)

# 3. The admin API refuses anonymous callers
curl -s https://crochet-api.fly.dev/api/admin/products
#    → {"ok":false,"error":"Sign in to the admin panel first."}

# 4. Nothing sensitive leaked into the client bundle
curl -s https://your-shop.pages.dev/_astro/*.js | grep -c "supabase.co"
#    → small number (the public project URL is fine)
curl -s https://your-shop.pages.dev/_astro/*.js | grep -c "service_role"
#    → 0
```

Then, in a browser:

- [ ] The shop loads on <https://your-shop.pages.dev>
- [ ] Products, prices in Rs, and the Bahawalpur delivery note are present
- [ ] <https://your-shop.pages.dev/admin> asks you to sign in
- [ ] You can sign in and see the catalogue
- [ ] Adding a product with an image works
- [ ] "Generate a promotion" → publish → the storefront shows the reduced price
- [ ] `/admin` is **not** in Google (check `view-source:` for `noindex`)

---

## 9. Everyday use

### Changing a product

Admin panel → Catalogue → Edit → Save. Done. The storefront islands re-fetch
from the API, so the change appears within a minute without a redeploy.

**But a new product needs a deploy.** Product pages are prerendered at build
time from the snapshot, so a piece that has never been built has no page yet.
To publish one:

```bash
bun run snapshot     # rewrites catalog.json from the live API
git add apps/web/src/data/catalog.json
git commit -m "Add the strawberry coin purse"
git push             # triggers the deploy
```

### Changing the theme

```bash
# edit the hue values in apps/web/scripts/build-theme.ts
bun run theme
git commit -am "Warmer rose"
git push
```

### Changing prices or the delivery city

`SALES_REGION` lives in `shared/src/index.ts`. One edit updates the product
pages, the basket, the shipping page and every outbound WhatsApp message.

### Backing up

Supabase: **Settings → Database → Backups** for daily snapshots. The catalogue
is also in git, so the worst realistic loss is a week of promotion history.

---

## 10. Troubleshooting

**`column "emailVerified" of relation "user" does not exist`**

Better Auth's schema was created with the identifiers unquoted, so Postgres
lowercased them. Re-run `0002_better_auth.sql` after fixing the quotes — or,
if you have no data yet:

```bash
psql "$DATABASE_URL" -c 'DROP TABLE IF EXISTS "verification","account","session","user" CASCADE'
psql "$DATABASE_URL" -c "DELETE FROM _migrations WHERE name = '0002_better_auth.sql'"
bun run db:migrate
```

**`too many connections` from Supabase**

You are on the direct connection string. Switch to the pooler one (port 6543).

**Admin panel: "The API is not connected"**

`PUBLIC_API_URL` is empty, or the storefront was built before you set it. It
is a build-time value — set it and rebuild, not just restart.

**Admin panel: CORS error in the console**

Your storefront origin is not in `BETTER_AUTH_TRUSTED_ORIGINS`. The exact
origin, with scheme, no trailing slash. Update it on the API and restart it.

**Signed in, but every admin page says "This area is for the shop owner."**

You promoted the account after signing in and the 5-minute session cache is
still holding the old role. Sign out and back in.

**Image upload fails but everything else works**

Check the bucket is named `product-images` and is **public**, and that
`SUPABASE_SERVICE_ROLE_KEY` is the service-role key, not the `anon` key. The
`anon` key cannot write.

**The sales strip is not moving**

Svelte prunes `@keyframes` declared inside a component's `<style>`. The
animation and its keyframes must live in `apps/web/src/styles/global.css`.
Check the built CSS actually contains the keyframes:

```bash
grep -o '@keyframes [a-z-]*' apps/web/dist/_astro/*.css | sort -u
```

**A product shows but its page 404s**

It was added after the last build. See [step 9](#9-everyday-use) — it needs
`snapshot` and a deploy.

---

## Production checklist

```bash
# Secrets are set, and NODE_ENV is not development
grep -q 'NODE_ENV=production' .env && echo "NODE_ENV ok"

# The auth secret is long enough and is not the example
grep '^BETTER_AUTH_SECRET=.\{32,\}' .env > /dev/null && echo "secret ok"

# No service-role key in the web app
grep -r "service_role" apps/web/ --include="*.ts" --include="*.svelte" --include="*.astro" --include="*.json" \
  && echo "!! LEAK — rotate the key in the Supabase dashboard"

# Nothing in the client bundle
grep -r "SUPABASE_SERVICE_ROLE\|BETTER_AUTH_SECRET" apps/web/ && echo "!! LEAK"
```

- [ ] `BETTER_AUTH_SECRET` is 32+ random characters, unique, not in git
- [ ] `SEED_ADMIN_PASSWORD` removed from `.env` after `create-admin`
- [ ] `NODE_ENV=production` — this is what stops Postgres error text reaching
      the browser
- [ ] `PUBLIC_SITE_URL` set, so canonical URLs and the sitemap are right
- [ ] `PUBLIC_API_URL` points at the deployed API, over **https**
- [ ] Your storefront origin is in `BETTER_AUTH_TRUSTED_ORIGINS`
- [ ] Pooler connection string, not the direct one
- [ ] Storage bucket is public; the service-role key is server-side only
- [ ] `.env` is gitignored — `git check-ignore .env` should succeed
- [ ] `/admin` is `noindex`
