/**
 * The vocabulary of publishing — what states a publish can be in, and how each
 * one is phrased for the person who just pressed the button.
 *
 * ## Why this is separate from the code that publishes
 *
 * This module is imported by Svelte components, so it must stay free of Node
 * built-ins. The git work lives in `server/publish.ts`; re-exporting from
 * there would drag `node:child_process` into the browser bundle and fail the
 * build. So the *vocabulary* is here and the *implementation* is there, and the
 * server module imports the type from this file rather than the other way
 * round.
 *
 * ## Why the states exist at all
 *
 * The original design had `triggered | not-configured | failed` and a comment
 * explaining why: a shop owner cannot tell "your change is live in a minute"
 * from "your change is saved and nothing will ever publish it", so the panel
 * says which one happened rather than assuming the happy path.
 *
 * That instinct survives, and the states changed to match the new failure
 * modes. `dirty-tree` is the one that did not exist before and is the one that
 * will actually be hit in daily use — it is what happens when a publish is
 * attempted while unrelated work is uncommitted, and it is a refusal rather
 * than a failure, which is why it is a state and not an error.
 *
 * `nothing-to-publish` matters for the same reason from the other direction:
 * after a publish, the owner's next question is "is it live yet?", and the
 * honest answer when nothing changed is "there was nothing to publish", not a
 * cheerful "done" that implies work happened.
 */

export type PublishState =
  /** Committed and pushed. The build is running. */
  | 'pushed'
  /** The commit exists; the push did not happen. Retryable by hand. */
  | 'committed-not-pushed'
  /** Refused: unrelated uncommitted changes. Nothing was staged. */
  | 'dirty-tree'
  /** The catalogue already matched what is live. */
  | 'nothing-to-publish'
  /** Something broke before anything was pushed. */
  | 'failed';

export interface PublishResult {
  state: PublishState;
  message: string;
  commit?: string;
  files?: string[];
  /** Files outside the allowlist that blocked the publish. */
  blockers?: string[];
}

/** The subject line each state produces, as a one-line summary for the panel. */
export function publishMessage(state: PublishState, subject: string): string {
  switch (state) {
    case 'pushed':
      return `${subject} The site is rebuilding now — live in a minute or two.`;
    case 'committed-not-pushed':
      return `${subject} Saved and committed, but not pushed — the site has not changed yet.`;
    case 'dirty-tree':
      return `${subject} Not published — there are other uncommitted changes. See the details.`;
    case 'nothing-to-publish':
      return `${subject} Nothing had changed, so there was nothing to publish.`;
    case 'failed':
      return `${subject} Publish failed — nothing was pushed.`;
  }
}

/** One line, for the button's own label and the status strip. */
export function publishHeadline(state: PublishState): string {
  switch (state) {
    case 'pushed':
      return 'Published — rebuilding';
    case 'committed-not-pushed':
      return 'Committed, not pushed';
    case 'dirty-tree':
      return 'Not published — other changes pending';
    case 'nothing-to-publish':
      return 'Nothing to publish';
    case 'failed':
      return 'Publish failed';
  }
}

/** Whether the state means "the live site now matches the database". */
export function isPublished(state: PublishState): boolean {
  return state === 'pushed' || state === 'nothing-to-publish';
}
