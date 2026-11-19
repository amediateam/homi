import type { Translate } from "@homi/i18n/format";

/**
 * Display helpers of the settings (WP-30: the digest hint of the radar sheet, SCR-028; WP-31 adds the settings
 * pages). Pure: no React, so the server and the tests call them as they are.
 */

/**
 * The digest hours of the settings (Asia/Tashkent wall-clock hours), or `null` while there are none to show — the
 * settings are not loaded, `digest_hours` is not a list, or it holds no hour 0 … 23 — so the radar sheet shows
 * `radar.digestHintAny` (legacy, whose handler threw on a missing `digest`). Invalid entries are dropped; the order
 * is the server's.
 */
export function digestHours(settings: unknown): number[] | null {
  if (typeof settings !== "object" || settings === null) {
    return null;
  }
  const hours = (settings as { digest_hours?: unknown }).digest_hours;
  if (!Array.isArray(hours)) {
    return null;
  }
  const valid = hours.filter((hour): hour is number => Number.isInteger(hour) && hour >= 0 && hour <= 23);
  return valid.length > 0 ? valid : null;
}

/**
 * The `{time}` of `radar.digestHint` («Списком в 9 и 19»): the hours as plain numbers, every one joined to the next
 * with `notify.and`, as legacy joined them (one hour alone; «9 и 12 и 19» for three, no commas). The word is trimmed
 * and put between single spaces, which fixes uz `" va"` (no trailing space: legacy read «9 va19»).
 */
export function formatDigestHours(hours: readonly number[], t: Translate): string {
  return hours.map(String).join(` ${t("notify.and").trim()} `);
}
