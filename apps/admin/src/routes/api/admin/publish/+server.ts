/**
 * `POST /api/admin/publish` — the only button that changes the live site.
 *
 * This is the replacement for the Cloudflare Pages deploy hook the deleted API
 * fired after every catalogue write, and the difference in behaviour is the
 * single most important thing to understand about the new workflow:
 *
 *   before   save  →  database write  →  deploy hook  →  rebuild, automatically
 *   now      save  →  database write  →  nothing happens
 *           publish  →  export JSON  →  commit  →  push  →  rebuild
 *
 * Autosave stays autosave; publishing is a separate, deliberate act. That is
 * not a regression — it is what makes the git history meaningful, because a
 * commit is a thing a human decided to do rather than a side effect of opening
 * a form.
 *
 * The `git` work happens in `$lib/server/publish`, which `bun run publish`
 * also calls. One implementation means the button and the CLI do exactly the
 * same thing, and the safety checks cannot be bypassed by using one rather
 * than the other.
 */

import { publish, type PublishResult } from '$lib/server/publish';
import { fail, ok, unexpected } from '$lib/server/respond';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    /** Push without the dirty-tree guard. Never offered by the panel. */
    force?: boolean;
  };

  try {
    const result: PublishResult = await publish({
      ...(body.message ? { message: body.message } : {}),
      // `force` is honoured because the CLI has the same flag and silently
      // ignoring it here would make the two entry points disagree. The panel
      // never sends it.
      force: body.force === true,
    });

    // `dirty-tree` is a refusal, not a server fault — it is the expected
    // answer when there is unrelated work in the tree, and the panel renders
    // `blockers` as a list. 409 so a client can tell it apart from a 500.
    if (result.state === 'dirty-tree') {
      return fail(result.message, 409, { blockers: (result.blockers ?? []).join('\n') });
    }

    return ok(result);
  } catch (err) {
    return unexpected(err, 'POST /api/admin/publish');
  }
};
