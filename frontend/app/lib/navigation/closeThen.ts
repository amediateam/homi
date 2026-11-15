import { depth } from "./history";
import { nav } from "./nav";

/** How long `closeThen` waits for the `popstate` of its back step. */
const POPSTATE_CAP_MS = 500;

/**
 * Closes the open layer, then goes to `href` (`25` §3.2; «Показать N», sort and city picks): at depth > 0 one step
 * back, the `popstate` awaited (at most 500 ms), then a replace; at depth 0 only the replace. History never grows.
 */
export function closeThen(href: string): Promise<void> {
  if (depth() === 0) {
    nav.replace(href);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = (): void => {
      window.removeEventListener("popstate", done);
      clearTimeout(timer);
      nav.replace(href);
      resolve();
    };
    const timer = setTimeout(done, POPSTATE_CAP_MS);
    window.addEventListener("popstate", done);
    nav.back();
  });
}
