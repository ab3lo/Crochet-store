/**
 * `POST /api/admin/upload` — write a product photo into the repository.
 *
 * The Supabase Storage version of this needed a service-role key, a bucket, a
 * MIME allowlist and a size ceiling, because it was uploading to someone else's
 * server. Writing to `apps/web/public/images/products/` needs none of that —
 * see `lib/images.ts` for why the repo is the right home and what it costs.
 *
 * Rejects an oversized body from the `Content-Length` header *before* calling
 * `formData()`, which would otherwise buffer the whole thing into memory. That
 * check mattered when the API was public; it still matters because a bad
 * request should not be able to make the panel unresponsive.
 */

import { saveProductImage, UploadError } from '$lib/images';
import { fail, ok, unexpected } from '$lib/server/respond';
import type { RequestHandler } from './$types';

const MAX_BODY = 9 * 1024 * 1024;

export const POST: RequestHandler = async ({ request }) => {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BODY) {
    return fail('That image is too large. Keep it under 8 MB.', 413);
  }

  const form = await request.formData().catch(() => null);
  if (!form) return fail('Expected a file upload.', 400);

  const file = form.get('file');
  if (!(file instanceof File)) return fail('No file in the upload.', 400);

  // The slug decides the filename stem, so it is validated the same way the
  // database path is: it becomes a filename, so it must be boring.
  const slug = form.get('slug');
  if (typeof slug !== 'string' || !slug.trim()) return fail('Missing product slug.', 400);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return fail('Invalid product slug.', 400);
  }

  try {
    return ok(await saveProductImage(file, slug), 201);
  } catch (err) {
    if (err instanceof UploadError) return fail(err.message, 422);
    return unexpected(err, 'POST /api/admin/upload');
  }
};
