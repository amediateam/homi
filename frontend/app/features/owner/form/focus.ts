/** The elements `?focus=` may name (BR-APP-093, set by WP-82's fill hints). */
export const FOCUS_TOKENS = ["photos", "area_m2", "floor", "renovation", "description"] as const;
export type FocusToken = (typeof FOCUS_TOKENS)[number];

/** How long the named element stays highlighted. */
export const FOCUS_HIGHLIGHT_MS = 1600;

export function isFocusToken(value: string | null): value is FocusToken {
  return value !== null && (FOCUS_TOKENS as readonly string[]).includes(value);
}

/**
 * Scrolls the element of `token` (`[data-focus="…"]` inside `root`) into the centre and marks it
 * `data-highlight` for 1.6 s; the caller drops the parameter from the address. Returns the cleanup.
 */
export function focusField(root: HTMLElement, token: FocusToken): () => void {
  const element = root.querySelector<HTMLElement>(`[data-focus="${token}"]`);
  if (element === null) {
    return () => undefined;
  }
  element.scrollIntoView?.({ block: "center", behavior: "smooth" });
  element.setAttribute("data-highlight", "");
  const timer = setTimeout(() => element.removeAttribute("data-highlight"), FOCUS_HIGHLIGHT_MS);
  return () => {
    clearTimeout(timer);
    element.removeAttribute("data-highlight");
  };
}
