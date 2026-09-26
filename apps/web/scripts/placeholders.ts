/**
 * Generates the placeholder product images.
 *
 * The seeded catalogue points at `/images/products/<slug>.svg` because a
 * real shop uploads its own photography to Supabase. Until then these
 * stand-ins need to look deliberate — a soft tint, a crochet motif, and
 * the product name — rather than like a broken image.
 *
 *   bun scripts/placeholders.ts
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'images', 'products');

/** Per-category tint and motif, so the grid reads as a set. */
const STYLE: Record<
  string,
  { bg: string; fg: string; motif: 'flower' | 'bag' | 'coin' | 'frog' }
> = {
  keychains: { bg: '#F7DDE4', fg: '#B25C82', motif: 'coin' },
  bags: { bg: '#F1E6D8', fg: '#8A6A4B', motif: 'bag' },
  purses: { bg: '#EFE3EE', fg: '#7A4C86', motif: 'bag' },
  bouquets: { bg: '#E9F0E4', fg: '#5E7F55', motif: 'flower' },
  custom: { bg: '#F5E9F2', fg: '#96527F', motif: 'flower' },
};

const MOTIF = {
  flower: (c: string) => `
    <g fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round">
      ${Array.from({ length: 6 }, (_, i) => {
        const a = (i * 60 * Math.PI) / 180;
        const x = 200 + Math.cos(a) * 34;
        const y = 232 + Math.sin(a) * 34;
        return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="15" ry="24" transform="rotate(${(i * 60).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" />`;
      }).join('\n      ')}
      <circle cx="200" cy="232" r="13" />
    </g>`,
  bag: (c: string) => `
    <g fill="none" stroke="${c}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M140 190 L150 300 Q152 312 164 312 L236 312 Q248 312 250 300 L260 190 Z" />
      <path d="M172 190 L172 162 Q172 148 186 148 L214 148 Q228 148 228 162 L228 190" />
      <path d="M150 232 L250 232" />
    </g>`,
  coin: (c: string) => `
    <g fill="none" stroke="${c}" stroke-width="3.4" stroke-linecap="round">
      <circle cx="200" cy="250" r="62" />
      <path d="M148 236 Q200 198 252 236" />
      <path d="M148 264 Q200 302 252 264" />
      <path d="M200 188 L200 186" />
      <path d="M186 190 q-8 4 -4 12 q4 8 12 4" />
    </g>`,
  frog: (c: string) => `
    <g fill="none" stroke="${c}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
      <ellipse cx="200" cy="252" rx="54" ry="62" />
      <circle cx="178" cy="216" r="20" />
      <circle cx="222" cy="216" r="20" />
      <circle cx="178" cy="216" r="7" />
      <circle cx="222" cy="216" r="7" />
      <path d="M200 246 q-10 12 0 22 q10 -10 0 -22" />
      <path d="M146 292 L128 316" />
      <path d="M254 292 L272 316" />
    </g>`,
};

/** A soft, non-repeating grain so the flats are not dead. */
const GRAIN = `
  <filter id="g">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3"/>
    <feColorMatrix type="saturate" values="0"/>
  </filter>`;

function svg(name: string, category: string): string {
  const style = STYLE[category] ?? STYLE.keychains!;
  const motif = MOTIF[style.motif](style.fg);

  // Break the label onto up to three lines.
  const words = name.replace(/—/g, '-').split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > 22) {
      lines.push(current.trim());
      current = word;
    } else {
      current = `${current} ${word}`;
    }
  }
  if (current.trim()) lines.push(current.trim());
  const shown = lines.slice(0, 3);

  const label = shown
    .map(
      (line, i) =>
        `<text x="200" y="${404 + i * 30}" text-anchor="middle" class="lbl">${escapeXml(line)}</text>`,
    )
    .join('\n      ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="400" height="500" role="img" aria-label="${escapeXml(name)}">
  <defs>${GRAIN}
    <linearGradient id="wash" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="${style.bg}"/>
      <stop offset="100%" stop-color="#fff"/>
    </linearGradient>
  </defs>

  <style>
    /* System stack: these are placeholders, not a font delivery mechanism. */
    .lbl { font-family: Georgia, 'Times New Roman', serif; font-size: 21px; fill: ${style.fg}; }
    .cat { font-family: system-ui, sans-serif; font-size: 11px; letter-spacing: 2.4px;
           text-transform: uppercase; fill: ${style.fg}; opacity: 0.6; }
  </style>

  <rect width="400" height="500" fill="url(#wash)"/>
  <rect width="400" height="500" filter="url(#g)" opacity="0.05"/>

  <!-- A puff-stitch scallop along the bottom, the same motif the site uses. -->
  <path d="${Array.from({ length: 20 }, (_, i) => {
    const x = i * 20;
    return `M${x} 500 a10 12 0 0 1 20 0`;
  }).join(' ')}" fill="none" stroke="${style.fg}" stroke-width="2" opacity="0.35"/>

  ${motif}

  <g>
      ${label}
      <text x="200" y="${404 + shown.length * 30 + 8}" text-anchor="middle" class="cat">${escapeXml(category)}</text>
  </g>
</svg>
`;
}

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  );

/* ── Read the catalogue snapshot ────────────────────────────────────── */

const snapshot = (await import('../src/data/catalog.json', { with: { type: 'json' } })) as {
  default: { products: { slug: string; name: string; category: string }[] };
};

await mkdir(outDir, { recursive: true });

for (const product of snapshot.default.products) {
  await writeFile(join(outDir, `${product.slug}.svg`), svg(product.name, product.category), 'utf8');
}

// A generic fallback for products added before an image is uploaded.
await writeFile(
  join(outDir, '..', 'placeholder.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="400" height="500" role="img" aria-label="No photograph yet">
  <defs>${GRAIN}</defs>
  <rect width="400" height="500" fill="#F7DDE4"/>
  <rect width="400" height="500" filter="url(#g)" opacity="0.05"/>
  <g fill="none" stroke="#B25C82" stroke-width="3" stroke-linecap="round" opacity="0.6">
    <path d="M2 470 Q50 400 100 470 Q150 400 200 470 Q250 400 300 470 Q350 400 398 470"/>
  </g>
  <text x="200" y="250" text-anchor="middle" font-family="Georgia, serif" font-size="22" fill="#8A4A68">No photograph yet</text>
</svg>
`,
  'utf8',
);

console.log(`✓ ${snapshot.default.products.length} placeholder images → public/images/products/`);
