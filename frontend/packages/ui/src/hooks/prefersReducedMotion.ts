/**
 * Whether the user asked for reduced motion, read when a gesture settles (WP-23, D-UI-4): the gesture hooks then
 * jump to the end instead of sliding. A missing `matchMedia` (jsdom, an old WebView) counts as no preference.
 */
export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
