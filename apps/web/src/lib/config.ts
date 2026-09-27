/**
 * Public, build-time configuration.
 *
 * Only `PUBLIC_*` values may be read here — everything in this file is inlined
 * into the client bundle.
 *
 * This used to carry `apiUrl`, `authUrl` and a `hasApi` flag, and the whole
 * storefront branched on them. All three are gone: there is no API, and a
 * storefront that cannot reach one is a storefront that always renders.
 */

const raw = import.meta.env;

export const config = {
  siteUrl: (raw.PUBLIC_SITE_URL ?? 'https://crochet-and-co.pages.dev').replace(/\/$/, ''),
} as const;

/** Absolute URL for canonical tags, sitemap entries and social cards. */
export const absolute = (path: string): string =>
  `${config.siteUrl}${path.startsWith('/') ? path : `/${path}`}`;

export const isProd = raw.PROD ?? false;
