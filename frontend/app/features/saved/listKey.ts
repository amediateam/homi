/** The two lists of the saved tab (SCR-024, SCR-025). */
export type SavedSource = "favorites" | "history";

/**
 * The key of a saved list (`useCursorFeed`): one per server render of the page and, within it, per version. The
 * server builds the key of its page one with `FIRST_VERSION`, so the browser's first render adopts it; a pull or the
 * history's return after a new listing was opened bumps the version, and the next server render (a tab or title
 * tab entering the page) brings a new `renderId`.
 */
export function savedListKey(source: SavedSource, renderId: string, version: number): string {
  return `${source}:${renderId}:${version}`;
}
