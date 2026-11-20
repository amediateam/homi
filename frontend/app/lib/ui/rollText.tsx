import { RollNumber } from "@homi/ui";
import type { ReactNode } from "react";

/** Stands for the number while the message is formatted; a private-use character no catalogue text holds. */
const SENTINEL = "";

/**
 * A translated line with its number rolling (WP-39, BR-APP-113; legacy `rollText`). `format` is called once with a
 * sentinel in place of the number, and the text is split around it; `value` then shows as a `RollNumber` between the
 * parts. Only for a message with a plain `{n}` — no plural, no number format — which holds for `sheet.showN`,
 * `sheet.matchingNow`, `sheet.flowDay` and `sheet.flowWeek`. A message without the placeholder shows as it is.
 */
export function rollText(format: (n: string) => string, value: number): ReactNode {
  const text = format(SENTINEL);
  const at = text.indexOf(SENTINEL);
  if (at < 0) {
    return text;
  }
  return (
    <span data-slot="roll-text" className="whitespace-pre">
      {text.slice(0, at)}
      <RollNumber value={value} />
      {text.slice(at + SENTINEL.length)}
    </span>
  );
}
