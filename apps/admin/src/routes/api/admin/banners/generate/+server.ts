/**
 * `POST /api/admin/banners/generate` — the promotion auto-generator.
 *
 * Returns a **draft** plus the reasoning behind it, and writes nothing. The
 * owner sees which products were chosen and why, and can change every field
 * before saving. Generating straight to the database would mean a sale could
 * go live from a button press with no review, which is not a risk worth
 * taking for something that changes what customers pay.
 *
 * The logic is `apps/api/src/lib/banner-engine.ts`, moved here byte-for-byte.
 * It was always a pure function of its arguments — it cannot see the database
 * and it never could, which is why `takenCodes` has to be passed in — so
 * porting it was a file move rather than a rewrite.
 */

import type { Banner } from '@crochet/shared';
import { generateBanner } from '$lib/banner-engine';
import { listBanners, listProducts } from '$lib/db';
import { fail, ok, unexpected } from '$lib/server/respond';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as {
    category?: string;
    maxProducts?: number;
    forceTemplate?: string;
    noOccasion?: boolean;
  };

  try {
    const products = listProducts({ includeHidden: false });
    const existing = listBanners();

    const result = generateBanner(products, {
      ...(body.category ? { category: body.category } : {}),
      ...(body.maxProducts ? { maxProducts: body.maxProducts } : {}),
      ...(body.forceTemplate ? { forceTemplate: body.forceTemplate as Banner['template'] } : {}),
      ...(body.noOccasion ? { noOccasion: true } : {}),
      // So the generated code cannot collide with a campaign already running.
      takenCodes: existing.map((b) => b.code).filter((c): c is string => Boolean(c)),
    });

    if (!result) {
      return fail(
        'Nothing to promote — add a few products, or widen the category filter.',
        422,
      );
    }

    return ok(result, 201);
  } catch (err) {
    return unexpected(err, 'POST /api/admin/banners/generate');
  }
};
