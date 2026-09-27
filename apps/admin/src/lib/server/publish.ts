/**
 * Publish: make the local catalogue edits visible on the live shop.
 *
 *   SQLite → catalog.json → git commit → git push → Pages rebuilds
 *
 * No deploy hook, no webhook, no callback. `git push` to the production branch
 * *is* the rebuild trigger, so publishing reuses the infrastructure that
 * already deploys the code — no second system, no bearer secret, and no way to
 * spend build minutes on a change that changes nothing.
 *
 * ## The one rule that matters
 *
 * **`git add` gets explicit paths, never `-A`.** A blind `-A` would sweep
 * whatever else is in the working tree into a commit labelled with the
 * catalogue — a half-finished refactor, a debug print, a `.env` that slipped
 * past `.gitignore`. The catalogue is the shop; publishing it should be the
 * only thing a publish commit contains.
 *
 * ## What is *not* the panel's business
 *
 * Uncommitted work elsewhere in the repo does not block a publish and is not
 * mentioned. An earlier version refused whenever the working tree was dirty
 * anywhere and listed every unrelated file — noise, and the wrong thing to
 * check.
 *
 * What matters is the **index**: `git commit` without `-a` commits the index
 * and nothing else, so unstaged work cannot reach a commit. Hence:
 *
 *   1. a foreign path *already staged* → refuse and name it;
 *   2. stage only the catalogue and images, by explicit path;
 *   3. re-read the index and confirm nothing else is in it, before committing.
 *
 * Steps 1 and 3 are one invariant from both sides, and together they fix the
 * commit's contents regardless of the working tree. Unrelated uncommitted
 * files are yours; they stay put until you commit them on purpose.
 *
 * The branch is named, not inferred: local was `master` while the remote and
 * the Pages production branch are `main`.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { exportCatalog } from './export';
import type { PublishResult, PublishState } from '../publish';
import { isPublishable, PRODUCTION_BRANCH, PUBLISH_PATHS, REMOTE, ROOT } from '../paths';

const run = promisify(execFile);

/** `git` with its output trimmed — for reading values, not for parsing. */
const git = async (args: string[]): Promise<string> => {
  try {
    const { stdout } = await run('git', args, { cwd: ROOT });
    return stdout.trim();
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    throw new Error(
      `git ${args.join(' ')} failed:\n${(e.stderr || e.stdout || e.message).trim()}`,
    );
  }
};

export interface PublishOptions {
  /**
   * Publish even if a foreign path is staged. The panel never sets this; it
   * exists for the CLI, and for the case where you have read the list of
   * blockers and decided those files *should* go out with the catalogue.
   */
  force?: boolean;
  message?: string;
  /** Commit but do not push — for reviewing the commit before it ships. */
  noPush?: boolean;
}

/**
 * The files currently in the git index — i.e. exactly what `git commit` would
 * commit, since `git commit` without `-a` commits the index and nothing else.
 *
 * This is the only list that matters to a publish, and it is the entire basis
 * of the safety check below. An earlier version checked the *working tree*
 * instead, via `git status --porcelain -z` — which took ~35 lines of status
 * column and rename-arrow parsing to answer a question that does not matter,
 * and whose output was easy to mangle by accident.
 */
