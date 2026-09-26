/**
 * Supabase Storage for product imagery.
 *
 * Cloudflare R2 was the alternative here and remains the better long-term
 * answer: its egress is free and unmetered, where Supabase's free plan allows
 * 5 GB/month across all services and then bills $0.09/GB uncached. R2 needs a
 * payment method on the Cloudflare account, which is not a trade worth making
 * for a shop this size, so the images stay here for now.
 *
 * What that costs, concretely: roughly 1,400 homepage views a month before
 * the 5 GB is spent, at ~300 KB per product image across twelve cards. Two
 * things push that out when it matters — enabling Smart CDN on the bucket
 * moves most reads to the cached tier (another 5 GB free, then $0.03/GB), and
 * serving responsive `srcset` sizes cuts the bytes per view by several times.
 *
 * The bucket is public-read and nothing else. Uploads originate from the
 * authenticated admin API using the service-role key, which never reaches the
 * browser.
 */

import { createClient } from '@supabase/supabase-js';
import { env } from '../env.ts';

const client = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const ALLOWED = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
  ['image/gif', 'gif'],
]);

/** Hard ceiling — 8 MB is plenty for a product photo. */
const MAX_BYTES = 8 * 1024 * 1024;

export interface UploadResult {
  url: string;
  path: string;
}

/**
 * Storage cleanup is deliberately absent. Removing an image URL from a
 * product leaves the object in the bucket: at this shop's volume that costs
 * nothing, and it is safer than a deletion path that could remove the wrong
 * object if a URL were ever mismapped. Empty the bucket by hand occasionally.
 */
export class UploadError extends Error {}

export async function uploadProductImage(
  file: File,
  productId: string,
): Promise<UploadResult> {
  const ext = ALLOWED.get(file.type);
  if (!ext) {
    throw new UploadError('Use a JPEG, PNG, WebP, AVIF or GIF image.');
  }
  if (file.size > MAX_BYTES) {
    throw new UploadError('Images need to be under 8 MB.');
  }

  // Deterministic, collision-free name that does not leak the original
  // filename into a public URL.
  const stamp = Date.now().toString(36);
  const rand = crypto.randomUUID().slice(0, 8);
  const path = `${productId}/${stamp}-${rand}.${ext}`;

  const { error } = await client.storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    console.error('[storage] upload failed:', error.message);
    throw new UploadError('The upload did not go through. Try again.');
  }

  const { data } = client.storage.from(env.SUPABASE_STORAGE_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}
