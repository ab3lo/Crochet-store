/**
 * Every path the publish pipeline touches.
 *
 * Collected here because they decide what a publish commit may contain, and a
 * mismatch between the export, the staging step and the verification step is
 * exactly how an unrelated file gets into a commit labelled with the
 * catalogue.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The workspace root, which is also the git root.
 *
 * Four levels up from `apps/admin/src/lib`. Counted once, here, because an
 * off-by-one produces a path that does not exist — loudly, luckily, but it did
 * briefly create a second database at `apps/data/`.
 */
export const ROOT = join(here, '..', '..', '..', '..');

export const CATALOG_PATH = join(ROOT, 'apps', 'web', 'src', 'data', 'catalog.json');
export const CATALOG_REL = 'apps/web/src/data/catalog.json';
export const IMAGES_REL = 'apps/web/public/images/products';

/**
 * The only paths a publish commit may ever contain. Uploading a photo writes a
 * file into the repo, so images belong here; nothing else is allowed, and this
 * array is the enforcement point rather than a convention.
 */
export const PUBLISH_PATHS = [CATALOG_REL, IMAGES_REL];

/** The branch Cloudflare Pages builds, and therefore the publish target. */
export const PRODUCTION_BRANCH = 'main';

export const REMOTE = 'origin';

/** Is `path` inside one of the publishable directories? */
export function isPublishable(path: string): boolean {
  return PUBLISH_PATHS.some((allowed) => path === allowed || path.startsWith(`${allowed}/`));
}
