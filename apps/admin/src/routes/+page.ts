/**
 * The panel's one page. No `load`, because there is nothing to load on the
 * server: the dashboard fetches from `/api/admin/*` on mount, the same way it
 * did when that was a remote API.
 *
 * `ssr = false` because every piece of state on this page is either a database
 * read or a local `$state`. Rendering it on a server would produce a page that
 * is correct for exactly as long as it takes to hydrate, and then replaced.
 */
export const ssr = false;
export const prerender = false;
