/**
 * The vocabulary of publishing: what states a publish can be in, and how each
 * is phrased for the person who just pressed the button.
 *
 * ## Why this is separate from the code that publishes
 *
 * Components import this, so it must stay free of Node built-ins. The git work
 * lives in `server/publish.ts`; re-exporting from there would drag
 * `node:child_process` into the browser bundle. So the *vocabulary* is here and
 * the *implementation* is there.
 *
 * ## Why the states exist at all
 *
 * The original design had `triggered | not-configured | failed` and a comment
 * explaining why: a shop owner cannot tell "your change is live in a minute"
 * from "your change is saved and nothing will ever publish it". That instinct
 * survived the port, and the states changed to match the new failure modes.
 *
 * `dirty-tree` is the one that did not exist before and is the one that will
 * actually be hit — a refusal rather than a failure, which is why it is a state
 * and not an error. `nothing-to-publish` matters from the other direction:
 * after a publish, "is it live yet?" is answered honestly rather than with a
 * cheerful "done" implying work happened.
 */

export type PublishState =
  /** Committed and pushed. The build is running. */
  | 'pushed'
  /** The commit exists; the push did not happen. Retryable by hand. */
  | 'committed-not-pushed'
  /** Refused: a foreign path was staged. Nothing was committed. */
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
      return `${subject} Not published — something else was staged. See the details.`;
    case 'nothing-to-publish':
      return `${subject} Nothing had changed, so there was nothing to publish.`;
    case 'failed':
      return `${subject} Publish failed — nothing was pushed.`;
  }
}

/** Whether the state means "the live site now matches the database". */
export function isPublished(state: PublishState): boolean {
  return state === 'pushed' || state === 'nothing-to-publish';
}
