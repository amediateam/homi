/**
 * "First content shown" (`03` SCR-007): the first feed photo that loads calls `markFirstContent()`. Legacy started
 * the PostHog loader on it (0.5 s later, or after 8 s at most); here it only resolves `firstContentShown()` once,
 * a no-op until WP-32 hangs the analytics loader on it.
 */

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
