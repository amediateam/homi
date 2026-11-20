/**
 * A layer that closes in its own way takes over Telegram's BackButton while its own address shows (WP-36: the listing
 * layer plays its leave before the route changes). `TelegramButtons` calls the handler registered last instead of
 * `back()` of `useBack()`; with none registered Back is the app's. Unregistering removes only that handler, so a copy
 * that hides while another shows (the overlay copy of a listing over its standalone copy) leaves the other in place.
 */

let handlers: (() => void)[] = [];

/** Registers `handler` until the returned function is called. */
export function takeOverBack(handler: () => void): () => void {
  handlers = [...handlers, handler];
  return () => {
    handlers = handlers.filter((registered) => registered !== handler);
  };
}

/** The handler registered last, or `null` when Back is the app's own. */
export function backHandler(): (() => void) | null {
  return handlers.at(-1) ?? null;
}
