/**
 * Shared UI state: whether the basket drawer is open.
 *
 * Same reasoning as `stores/cart.ts` — the button that opens the drawer and
 * the drawer itself are separate `client:` islands, so this has to be a
 * shared store rather than module-level `$state`.
 */

import { writable, type Readable } from 'svelte/store';

export type UiStore = Readable<boolean> & {
  open(): void;
  close(): void;
  toggle(): void;
};

function createUi(): UiStore {
  const { subscribe, set, update } = writable(false);

  return {
    subscribe,
    open: () => set(true),
    close: () => set(false),
    toggle: () => update((v) => !v),
  };
}

const GLOBAL_KEY = Symbol.for('crochet.ui');

export const ui: UiStore =
  ((globalThis as Record<symbol, UiStore | undefined>)[GLOBAL_KEY] ??= createUi());
