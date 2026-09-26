/**
 * What the admin panel says after a catalogue write.
 *
 * A tiny module on purpose. The API owns the meaning of the three states —
 * it is the thing that knows whether a rebuild was requested — and this only
 * phrases them, so that "saved but not published" can never be collapsed back
 * into a reassuring "Saved." by a second implementation somewhere.
 *
 * Mirrors `publishMessage` in `apps/api/src/lib/deploy.ts`. The state itself
 * is a shared type from `@crochet/shared`, so the two can disagree about the
 * wording without breaking anything; they cannot disagree about what happened.
 */

import type { PublishState } from '@crochet/shared';

export function publishMessage(state: PublishState, subject: string): string {
  switch (state) {
    case 'triggered':
      return `${subject} The shop is rebuilding now — live in a minute or two.`;
    case 'not-configured':
      return `${subject} No deploy hook is set on the API, so this will not reach the site until the next deploy.`;
    case 'failed':
      return `${subject} Saved, but the rebuild could not be started — check the deploy hook.`;
  }
}
