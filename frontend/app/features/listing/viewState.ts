/**
 * The hero photo of each listing while one opening of it lasts (WP-26, D-11): the fallback instance and the resolved
 * one are two hero strips, and the second starts where the first was, so the swap moves nothing. The scroll offset
 * needs no record: the layer that scrolls sits outside the swapped boundary. The layer forgets a number when it is
 * closed, so every new opening starts at photo 1, as legacy.
 */

const heroIndexes = new Map<number, number>();

export function heroIndexOf(number: number): number {
  return heroIndexes.get(number) ?? 0;
}

export function rememberHeroIndex(number: number, index: number): void {
  heroIndexes.set(number, index);
}

export function forgetView(number: number): void {
  heroIndexes.delete(number);
}

/** Forgets every listing; tests only. */
export function resetViewStates(): void {
  heroIndexes.clear();
}
