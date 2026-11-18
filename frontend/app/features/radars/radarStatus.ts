import type { Locale } from "@homi/config";
import { type I18nReporter, labelFor } from "@homi/i18n";
import { flowRate, formatFlow, type Translate } from "@homi/i18n/format";

import type { Radar } from "./normalize";

export interface RadarStatusOptions {
  t: Translate;
  /** The lower case of the mode label is the locale's (`toLocaleLowerCase`). */
  locale: Locale;
  /** `dev021OneFlowVocabulary` (LB-APP-033): the sheet's flow words on the tile too. */
  oneVocabulary?: boolean;
  /** Reports a mode the label table does not know, once (`labelFor`). */
  report?: I18nReporter;
}

/**
 * The status line of a radar tile and of the radar sheet header (SCR-026, SCR-028; legacy `subscriptionStatus`):
 *
 * - paused → «На паузе» (`subs.paused`);
 * - active without a flow → the delivery mode in lower case («сразу», «подборкой»);
 * - active with a flow → the tile's flow words (BR-APP-044: «пока редко», «{n} за неделю», «≈{n} в день»), « · » and
 *   the mode.
 *
 * The mode label is `labelFor("radarMode", mode)`, so an unknown mode reads «другое» and never throws (the fix of
 * LB-APP-002). `flow` is anything the contract sent: `flowRate` reads only an object with a numeric `week` and a
 * positive `days`, so a malformed one shows no flow part.
 */
export function radarStatus(radar: Pick<Radar, "active" | "mode">, flow: unknown, { t, locale, oneVocabulary = false, report }: RadarStatusOptions): string {
  if (!radar.active) {
    return t("subs.paused");
  }
  const mode = t(labelFor("radarMode", radar.mode, report)).toLocaleLowerCase(locale);
  const rate = formatFlow(flowRate(flow), "tile", t, { oneVocabulary });
  return rate === null ? mode : `${rate} · ${mode}`;
}
