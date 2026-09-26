/**
 * Cloudflare R2 for product imagery.
 *
 * R2 rather than Supabase Storage, for the free tier: R2's egress is free
 * and unmetered, while Supabase's free plan allows 5 GB/month and then bills
 * $0.09/GB. A twelve-product shop sits comfortably inside the storage quota
 * either way, but Supabase has a bandwidth cliff and R2 does not.
 *
 * It is also the same vendor as the Pages deploy, so the images can be served
 * from a domain in the same zone — same origin as the site, no cross-origin
 * TLS handshake on the repeat visit that actually matters.
 *
 * Uses `Bun.S3Client` rather than the Workers R2 binding: this API runs as a
 * standalone Bun process on Fly.io or similar, where a Workers binding does not
 * exist. S3Client is built into Bun 1.2+, so this adds no dependency.
 *
 * The bucket is public-read and nothing else. Writes arrive only through this
 * module, authenticated by the R2 credentials in the environment, which never
 * reach the browser. Uploads are never "upsert" — a new key is minted per
 * upload, so replacing an image cannot destroy the file another row still
 * points at.
 *
 * Note on the URLs this returns: they are absolute and are stored in
 * `product_images.url`. Nothing in the schema knows or cares which host serves
 * them, so moving an image between hosts is a re-upload, not a migration.
 */

import { env } from '../env.ts';

const client = new Bun.S3Client({
  // R2's S3-compatible endpoint carries the account id, so there is no
  // separate `accountId` option. `region` is ignored by R2 but the client
  // wants one.
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: 'auto',
  bucket: env.R2_BUCKET,
  accessKeyId: env.R2_ACCESS_KEY_ID,
  secretAccessKey: env.R2_SECRET_ACCESS_KEY,
});

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

  try {
    await client.write(path, file, {
      // Makes the object self-describing for anything fetching it directly,
      // so a browser is not left guessing between eight formats.
      type: file.type,
    });
  } catch (err) {
    console.error('[storage] R2 upload failed:', (err as Error).message);
    throw new UploadError('The upload did not go through. Try again.');
  }

  return { url: `${env.R2_PUBLIC_URL}/${path}`, path };
}
