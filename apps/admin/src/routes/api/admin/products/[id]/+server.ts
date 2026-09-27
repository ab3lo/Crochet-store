/**
 * `/api/admin/products/[id]` — read, update, delete one product.
 *
 * The partial update is the interesting part. The deleted API built a
 * `UPDATE … SET col = $1, col = $2` string from the keys present in the body
 * and mapped contract names to column names in a lookup table; that mapping
 * is now `PRODUCT_SETTABLE` inside `$lib/db`, shared with the write path so
 * the two cannot disagree about which keys are real.
 *
 * One behaviour changed deliberately: `images` and `product_images` are
 * replaced together only when the request actually touched the image list, so
 * a rename cannot wipe a photographer's attribution. That was already true and
 * is preserved.
 */

import { productPatchSchema, type Product } from '@crochet/shared';
import {
  deleteProduct,
  getProductById,
  replaceProductImages,
  transact,
  updateProduct,
} from '$lib/db';
import { fail, isUniqueViolation, ok, parseBody, unexpected } from '$lib/server/respond';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
  try {
    const product = getProductById(params.id);
    if (!product) return fail('No such product.', 404);
    return ok(product);
  } catch (err) {
    return unexpected(err, 'GET /api/admin/products/[id]');
  }
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  const parsed = await parseBody(request, productPatchSchema);
  if ('response' in parsed) return parsed.response;
  const input = parsed.data;

  if (Object.keys(input).length === 0) return fail('Nothing to change.', 400);

  try {
    // The attribution rows are keyed to the image list, so this has to happen
    // in the same transaction as the update itself — otherwise a failure
    // between the two leaves a photo on the page with the wrong credit.
    const updated = replaceImagesAndUpdate(params.id, input);
    if (!updated) return fail('No such product.', 404);

    return ok({ id: params.id, product: getProductById(params.id) });
  } catch (err) {
    if (isUniqueViolation(err) && /products\.slug/i.test(String(err))) {
      return fail('That URL slug is already taken.', 409, {
        slug: 'Already in use — add something to the end',
      });
    }
    return unexpected(err, 'PATCH /api/admin/products/[id]');
  }
};

export const DELETE: RequestHandler = ({ params }) => {
  try {
    if (!deleteProduct(params.id)) return fail('No such product.', 404);
    return ok({ deleted: true });
  } catch (err) {
    return unexpected(err, 'DELETE /api/admin/products/[id]');
  }
};

/* ── Helper ───────────────────────────────────────────────────────────── */

/** What a partial product update carries, minus the fields handled separately. */
type PartialInput = Partial<Omit<Product, 'images'>> & {
  images?: Parameters<typeof replaceProductImages>[1];
};

/**
 * Apply a partial product update, replacing image attribution when — and only
 * when — the request touched the image list.
 *
 * Returns `false` when no such row exists. A unique violation is *not* caught
 * here: it propagates so the caller can turn it into a 409 that names the slug,
 * which is the message the form needs.
 */
function replaceImagesAndUpdate(id: string, input: PartialInput): boolean {
  return transact(() => {
    const { images, ...rest } = input;

    const changed = updateProduct(id, {
      ...rest,
      ...(images ? { images: images.map((i) => i.url) } : {}),
    });

    if (!changed) return false;

    if (images) replaceProductImages(id, images);
    return true;
  });
}
