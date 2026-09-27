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
 *   • `publishedAt` — when the catalogue last reached the live site. Read from
 *     the panel's own publish record, *not* from `catalog.json`.
 *   • `lastEditedAt` — the newest `updated_at` across the catalogue.
 *
 * Put side by side they answer the only question that matters after a change:
 * *is the site showing what I just typed?* If `lastEditedAt` is later than
 * `publishedAt`, the answer is no, and the panel says so. That is the same
 * instinct as the deleted `snapshotAge`, promoted from a footnote to a
 * headline.
 *
 * ## Why not `catalog.json`
 *
 * It did read that, from the file's `generatedAt`, and it was wrong in a way
 * that only shows up when it costs something. `generatedAt` records when the
 * *file* was written, and the file is written by a publish **and** by
 * `bun run export`. So one run of the export script — the documented way to
 * preview what would ship — made this endpoint report that the shop had just
 * been published, and the panel told the owner everything was in sync.
 *
 * The same run then left the file already matching the database, so the next
 * publish found nothing to write and declined to ship the change at all.
 *
 * `lastPublishedAt()` in `$lib/db` is a row written by `publish()` alone, so it
 * cannot be moved by looking.
 */

import { lastPublishedAt, stats, tableCounts } from '$lib/db';
import { ok, unexpected } from '$lib/server/respond';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  try {
    return ok({ ...stats(lastPublishedAt()), tables: tableCounts() });
  } catch (err) {
    return unexpected(err, 'GET /api/admin/stats');
  }
};
