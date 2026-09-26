/**
 * A transient "saved / failed" message for admin screens.
 *
 * Extracted because three panels each grew the same hand-rolled timeout, and
 * each copy stacked a new timer on every message. This version keeps exactly
 * one timer alive: showing a second message cancels the first, so holding
 * down a button cannot leave a queue of pending callbacks holding closures
 * over component state.
 */

import { onDestroy } from 'svelte';

export type Tone = 'ok' | 'bad';

export interface Notice {
  tone: Tone;
  text: string;
}

export function createFlash(durationMs = 4500) {
  let notice = $state<Notice | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function show(tone: Tone, text: string): void {
    if (timer) clearTimeout(timer);
    notice = { tone, text };
    timer = setTimeout(() => {
      notice = null;
      timer = undefined;
    }, durationMs);
  }

  function clear(): void {
    if (timer) clearTimeout(timer);
    timer = undefined;
    notice = null;
  }

  // Never leave a timer pointing at a destroyed component.
  onDestroy(clear);

  return {
    get notice() {
      return notice;
    },
    show,
    clear,
  };
}
