/**
 * Publishing: making a database edit visible on the live storefront.
 *
 * ## Why this file exists
 *
 * The storefront is a static build. The catalogue is fetched from the API
 * *at build time* and baked into HTML; the browser never reads the database.
 * So a product saved in the admin panel is, on its own, invisible — it sits
 * in Postgres until Cloudflare Pages happens to rebuild, and Pages only
 * rebuilds on a push to `main`. Before this existed, the admin panel was a
 * database editor that could not publish.
 *
 * The fix is a Cloudflare Pages **deploy hook**: a URL that, when requested,
 * starts a rebuild. The API calls it after a catalogue write, the build runs,
 * the build fetches the fresh catalogue, and the change is live. No push, no
 * commit, no laptop left open.
 *
 * ## Portability
 *
 * This is the whole reason it is a bare URL in an environment variable and
 * not a script, a cron job, or a git hook.
 *
 * The admin panel is not tied to a machine. It is tied to four environment
 * variables and a database, and all four are in `.env` — so moving to a new
 * machine is: clone the repo, copy `.env`, install `cloudflared`, run it.
 * There is no state on the machine, no local database, no absolute path
 * anywhere in this code, and no hostname of any specific box baked in.
 *
 * The deliberate omission: this module has no knowledge of Pages, no project
 * ID, and no per-environment branching. A staging and a production API differ
 * only by which hook URL sits in their `.env`. That is what makes the same
 * build usable in both places.
 *
 * ## What is deliberately not here
 *
 * No polling, no queue, no retries, no webhook signature. A rebuild takes
 * seconds to start and a couple of minutes to finish; retrying a POST that
 * probably succeeded just spends the free build allowance twice. And the hook
 * URL is a bearer secret, so an unverified inbound endpoint pointed at it
 * would be a way to burn someone's build minutes.
 */

import type { PublishState } from '@crochet/shared';
import { env } from '../env.ts';

export type { PublishState };

/**
 * How long to wait for Cloudflare to accept the hook.
 *
 * Generous, because this is awaited on the admin's save request and a slow
 * rejection is better than a false failure report. The hook normally returns
 * in well under a second — it acknowledges the request, it does not wait for
 * the build.
 */
const TIMEOUT_MS = 10_000;

/**
 * Ask Cloudflare Pages to rebuild, so the edit just saved becomes visible.
 *
 * Never throws. The caller's database write has already committed by the time
 * this runs, and failing the whole request because a rebuild could not be
 * triggered would be a lie in the other direction: the owner would be told
 * their edit was lost when it is sitting in Postgres, and would probably
 * retry it.
 *
 * So this reports what happened and the route decides how loudly to say so.
 */
export async function triggerRebuild(): Promise<PublishState> {
  const hook = env.PAGES_DEPLOY_HOOK;
  if (!hook) return 'not-configured';

  try {
    // A hook is a plain URL that rebuilds on GET, but POST is used here
    // because that is what makes an accidental prefetch, a link preview in a
    // chat app, or a security scanner unable to trigger a build.
    const res = await fetch(hook, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ trigger_type: 'admin-edit' }),
    });

    // Cloudflare answers 200 on success and 201 when it has no hook
    // configured for that project. Anything else is a real failure.
    if (res.ok) return 'triggered';

    console.warn(
      `[deploy] hook responded ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
    return 'failed';
  } catch (err) {
    console.warn('[deploy] hook could not be reached:', (err as Error).message);
    return 'failed';
  }
}

/**
 * The same thing, phrased for the person who just hit Save.
 *
 * The difference between the three states is the difference between "your
 * change is live in a minute", "your change is saved but nothing will publish
 * it", and "your change is saved but the rebuild could not be started" — and
 * a shop owner cannot tell those apart from a generic "Saved." So the panel
 * says which one happened rather than assuming the happy path.
 */
export function publishMessage(state: PublishState, subject: string): string {
  switch (state) {
    case 'triggered':
      return `${subject} The shop is rebuilding now — live in a minute or two.`;
    case 'not-configured':
      return `${subject} No deploy hook is set, so this will not appear on the site until the next deploy.`;
    case 'failed':
      return `${subject} Saved, but the rebuild could not be started — check the deploy hook.`;
  }
}
