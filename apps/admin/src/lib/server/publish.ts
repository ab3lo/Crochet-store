/**
 * Publish: make the local catalogue edits visible on the live shop.
 *
 * ## The whole mechanism
 *
 *   SQLite  →  catalog.json  →  git commit  →  git push  →  Pages rebuilds
 *
 * There is no deploy hook, no webhook and no callback. `git push` to the
 * production branch *is* the rebuild trigger, which means publishing uses the
 * same infrastructure that already deploys the code — no second system to
 * configure, no bearer-secret URL stored anywhere, and no way to burn build
 * minutes on a request that changes nothing.
 *
 * ## The one rule that matters
 *
 * **`git add` is given explicit paths, never `-A`.**
 *
 * This is the highest-consequence line in the file. A blind `git add -A` would
 * sweep whatever else is in the working tree into a commit labelled with the
 * catalogue — a half-finished refactor, a debug print, a `.env` that slipped
 * past `.gitignore`. The catalogue is the shop; publishing it should be the
 * only thing a publish commit contains.
 *
 * ## What is *not* the panel's business
 *
 * Uncommitted work elsewhere in your repository does not block a publish, and
 * the panel does not mention it.
 *
 * An earlier version refused to publish whenever the working tree was dirty
 * anywhere, and listed every unrelated file as a blocker. That was wrong twice
 * over: it was noise, and it was checking the wrong thing.
 *
 * The thing that actually matters is the **index**, because `git commit`
 * (without `-a`) commits the index and nothing else. Unstaged work is not in
 * the index and cannot reach the commit. So the guard is now:
 *
 *   1. if a foreign path is *already staged*, refuse and name it — it would be
 *      swept in by the commit;
 *   2. stage only the catalogue and images, by explicit path;
 *   3. re-read the index and confirm it contains nothing else, before committing.
 *
 * Steps 1 and 3 are the same invariant seen from both sides, and between them
 * they guarantee the commit's contents regardless of the state of the working
 * tree. Unrelated uncommitted files are yours; they stay where they are, and
 * you commit them when you mean to.
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
 * `git status --porcelain -z` → clean relative paths.
 *
 * `-z` rather than the newline form, for two reasons that both bite in
 * practice:
 *
 *   • The newline form is ambiguous to parse. `XY path` is 2 status columns
 *     and a space, so `slice(3)` is right — but only if you do not `.trim()`
 *     the line first, and a trim looks harmless while silently eating the
 *     leading space of an unstaged ` M` entry and turning `bun.lock` into
 *     `un.lock`.
 *   • Renames are reported as `old -> new` on one line, which then has to be
 *     split on an arrow that is also legal in a filename.
 *
 * With `-z` the format is unambiguous: entries are NUL-separated and a rename
 * is *two* entries, the source then the destination. What we want to reason
 * about is always the destination — that is the path that will exist.
 */
/**
 * The files currently in the git index — i.e. exactly what `git commit` would
 * commit, since `git commit` without `-a` commits the index and nothing else.
 *
 * This is the only list that matters to a publish, and it is the entire basis
 * of the safety check below. Note how much simpler it is than parsing
 * `git status --porcelain -z`: no status columns to slice off, no rename
 * arrows, no NUL splitting, no quoting rules to get wrong. An earlier version
 * checked the *working tree* instead, which took ~35 lines of `--porcelain -z`
 * parsing to answer a question that does not matter.
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
