/**
 * Every path the publish pipeline touches, in one place.
 *
 * These are the paths that decide what a publish commit is allowed to contain,
 * so they live together rather than being spelled out at each use. Getting one
 * of them subtly different between the export, the staging check and the
 * verification step is exactly the bug that would let an unrelated file into a
 * commit labelled "Publish catalogue".
 *
 * Absolute paths are resolved from this file's location, so the scripts work
 * from any working directory and the values never depend on where a command
 * happened to be run.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The workspace root, which is also the git root.
 *
 * Four levels up from `apps/admin/src/lib`. Counted once, here, because this
 * value decides what a publish commit is allowed to contain — and an off-by-one
 * silently produces a path that does not exist, which is at least a loud
 * failure rather than a quiet one.
 */
export const ROOT = join(here, '..', '..', '..', '..');

/** Where the storefront reads the catalogue from, absolutely. */
export const CATALOG_PATH = join(ROOT, 'apps', 'web', 'src', 'data', 'catalog.json');

/** Repository-relative, for log output and for `git add` messages. */
export const CATALOG_REL = 'apps/web/src/data/catalog.json';

/** Where uploaded product images are written. */
export const IMAGES_REL = 'apps/web/public/images/products';

/**
 * The only paths a publish commit may ever contain.
 *
 * `catalog.json` is the catalogue. The image directory is here because
 * uploading a photo writes a file into the repo — see `lib/images.ts`.
 * Nothing else is allowed, and this array is the enforcement point rather
 * than a convention.
 */
export const PUBLISH_PATHS = [CATALOG_REL, IMAGES_REL];

/** The branch Cloudflare Pages builds, and therefore the publish target. */
export const PRODUCTION_BRANCH = 'main';

export const REMOTE = 'origin';

/** Is `path` inside one of the publishable directories? */
export function isPublishable(path: string): boolean {
  return PUBLISH_PATHS.some((allowed) => path === allowed || path.startsWith(`${allowed}/`));
}
