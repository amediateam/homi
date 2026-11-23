/**
 * "First content shown" (`03` SCR-007): the first feed photo that loads calls `markFirstContent()`. The PostHog
 * loader (WP-32, `posthog.ts`) waits for it through `whenFirstContent`, 8 s at most, as legacy did; so does the map
 * warm-up of the list (`MapWarmup`, WP-33 part 4).
 */

/** The longest wait for the first content (legacy's 8 s): a list without photos never shows one. */
export const FIRST_CONTENT_WAIT_MS = 8000;

let resolveShown: () => void = () => {};
let shown = new Promise<void>((resolve) => {
  resolveShown = resolve;
});
let marked = false;

/** Marks the first content; later calls change nothing. */
export function markFirstContent(): void {
  if (!marked) {
    marked = true;
    resolveShown();
  }
}

/** Resolves when the first content was shown (at once if it already was). */
export function firstContentShown(): Promise<void> {
  return shown;
}

/** Forgets the mark; tests only. */
export function resetFirstContent(): void {
  marked = false;
  shown = new Promise<void>((resolve) => {
    resolveShown = resolve;
  });
}

/** Resolves at the first content, or after `timeoutMs` without one. */
export function whenFirstContent(timeoutMs: number): Promise<void> {
  return Promise.race([shown, new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
}
