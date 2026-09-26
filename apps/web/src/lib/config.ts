/**
 * Public, build-time configuration.
 *
 * Only `PUBLIC_*` values may be read here — everything in this file is
 * inlined into the client bundle.
 */

const raw = import.meta.env;

export const config = {
  siteUrl: (raw.PUBLIC_SITE_URL ?? 'https://crochet-and-co.pages.dev').replace(/\/$/, ''),
  /** Empty string means "no API" — the site then runs purely off the
   *  build-time snapshot and the admin panel reports itself offline. */
  apiUrl: (raw.PUBLIC_API_URL ?? '').replace(/\/$/, ''),
  authUrl: (raw.PUBLIC_AUTH_URL ?? '').replace(/\/$/, ''),
} as const;

export const hasApi = config.apiUrl.length > 0;

/** Absolute URL for canonical tags, sitemap entries and social cards. */
export const absolute = (path: string): string =>
  `${config.siteUrl}${path.startsWith('/') ? path : `/${path}`}`;

export const isProd = raw.PROD ?? false;
