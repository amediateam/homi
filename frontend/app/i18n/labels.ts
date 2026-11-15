import { type LabelTable, labelFor as labelWith, type MessageKey } from "@homi/i18n";

import { reportI18n } from "@/lib/errors/report";

/**
 * `labelFor` of @homi/i18n bound to the app's error facade (WP-20): the message key for a server value, or
 * `fallback.other` with one report. Feature code uses this one.
 */
export function labelFor(table: LabelTable, value: string): MessageKey {
  return labelWith(table, value, reportI18n);
}
