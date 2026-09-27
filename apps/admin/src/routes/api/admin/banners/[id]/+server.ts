/**
 * `/api/admin/banners/[id]` — update, delete, and the auto-generator.
 *
 * `pruneExpired` is called after a save that leaves a banner live, exactly as
 * the deleted API did. It mutates rows the owner did not touch, so it runs
 * inside the same transaction as the edit — a failure rolls the whole thing
 * back rather than archiving on its own.
 */

import { bannerPatchSchema, type Banner } from '@crochet/shared';
import { deleteBanner, listProducts, pruneExpired, toBannerViews, transact, updateBanner } from '$lib/db';
import { fail, isUniqueViolation, ok, parseBody, unexpected } from '$lib/server/respond';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
  const parsed = await parseBody(request, bannerPatchSchema);
  if ('response' in parsed) return parsed.response;
  const input = parsed.data;

  if (Object.keys(input).length === 0) return fail('Nothing to change.', 400);

  try {
    if (input.productIds) {
      const known = new Set(listProducts({ includeHidden: true }).map((p) => p.id));
      const missing = input.productIds.filter((id) => !known.has(id));
      if (missing.length > 0) {
        return fail('Some of those products no longer exist.', 422, {
          productIds: `${missing.length} selected product(s) were deleted. Pick again.`,
        });
      }
    }

    const updated = transact((): Banner | null => {
      const row = updateBanner(params.id, input);
      if (!row) return null;
      // An expired banner should not linger as a storefront strip.
      if (row.status === 'live') pruneExpired();
      return row;
    });

    if (!updated) return fail('No such banner.', 404);

    return ok(toBannerViews([updated])[0]);
  } catch (err) {
    if (isUniqueViolation(err) && /banners\.code/i.test(String(err))) {
      return fail('That discount code is already in use.', 409, {
        code: 'Another promotion already uses this code',
      });
    }
    if (isUniqueViolation(err) && /banners\.slug/i.test(String(err))) {
      return fail('That campaign slug is already taken.', 409, {
        slug: 'Already in use — add something to the end',
      });
    }
    return unexpected(err, 'PATCH /api/admin/banners/[id]');
  }
};

export const DELETE: RequestHandler = ({ params }) => {
  try {
    if (!deleteBanner(params.id)) return fail('No such banner.', 404);
    return ok({ deleted: true });
  } catch (err) {
    return unexpected(err, 'DELETE /api/admin/banners/[id]');
  }
};
