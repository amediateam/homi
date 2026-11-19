/**
 * The address the browser shows now, path and query (WP-30). A sheet that closes itself when a request answers reads
 * it at the tap and again with the answer: when they differ the user has left the sheet (Back, ×, «Показать», a
 * listing), so the answer must not step back once more or replace the page the user went to.
 */
export function currentAddress(): string {
  return window.location.pathname + window.location.search;
}
