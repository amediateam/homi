/**
 * The text an element shows. A rolling number (`RollNumber` of `@homi/ui`, WP-39) holds a strip of 0 – 9 per digit,
 * so its `textContent` is not what is read on the screen: here it counts as its plain number, its label.
 */
export function shownText(element: Element | null | undefined): string {
  if (!element) {
    return "";
  }
  const copy = element.cloneNode(true) as Element;
  for (const roll of Array.from(copy.querySelectorAll('[data-slot="roll-number"]'))) {
    roll.replaceWith(roll.getAttribute("aria-label") ?? "");
  }
  return copy.textContent ?? "";
}
