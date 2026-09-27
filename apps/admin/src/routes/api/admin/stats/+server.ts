/**
 * `GET /api/admin/stats` — the dashboard counters.
 *
 * ## The two counters that are new
 *
 * The deleted API reported `new_orders` and `subscribers`. Both tables are
 * gone, because enquiries are handled on WhatsApp and the newsletter never had
 * a frontend to collect into it.
 *
 * In their place are the two numbers that matter in *this* design:
 *
 *   • `publishedAt` — when `catalog.json` was last regenerated, i.e. when the
 *     live site last saw the catalogue. Read from the file, not the database,
 *     because it is a fact about the site rather than about the shop.
 *   • `lastEditedAt` — the newest `updated_at` across the catalogue.
 *
 * Put side by side they answer the only question that matters after a change:
 * *is the site showing what I just typed?* If `lastEditedAt` is later than
 * `publishedAt`, the answer is no, and the panel says so. That is the same
 * instinct as the deleted `snapshotAge`, promoted from a footnote to a
 * headline.
 */

import { readFile } from 'node:fs/promises';
import { stats, tableCounts } from '$lib/db';
import { CATALOG_PATH } from '$lib/paths';
import { ok, unexpected } from '$lib/server/respond';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  try {
    // A missing or unreadable snapshot is not an error — it means the shop has
    // never been published, which is a state the panel should render, not a
    // failure it should report.
    let publishedAt: string | null = null;
    try {
      const raw = await readFile(CATALOG_PATH, 'utf8');
      const parsed = JSON.parse(raw) as { generatedAt?: string };
      publishedAt = parsed.generatedAt ?? null;
    } catch {
      publishedAt = null;
    }

    return ok({ ...stats(publishedAt), tables: tableCounts() });
  } catch (err) {
    return unexpected(err, 'GET /api/admin/stats');
  }
};
