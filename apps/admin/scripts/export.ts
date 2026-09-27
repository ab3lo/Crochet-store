/**
 * `bun run export` — regenerate the committed catalogue snapshot.
 *
 * A thin wrapper around `$lib/server/export`. The logic lives there so the
 * panel's publish button and this command cannot disagree about what a
 * snapshot is.
 */

import { exportCatalog, CATALOG_REL } from '../src/lib/server/export';

const result = await exportCatalog({ force: process.argv.includes('--force') });

console.log(
  result.changed
    ? `✓ wrote ${CATALOG_REL}\n  ${result.products} products, ${result.banners} promotion(s)`
    : `– ${CATALOG_REL}\n  unchanged — nothing to write`,
);
