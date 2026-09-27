/**
 * `/api/admin/banners` — list and create promotions.
 *
 * The list is hydrated with the products each banner points at, because the
 * panel's editor renders those products as cards next to the live preview. A
 * banner whose products have been deleted is still shown, with fewer cards,
 * rather than being hidden — the owner needs to see that something is wrong
 * with it.
 */

import { bannerInputSchema, type Product } from '@crochet/shared';
import { createBanner, listBanners, listProducts, toBannerViews, transact } from '$lib/db';
import { fail, isUniqueViolation, ok, parseBody, unexpected } from '$lib/server/respond';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
  try {
    return ok(toBannerViews(listBanners()));
  } catch (err) {
    return unexpected(err, 'GET /api/admin/banners');
  }
};

export const POST: RequestHandler = async ({ request }) => {
  const parsed = await parseBody(request, bannerInputSchema);
  if ('response' in parsed) return parsed.response;
  const input = parsed.data;

  try {
    const missing = missingProductIds(input.productIds);
    if (missing.length > 0) {
      return fail('Some of those products no longer exist.', 422, {
        productIds: `${missing.length} selected product(s) were deleted. Pick again.`,
      });
    }

    const id = transact(() =>
      createBanner({
        slug: input.slug,
        name: input.name,
        template: input.template,
        status: input.status,
        headline: input.headline,
        subhead: input.subhead,
        ctaLabel: input.ctaLabel,
        ctaHref: input.ctaHref,
        percentOff: input.percentOff,
        code: input.code,
        tint: input.tint,
        productIds: input.productIds,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        rationale: input.rationale,
      }),
    );

    return ok({ id }, 201);
  } catch (err) {
    // A duplicate code is a normal admin mistake, not a server fault.
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
    return unexpected(err, 'POST /api/admin/banners');
  }
};

/**
 * The ids that do not exist, so the caller can report a 422 naming how many
 * were deleted rather than a bare "invalid".
 *
 * `product_ids` is a JSON array, so this is a read-and-filter rather than the
 * `id = ANY($1::uuid[])` the Postgres version used. At a few dozen ids it is
 * not worth optimising, and doing it in JS means one query instead of a
 * placeholder list whose length is unbounded.
 */
function missingProductIds(ids: string[]): string[] {
  if (ids.length === 0) return [];
  const known = new Set(
    listProducts({ includeHidden: true }).map((p: Product) => p.id),
  );
  return ids.filter((id) => !known.has(id));
}
