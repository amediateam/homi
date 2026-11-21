import type { Translate } from "@homi/i18n/format";

/**
 * Display helpers of the settings (WP-30: the digest hint of the radar sheet, SCR-028; WP-31: the settings screen
 * and its pages). Pure: no React, so the server and the tests call them as they are. This is the only place that turns
 * the structured values of `GET /settings` into «23–08», «Выкл» or «9 и 21»; a value that is in no preset (set in the
 * bot, Q-API-029) is rendered the same way.
 */

export type QuietValue = { from: number; to: number } | null;
export type CardStyleValue = "classic" | "rich";

const isHour = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 23;

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
  return hoursOf((settings as { digest_hours?: unknown }).digest_hours);
}

/** A list of hours as the API sends it, invalid entries dropped; `null` when nothing valid is left or it is no list. */
export function hoursOf(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const valid = value.filter(isHour);
  return valid.length > 0 ? valid : null;
}

/**
 * The `{time}` of `radar.digestHint` and the digest row («9 и 21»): the hours as plain numbers, every one joined to
 * the next with `notify.and`, as legacy joined them (one hour alone; «9 и 12 и 19» for three, no commas). The word is
 * trimmed and put between single spaces, which fixes uz `" va"` (no trailing space: legacy read «9 va19»).
 */
export function formatDigestHours(hours: readonly number[], t: Translate): string {
  return hours.map(String).join(` ${t("notify.and").trim()} `);
}

/** The digest row's value: the hours of a valid list, else empty (nothing to show). */
export function digestLabel(value: unknown, t: Translate): string {
  const hours = hoursOf(value);
  return hours === null ? "" : formatDigestHours(hours, t);
}

/** The quiet hours as the API sends them: `null` (off), `{ from, to }` of two hours, else `undefined` (malformed). */
export function quietOf(value: unknown): QuietValue | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const { from, to } = value as { from?: unknown; to?: unknown };
  return isHour(from) && isHour(to) ? { from, to } : undefined;
}

const twoDigits = (hour: number) => String(hour).padStart(2, "0");

/**
 * The quiet-hours row and option: «23–08» (two digits each, an en dash, as legacy's `'23-08'` read), `notify.quietOff`
 * «Выкл» for `null`, and empty for a malformed value.
 */
export function quietLabel(value: unknown, t: Translate): string {
  const quiet = quietOf(value);
  if (quiet === undefined) {
    return "";
  }
  return quiet === null ? t("notify.quietOff") : `${twoDigits(quiet.from)}–${twoDigits(quiet.to)}`;
}

/** Two quiet values are the same setting: both off, or the same hours. */
export function sameQuiet(a: unknown, b: unknown): boolean {
  const left = quietOf(a);
  const right = quietOf(b);
  if (left === undefined || right === undefined) {
    return false;
  }
  return left === null || right === null ? left === right : left.from === right.from && left.to === right.to;
}

/** Two digest lists are the same setting: the same hours in the same order. */
export function sameHours(a: unknown, b: unknown): boolean {
  const left = hoursOf(a);
  const right = hoursOf(b);
  return left !== null && right !== null && left.length === right.length && left.every((hour, index) => hour === right[index]);
}

/** The name of `code` in an option list of `GET /settings`, else the code itself (legacy `optionName`). */
export function optionName(options: unknown, code: string): string {
  if (!Array.isArray(options)) {
    return code;
  }
  const found = options.find((option): option is { code: string; name: string } => typeof option === "object" && option !== null && (option as { code?: unknown }).code === code);
  return typeof found?.name === "string" && found.name !== "" ? found.name : code;
}

/** The card style of the settings; anything but `rich` is «Классический» (LB-APP-051: the server may omit it). */
export function cardStyleOf(settings: unknown): CardStyleValue {
  const style = typeof settings === "object" && settings !== null ? (settings as { card_style?: unknown }).card_style : undefined;
  return style === "rich" ? "rich" : "classic";
}

/** The theme row: «Как в Telegram», «Светлая» or «Тёмная». */
export function themeLabel(theme: "auto" | "light" | "dark", t: Translate): string {
  return t(`settings.theme.${theme}`);
}

/**
 * The graphics row and the first option: «Полная», «Облегчённая», or for `auto` «Авто · полная» / «Авто ·
 * облегчённая» with the mode that auto chose now (legacy `graphicsAutoLabel`).
 */
export function graphicsLabel(mode: "auto" | "full" | "lite", liteNow: boolean, t: Translate): string {
  if (mode !== "auto") {
    return t(`settings.graphics.${mode}`);
  }
  return `${t("settings.graphics.auto")} · ${t(liteNow ? "settings.graphics.lite" : "settings.graphics.full").toLowerCase()}`;
}
