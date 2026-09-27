/**
 * Product images, written into the repository.
 *
 * ## Why the repo and not a bucket
 *
 * The brief was "no dependence on online compute", and an image host is an
 * online dependency even though it is not compute. Supabase Storage was 83
 * lines and one service-role key; a CDN would have been better; R2 better
 * still — and all three are a third party that can be slow, down, out of credit
 * or gone in two years, holding the pictures that *are* the shop.
 *
 * A product photo is small, changes when the product changes, and belongs in
 * version control next to the product. Committing it makes the image and the
 * caption describing it one atomic change, so reverting a bad product also
 * reverts its photo, and `git log --follow` answers "when did this change, and
 * with what?".
 *
 * The cost is repository size. `MAX_BYTES` and `normaliseName` are the two
 * things that actually control it.
 *
 * ## Why filenames are content-addressed
 *
 * `normaliseName` puts a short hash of the bytes in the filename, so a changed
 * photo gets a new URL and the immutable cache header stays correct — a stable
 * filename whose bytes changed would be cached for a year at the old image. It
 * also keeps the original filename out of the public URL space, so a photo
 * called `final_v2_REAL copy.jpeg` never becomes part of the shop's URLs.
 */

import { createHash } from 'node:crypto';
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Must match `apps/web/public/`, which Astro copies verbatim. */
export const IMAGES_DIR = join(here, '..', '..', '..', 'web', 'public', 'images', 'products');

/** The public URL prefix for that directory. */
export const IMAGES_PREFIX = '/images/products';

export class UploadError extends Error {}

/**
 * 8 MB. A phone photo of a crochet purse is 2–4 MB; anything larger is a
 * mistake or a video.
 */
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Formats kept, and why webp is not forced.
 *
 * A conversion would cut the bytes by roughly two thirds, and it is the single
 * biggest lever on repository size. It is *not* done here because a silent
 * re-encode is a silent quality change to the thing a customer is looking at,
 * and picking the quality/format trade for the shop's photographs is the
 * owner's call, not this file's. If size becomes a problem, the place to do
 * it is a deliberate batch step, not an invisible one on upload.
 */
const ALLOWED = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
  ['image/gif', 'gif'],
]);

const EXT_BY_FILENAME: Record<string, string> = {
  jpg: 'jpg',
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
  gif: 'gif',
};

/**
 * A filesystem-safe stem taken from the product slug, plus a content hash.
 *
 * Slug rather than the product name, because the slug is already the stable
 * public identifier for the product and is guaranteed to be URL-safe by the
 * schema. The hash is what makes the URL change when the bytes change.
 */
function normaliseName(stem: string, bytes: Uint8Array): string {
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 10);

  const safeStem =
    stem
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'image';

  return `${safeStem}-${hash}`;
}

export interface SavedImage {
  /** Site-relative path — what goes in `products.images`. */
  url: string;
  /** Repository-relative path — what a publish commit contains. */
  repoPath: string;
  bytes: number;
}

/**
 * Write an uploaded image into the repository.
 *
 * `slug` is the product's slug. Two uploads of identical bytes produce the
 * same path, so re-uploading the same photo twice does not create two files —
 * the second write overwrites the first with identical content.
 */
export async function saveProductImage(
  file: File,
  slug: string,
): Promise<SavedImage> {
  if (file.size === 0) throw new UploadError('That file is empty.');
  if (file.size > MAX_BYTES) throw new UploadError('Images need to be under 8 MB.');

  // Trust the declared type only as a first pass, then fall back to the
  // extension — some browsers send `application/octet-stream` for a perfectly
  // ordinary file, and rejecting a real photo over that is worse than useless.
  const fromType = ALLOWED.get(file.type);
  const fromName = EXT_BY_FILENAME[(file.name.split('.').pop() ?? '').toLowerCase()];
  const ext = fromType ?? fromName;

  if (!ext) {
    throw new UploadError('Use a JPEG, PNG, WebP, AVIF or GIF image.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // A file that claims to be an image but is not would land in `public/` and
  // be served with an image extension. Sniffing the magic number is cheap and
  // this directory is committed, so it is worth the six lines.
  if (!looksLikeImage(bytes, ext)) {
    throw new UploadError('That file is not an image the browser can display.');
  }

  const name = `${normaliseName(slug, bytes)}.${ext}`;

  await mkdir(IMAGES_DIR, { recursive: true });
  const target = join(IMAGES_DIR, name);

  // Belt and braces against a slug that somehow escaped normalisation and
  // tried to traverse out of the images directory.
  if (!normalize(target).startsWith(normalize(IMAGES_DIR) + sep)) {
    throw new UploadError('Bad product slug.');
  }

  await writeFile(target, bytes);

  return {
    url: `${IMAGES_PREFIX}/${name}`,
    repoPath: `apps/web/public/images/products/${name}`,
    bytes: bytes.length,
  };
}

/** First bytes of each format. Cheap, and enough to reject a renamed file. */
function looksLikeImage(bytes: Uint8Array, ext: string): boolean {
  /** Does the slice starting at `at` begin with `expected`? */
  const has = (at: number, ...expected: number[]): boolean =>
    expected.every((byte, i) => bytes[at + i] === byte);

  switch (ext) {
    case 'jpg':
      return has(0, 0xff, 0xd8);
    case 'png':
      return has(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'gif':
      return has(0, 0x47, 0x49, 0x46);
    case 'webp':
      // "RIFF" at 0, then four size bytes, then "WEBP" at 8.
      return has(0, 0x52, 0x49, 0x46, 0x46) && has(8, 0x57, 0x45, 0x42, 0x50);
    case 'avif':
      // ISO-BMFF: "ftyp" at 0, then the major brand at 8.
      return has(0, 0x66, 0x74, 0x79, 0x70) && has(8, 0x61, 0x76, 0x69, 0x66);
    default:
      return true;
  }
}

/**
 * Total bytes in the image directory, for the panel's storage footer.
 *
 * Repository size is the ongoing cost of this design, and it is not visible
 * anywhere else — `du -sh .git` includes every historical version of every
 * photo, which is not what this reports. This is the size of what a *clone*
 * carries today.
 */
export async function imageDirStats(): Promise<{ count: number; bytes: number }> {
  if (!existsSync(IMAGES_DIR)) return { count: 0, bytes: 0 };

  const entries = await readdir(IMAGES_DIR, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile());

  const sizes = await Promise.all(
    files.map((f) => stat(join(IMAGES_DIR, f.name)).then((s) => s.size)),
  );

  return { count: files.length, bytes: sizes.reduce((a, b) => a + b, 0) };
}

/**
 * Delete an image file.
 *
 * Only ever called for a path inside `IMAGES_DIR`, and only when the product
 * is being deleted. It is best-effort: the file being left behind is untidy
 * but harmless, and a *wrong* file being deleted is not — so the containment
 * check is the part that matters, not the cleanup.
 */
export async function deleteProductImage(url: string): Promise<boolean> {
  if (!url.startsWith(`${IMAGES_PREFIX}/`)) return false;

  const name = url.slice(IMAGES_PREFIX.length + 1);
  const target = join(IMAGES_DIR, name);

  if (!normalize(target).startsWith(normalize(IMAGES_DIR) + sep)) return false;
  if (!existsSync(target)) return false;

  await unlink(target);
  return true;
}
