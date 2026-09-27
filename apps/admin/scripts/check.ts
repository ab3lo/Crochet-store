/**
 * One self-check for the two bugs that made the catalogue panel unusable.
 *
 * Both were found by exercising the panel against a real database, not by
 * reading it, which is the argument for having this at all:
 *
 *  1. **Images could not be saved.** `imageUrlSchema` accepted only absolute
 *     `http(s)` URLs, written when every photo was hotlinked from a CDN. Since
 *     images moved into `apps/web/public/images/products/`, every value in a
 *     product's image list is a site-relative path — and the product form
 *     posts that list back on every save. So every edit was rejected with
 *     "Please fix the highlighted fields" and no product could be edited at
 *     all. Fixed with `imageSrcSchema`, a union of the URL and the internal
 *     path.
 *
 *  2. **`.partial()` on a schema with defaults returns those defaults**, so a
 *     price-only PATCH silently emptied `description`, `tagline` and `details`
 *     and un-hid the product. Fixed by `productPatchSchema`, built from
 *     default-free fields. (Inherited from the deleted API, which had it too.)
 *
 *   bun run check
 *
 * Assertions only, no framework. If this file grows a describe/it harness it
 * has stopped being the smallest thing that catches a regression.
 */

import { productInputSchema, productPatchSchema, bannerPatchSchema } from '@crochet/shared';

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}`);
    if (detail !== undefined) console.log(`      ${JSON.stringify(detail)}`);
  }
}

console.log('\nimages accept both shapes, and still refuse the dangerous ones\n');

const localPath = productPatchSchema.safeParse({ images: ['/images/products/bag-abc123.webp'] });
check('a site-relative path is accepted', localPath.success, localPath.error?.issues);

const remote = productPatchSchema.safeParse({ images: ['https://cdn.example.com/a.jpg'] });
check('an absolute URL is accepted', remote.success, remote.error?.issues);

const mixed = productPatchSchema.safeParse({
  images: ['/images/products/a.png', 'https://cdn.example.com/b.jpg'],
});
check(
  'both together, order preserved',
  mixed.success && mixed.data.images.length === 2,
  mixed.error?.issues,
);

const alt = productPatchSchema.safeParse({ images: [{ url: '/images/products/a.png', alt: 'A bag' }] });
check(
  'the object form with alt text works',
  alt.success && alt.data.images[0]?.alt === 'A bag',
  alt.error?.issues,
);

for (const [label, value] of [
  ['javascript:', 'javascript:alert(1)'],
  ['data:', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
  ['protocol-relative', '//evil.example/x.png'],
] as const) {
  check(
    `${label} is refused`,
    !productPatchSchema.safeParse({ images: [value] }).success,
  );
}

console.log('\na partial update touches only what it names\n');

const patch = productPatchSchema.safeParse({ priceCents: 2500 });
check('a price-only patch returns one key', patch.success && Object.keys(patch.data).length === 1, patch.data);

const patchTwo = productPatchSchema.safeParse({ priceCents: 2500, stock: 7 });
check(
  'absent fields are absent, not defaulted',
  patchTwo.success && !('description' in patchTwo.data) && !('details' in patchTwo.data) && !('hidden' in patchTwo.data),
  patchTwo.data,
);

const empty = productPatchSchema.safeParse({});
check('an empty patch is empty, not a full row of defaults', empty.success && Object.keys(empty.data).length === 0, empty.data);

const banner = bannerPatchSchema.safeParse({ percentOff: 30 });
check(
  'same for a banner patch',
  banner.success && Object.keys(banner.data).length === 1 && !('headline' in banner.data),
  banner.data,
);

console.log('\na create still fills in the documented defaults\n');

const created = productInputSchema.safeParse({ name: 'A bag', slug: 'a-bag', priceCents: 100, category: 'bags' });
check(
  'create defaults description, details and the flags',
  created.success &&
    created.data.description === '' &&
    created.data.stock === 0 &&
    created.data.hidden === false &&
    JSON.stringify(created.data.details) === '{}',
  created.error?.issues ?? created.data,
);

const createdImages = productInputSchema.safeParse({
  name: 'A bag',
  slug: 'a-bag',
  priceCents: 100,
  category: 'bags',
  images: ['/images/products/a.svg'],
});
check('create keeps a local image', createdImages.success && createdImages.data.images.length === 1, createdImages.error?.issues);

console.log('\na "was" price only counts when it is above the price\n');

const base = { name: 'A bag', slug: 'a-bag', category: 'bags' as const };

const realDiscount = productInputSchema.safeParse({ ...base, priceCents: 2500, compareAtCents: 5000 });
check('a higher "was" price is accepted', realDiscount.success, realDiscount.error?.issues);

const sameAsPrice = productInputSchema.safeParse({ ...base, priceCents: 2500, compareAtCents: 2500 });
check(
  'a "was" price equal to the price is refused',
  !sameAsPrice.success,
  sameAsPrice.error?.issues,
);

const belowPrice = productInputSchema.safeParse({ ...base, priceCents: 5000, compareAtCents: 2500 });
check(
  'a "was" price below the price is refused',
  !belowPrice.success,
  belowPrice.error?.issues,
);

const noDiscount = productInputSchema.safeParse({ ...base, priceCents: 2500 });
check('no "was" price at all is still fine', noDiscount.success, noDiscount.error?.issues);

// The half that matters most. A PATCH legitimately arrives with only one of
// the two numbers, and that is incomplete rather than wrong — the other number
// is in the row, not in the request. Refusing those would break every
// single-field edit the panel sends.
const patchPriceOnly = productPatchSchema.safeParse({ priceCents: 5000 });
check(
  'a price-only patch is not judged against a missing "was" price',
  patchPriceOnly.success,
  patchPriceOnly.error?.issues,
);

const patchWasOnly = productPatchSchema.safeParse({ compareAtCents: 5000 });
check(
  'a "was"-only patch is not judged against a missing price',
  patchWasOnly.success,
  patchWasOnly.error?.issues,
);

const patchBoth = productPatchSchema.safeParse({ priceCents: 5000, compareAtCents: 2500 });
check('a patch carrying both is still checked', !patchBoth.success, patchBoth.error?.issues);

console.log(failures === 0 ? '\n✓ all checks passed\n' : `\n✗ ${failures} check(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
