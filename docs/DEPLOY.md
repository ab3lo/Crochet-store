# Publishing the shop

How a change to the catalogue becomes a change to the live site.

There is no API, no database server, no image host and no deploy hook. The
whole pipeline is:

```
  SQLite                catalog.json              git push              Pages
  ───────               ────────────              ─────────              ─────
  data/catalog.sqlite →  src/data/catalog.json →   origin/main       →   rebuilds
  (your machine)         (committed)               (this is the          (static
                                                       trigger)            HTML)
```

Three things worth understanding before you change anything.

---

## 1. Saving is not publishing

**Editing in the panel changes your computer. It changes nothing else.**

This is the single most important thing to know, and it is a deliberate change
from how this worked before. Previously a save in the admin panel wrote to a
hosted database and immediately fired a Cloudflare deploy hook, so the change
reached the site on its own. There is no hook now, so a save is a local write
and nothing more.

The panel makes this unmissable: the status strip at the top compares

```
  last edited    12:04
  last published 11:30
```

and says **"The shop is behind this catalogue"** when the first is later than
the second. It is a permanent strip, not a toast, because the question "is it
live yet?" is the one you will ask every single time.

### Why not keep auto-publishing?

Because a publish is a `git commit` and a `git push`, and those should be
deliberate. Auto-publishing on every keystroke would mean a commit per
keystroke, and a git history that cannot be read. Making it a button means:

- every commit is a change a person decided to make;
- you can make five edits and publish them as one commit;
- `git revert` cleanly undoes a bad publish;
- you can review what will go live before it goes live.

The cost is that publishing is a separate step. The panel's button is
top-right, and it takes about two seconds.

---

## 2. How to publish

Press **Publish to the shop**, or from a terminal:

```bash
bun run publish
```

That does four things, in order:

1. regenerates `apps/web/src/data/catalog.json` from SQLite
2. `git add`s **only** the catalogue and your product images
3. commits
4. pushes to `main`

The commit message is one line describing the catalogue — `Catalogue: 12 products,
1 live promotion(s)` — so `git log --oneline` reads as a history of the shop
rather than of publishing events. Override it with `bun run publish -m "..."`.

The push is the rebuild trigger. Cloudflare Pages sees the commit and rebuilds;
the site is live a minute or two later.

### It will not touch your other work

A publish commits **the catalogue and your images. Nothing else.** Ever.

Uncommitted changes elsewhere in the repo — a refactor in progress, a README
edit, a scratch file — are none of the panel's business. They stay in your
working tree, untouched, and you commit them yourself when you mean to. The
panel does not list them, does not warn about them, and does not care.

That guarantee comes from two things:

1. `git add` is given an explicit file list, never `-A`. `-A` would sweep the
   working tree into the commit.
2. The git **index** is checked before committing. A plain `git commit` commits
   the index and nothing else, so unstaged work cannot reach it.

There is exactly one case that stops a publish, and it is the one that would
actually corrupt a commit: a file from outside the catalogue that is **already
staged**, which `git commit` would then sweep in.

```
  Not published — these are staged, and a commit takes the whole index, so they
  would go out with the catalogue. Unstage them first:
    • some-other-file.ts

  git restore --staged <file>
```

To publish anyway — having read that list and decided those files *should* go
out with the catalogue:

```bash
bun run publish --force
```

### Other flags

```bash
bun run publish --no-push        # commit but don't push — review it first
bun run publish -m "New: the green bag"
bun run publish --force
```

`--no-push` is the one to reach for when you are unsure. It leaves you with a
commit you can inspect with `git show` before pushing it yourself.

---

## 3. Setting it up

### First run

```bash
git clone <your-repo>
bun install
bun run seed          # twelve demo pieces, so the shop is not empty
bun run admin         # http://127.0.0.1:4322
```

`data/catalog.sqlite` is created on first run and is gitignored. It is a
working file, not source.

### Cloudflare Pages

The storefront is static, so it goes to any static host.

Connect the repo under **Workers & Pages → your project → Settings → Builds →
Connect to Git**, production branch `main`.

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

`BUN_VERSION` is not optional. Cloudflare's build image ships an older Bun that
cannot parse this repo's `bun.lock` (`lockfileVersion: 2`), and the build fails
at `bun install --frozen-lockfile` with `Unknown lockfile version`. Pin it to
the Bun that generated the lockfile rather than `latest`, so the build stays
reproducible.

There is no `PUBLIC_API_URL` any more, and no database URL. If you see either
in a Cloudflare settings page, they are leftovers from the old setup and can be
deleted.

`apps/web/public/_headers` is picked up automatically. It sets HSTS,
`X-Frame-Options: DENY` and caching rules.

**The Content Security Policy is not in `_headers`.** It comes from
`security.csp` in `astro.config.mjs`, which hashes the inline scripts and styles
Astro emits. A hand-written `script-src 'self'` in `_headers` blocks Astro's
hydration bootstrap, so `<astro-island>` is never defined and no Svelte island
on the site hydrates — the pages still render, because the HTML is prerendered,
so it looks like a successful deploy. Only `frame-ancestors` stays in the
header, because a policy in a `<meta>` tag cannot enforce it.

### GitHub Pages

