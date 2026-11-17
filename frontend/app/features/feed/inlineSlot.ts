/** The inline slot follows this many visible cards (SCR-047 since `index-DY_DH7h-.js`). */
export const INLINE_SLOT_AFTER = 8;

/**
 * Where the search list renders its `inline` node (SCR-007, SCR-047, BR-APP-072): the number of visible cards before
 * it, or `null` for none. After the 8th visible card; with 8 or fewer, after the last one, but only when the list is
 * fully loaded without an error (`done`) and the few-results note is not shown; with no visible card never — the
 * empty state shows instead. With 9 visible cards the slot stands after the 8th and the note below the list.
 */
export function inlineSlotIndex(visible: number, done: boolean, noteShown: boolean): number | null {
  if (visible > INLINE_SLOT_AFTER) {
    return INLINE_SLOT_AFTER;
  }
  return visible > 0 && done && !noteShown ? visible : null;
}
