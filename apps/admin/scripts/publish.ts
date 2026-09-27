/**
 * `bun run publish` — commit the catalogue and push, from a terminal.
 *
 * A thin wrapper around `$lib/server/publish`, which is the same code the
 * panel's Publish button calls. Having both is deliberate: the button is
 * convenient, and this is what you reach for when a publish needs a flag
 * (`--no-push` to review a commit, `--force` past a dirty tree you have
 * checked yourself). One implementation, so the flags mean the same thing
 * wherever they are used.
 *
 * Flags:
 *   --no-push   commit only, so the commit can be reviewed first
 *   --force     publish even with unrelated uncommitted changes present
 *   -m "text"   override the commit message
 */

import { publish } from '../src/lib/server/publish';

const args = process.argv.slice(2);
const messageFlag = args.findIndex((a) => a === '-m' || a === '--message');

const result = await publish({
  force: args.includes('--force'),
  noPush: args.includes('--no-push'),
  ...(messageFlag !== -1 && args[messageFlag + 1]
    ? { message: args[messageFlag + 1]! }
    : {}),
});

console.log(`\n  ${result.state}\n`);
console.log(
  result.message
    .split('\n')
    .map((l) => (l.startsWith('  •') ? l : `  ${l}`))
    .join('\n')
    .trim(),
);

if (result.files?.length) {
  console.log('\n  files in this commit:');
  for (const f of result.files) console.log(`    ${f}`);
}

console.log('');

process.exit(result.state === 'failed' || result.state === 'dirty-tree' ? 1 : 0);