Not used. The storefront is on Cloudflare Pages, and leaving a second deploy
path wired up only meant a failing run on every push. GitHub Pages also cannot
set response headers, so `_headers` would be ignored and there would be no CSP
at all.

If you did move there, the build would need a base-path change in
`astro.config.mjs` and a rewrite for the trailing-slash URLs, since GitHub
Pages serves `/product/x/index.html` at `/product/x/` only with `cleanUrls`.

---

## 4. Protecting the panel

**Do not put the panel on the internet.** Not behind a tunnel, not on a public
host, not on a VPS.

There is no password. There is no session. There is no login page. The entire
access control is that `apps/admin/vite.config.ts` binds to `127.0.0.1`, so
there is no network path to reach it. That is stronger than a login — there is
nothing to phish, steal or brute-force — but it depends entirely on that bind
address.

If you need to reach it from another machine, the answer is a real
authentication layer in front of it, not a tunnel to an unauthenticated panel.
The panel can `git push` to production. Treat it like the SSH key it now
effectively is.

The panel shows a red banner if it detects it is being served on anything other
than localhost. That is a warning, not a control — by the time it appears, the
process is already reachable.

### What protects the live site

Since a publish is a `git push`, **write access to `main` is the real security
boundary of the shop.** Recommended on GitHub:

- branch protection on `main`: require the owner's account, disallow force-push
- no other contributors with write access
- deploy previews on pull requests, so a change is visible before it merges

---

## 5. Everyday use

### Changing a product

Admin panel → Catalogue → Edit → Save. The panel says it is saved locally.
Then Publish.

### Adding a photo

In the product form, choose a file. It is written to
`apps/web/public/images/products/<slug>-<hash>.<ext>` and added to the product.
It goes live with the next publish, in the same commit as the product itself —
which is the point: an image and the caption describing it are one change, so
reverting one reverts the other.

The hash in the filename means a changed photo is always a changed URL, so the
cache headers stay correct.

### Changing a promotion

Admin panel → Promotions. "Generate a promotion" reads the catalogue, picks
products, drafts the copy and the discount, and explains its reasoning. Nothing
is written until you save the draft.

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

`catalog.json` is committed on every publish, so **the git history holds every
published state of the catalogue** — you can see what a price was three months
ago and which commit changed it.

But that is not the same as a backup of your working catalogue, and the
distinction matters:

- `catalog.json` only ever reflects what you have **published**. Edits in the
  panel that you have not published are not in git at all.
- The export is **one-way**: SQLite → JSON. There is no import path back.

So if you lose `data/catalog.sqlite`, the automatic recovery is "whatever was
last published", and anything unpublished since is gone. That is a real gap in
the design, and the reason the database file is worth copying rather than
assuming git has it:

```bash
cp data/catalog.sqlite ~/backups/catalog-$(date +%F).sqlite
```

Until an import script exists, the practical advice is: **publish before you do
anything risky.** Uncommitted work is the only thing at risk, and publishing is
one button.

Banners and products are both in the snapshot, so a copy of the SQLite file is
a complete backup of the catalogue. Product images are in git already, so they
need no separate backup.

---

## 6. Troubleshooting

**The panel says the shop is behind, but I already pushed**

Compare the two timestamps in the status strip. If `last published` is *newer*
than `last edited` but the site still looks old, the build is probably still
running — Pages takes a couple of minutes. Check the deployment in the
Cloudflare dashboard.

If the build *failed*, the site is still serving the last good deploy. Read the
build log. A common cause is a product with a `details` key longer than 200
characters, which passes the panel's form but fails validation on export.

**`dirty-tree` on publish**

Something outside the catalogue is staged. Unstage it and publish again:

```bash
git restore --staged <file>
bun run publish
```

**The push failed but the commit exists**

Your change is safe, it just is not live. Check your connection, then:

```bash
git push origin HEAD:main
```

The panel says the same thing, including the exact command.

**A product shows in the panel but its page 404s**

It has not been published yet. That page is generated at build time from
`catalog.json`, so it exists only after a publish.

**The panel will not start — "EADDRINUSE"**

Something is already on port 4322. It is almost certainly a previous copy of
the panel; `bun run admin` again, or find it with `lsof -i :4322`.

**`Unknown lockfile version` in the Cloudflare build**

`BUN_VERSION` is unset or too old. Set it to `1.4.0` in the project's build
variables.

**A product photo is not updating**

Check the filename changed. If it did not, the same bytes were uploaded, so the
content hash is the same and the URL is the same. That is the caching working
as designed — but if you edited the file outside the panel, run
`bun run placeholders` or re-upload through the form.

---

## Production checklist

- [ ] `PUBLIC_SITE_URL` is your real origin, so canonicals and the sitemap are right
- [ ] `BUN_VERSION` is `1.4.0` in Cloudflare's build variables
- [ ] `main` has branch protection; only your account can push
- [ ] There is no `PUBLIC_API_URL` or `DATABASE_URL` in Cloudflare's settings (delete any leftovers)
- [ ] `data/catalog.sqlite` is gitignored — `git check-ignore data/catalog.sqlite` should succeed
- [ ] The panel is not reachable from anywhere but localhost
- [ ] `bun run build` succeeds with no network access and no `.env` present