async function stagedPaths(): Promise<string[]> {
  const out = await git(['diff', '--cached', '--name-only']);
  return out
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Anything in the index that a publish must not sweep into its commit. */
async function foreignStagedPaths(): Promise<string[]> {
  return (await stagedPaths()).filter((p) => !isPublishable(p));
}

export async function publish(opts: PublishOptions = {}): Promise<PublishResult> {
  try {
    /* ── 1. The catalogue becomes a committed file ──────────────────── */

    const exported = await exportCatalog();

    /* ── 2. Nothing changed, so there is nothing to do ────────────────── */

    if (!exported.changed) {
      return {
        state: 'nothing-to-publish',
        message:
          'Nothing has changed since the last publish. The site is already showing this catalogue.',
      };
    }

    /* ── 3. Refuse only if the commit itself would be polluted ───────── */

    // Uncommitted work elsewhere in the repository is not the panel's business.
    // It sits in the working tree, it is not in the index, and `git commit`
    // will not touch it. Whether you have a half-finished refactor in progress
    // has no bearing on publishing a price change, and a panel that refuses
    // because of it is simply in the way.
    //
    // The one thing that genuinely would corrupt a publish is a foreign path
    // *already staged*, because the commit takes the whole index. That is what
    // this checks — and it is the check that was missing before, sitting
    // alongside a working-tree sweep that was not needed.
    if (!opts.force) {
      const blockers = await foreignStagedPaths();

      if (blockers.length > 0) {
        return {
          state: 'dirty-tree',
          blockers,
          message:
            'Not published — these are staged, and a commit takes the whole index, so they ' +
            'would go out with the catalogue. Unstage them first:\n' +
            blockers.map((b) => `  • ${b}`).join('\n') +
            '\n\ngit restore --staged <file>',
        };
      }
    }

    /* ── 4. Stage exactly the catalogue ──────────────────────────────── */

    // Explicit pathspecs. Never `-A`, which would sweep the working tree in.
    await git(['add', '--', ...PUBLISH_PATHS]);

    // Re-check the index after staging. This is the invariant that matters:
    // whatever is in the index is what the commit contains.
    const staged = await stagedPaths();
    const unexpected = staged.filter((p) => !isPublishable(p));

    if (unexpected.length > 0 && !opts.force) {
      // Unstage only our own paths, leaving the tree as we found it.
      await git(['reset', '--quiet', 'HEAD', '--', ...PUBLISH_PATHS]);
      return {
        state: 'dirty-tree',
        blockers: unexpected,
        message:
          'Refused to commit: files outside the catalogue were staged.\n' +
          unexpected.map((f) => `  • ${f}`).join('\n') +
          '\n\nNothing was committed.',
      };
    }

    if (staged.length === 0) {
      return { state: 'nothing-to-publish', message: 'Nothing had changed to publish.' };
    }

    /* ── 5. Commit ───────────────────────────────────────────────────── */

    // One line, describing the catalogue rather than the act of publishing, so
    // `git log --oneline` reads as a history of the shop.
    const message = opts.message ?? `Catalogue: ${exported.products} products, ${exported.banners} live promotion(s)`;

    await git(['commit', '--quiet', '-m', message]);
    const commit = await git(['rev-parse', '--short', 'HEAD']);

    if (opts.noPush) {
      return {
        state: 'committed-not-pushed',
        commit,
        files: staged,
        message: `Committed as ${commit} but not pushed. Run \`git push\` when you are ready.`,
      };
    }

    /* ── 6. Push — which is the rebuild trigger ──────────────────────── */

    try {
      await git(['push', REMOTE, `HEAD:${PRODUCTION_BRANCH}`]);
    } catch (err) {
      // The commit exists. Saying so is the whole point: the owner can push
      // it by hand, and knows the change is not lost.
      return {
        state: 'committed-not-pushed',
        commit,
        files: stagedFiles,
        message:
          `Saved and committed as ${commit}, but the push failed — the site has not changed ` +
          `yet. Your change is safe; run \`git push origin HEAD:${PRODUCTION_BRANCH}\` when you ` +
          `have connection.\n\n${(err as Error).message}`,
      };
    }

    return {
      state: 'pushed',
      commit,
      files: stagedFiles,
      message:
        `Published as ${commit} and pushed to ${PRODUCTION_BRANCH}. The site is rebuilding now — ` +
        `live in a couple of minutes. Nothing reaches the shop until that build finishes.`,
    };
  } catch (err) {
    return {
      state: 'failed',
      message: `Publish failed before anything was pushed:\n\n${(err as Error).message}`,
    };
  }
}
