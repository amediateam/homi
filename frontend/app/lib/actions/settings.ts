"use server";

import { currencies, locales, type Locale } from "@homi/config";
import type { components } from "@homi/types";

import { runAction, type ActionAuth, type ActionResult } from "./run";
import { oneOf, referenceCode } from "./validate";

type SettingsBody = components["schemas"]["UpdateSettingsRequest"];
type Settings = components["schemas"]["SettingsResource"];

export type Theme = components["schemas"]["Theme"];
export type Currency = components["schemas"]["Currency"];
export type CardStyle = components["schemas"]["CardStyle"];
export type QuietHours = { from: number; to: number } | null;

/** The writable keys of `PATCH /settings` (WP-11): the first-launch pickers (WP-23) and the settings pages (WP-31). */
export interface SettingsInput {
  locale?: Locale;
  city?: string;
  theme?: Theme;
  currency?: Currency;
  /** `null` switches them off; hours are Asia/Tashkent wall-clock hours 0 … 23 and may cross midnight. */
  quiet_hours?: QuietHours;
  digest_hours?: readonly number[];
  card_style?: CardStyle;
}

const THEMES: readonly Theme[] = ["auto", "light", "dark"];
const CARD_STYLES: readonly CardStyle[] = ["classic", "rich"];

const isHour = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 23;

/** The quiet hours as sent: `null`, or `{ from, to }` of two hours; `undefined` when the value is malformed. */
function quietOf(value: unknown): QuietHours | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const { from, to } = value as Record<string, unknown>;
  return isHour(from) && isHour(to) ? { from, to } : undefined;
}

/** The digest hours as sent: a non-empty list of hours; `undefined` when the value is malformed. */
function digestOf(value: unknown): number[] | undefined {
  return Array.isArray(value) && value.length > 0 && value.every(isHour) ? [...value] : undefined;
}

/**
 * The body of the keys present in `input`; `null` when one of them fails its check or none is present. Which quiet
 * and digest values are allowed is the API's (the presets of `config/settings.php`, `422` otherwise); here only
 * their form is checked.
 */
function bodyOf(input: unknown): SettingsBody | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const { locale, city, theme, currency, quiet_hours: quiet, digest_hours: digest, card_style: cardStyle } = input as Record<string, unknown>;
  const body: SettingsBody = {};
  if (locale !== undefined) {
    const valid = oneOf(locale, locales);
    if (valid === null) {
      return null;
    }
    body.locale = valid;
  }
  if (city !== undefined) {
    const valid = referenceCode(city);
    if (valid === null) {
      return null;
    }
    // The generated body types `city` as the enum of the stub's three fixture cities; the API checks the code against
    // `GET /reference` of the same driver, so any code-shaped city is sent. The enum goes stale (known issue).
    body.city = valid as NonNullable<SettingsBody["city"]>;
  }
  if (theme !== undefined) {
    const valid = oneOf(theme, THEMES);
    if (valid === null) {
      return null;
    }
    body.theme = valid;
  }
  if (currency !== undefined) {
    const valid = oneOf(currency, currencies);
    if (valid === null) {
      return null;
    }
    body.currency = valid;
  }
  if (quiet !== undefined) {
    const valid = quietOf(quiet);
    if (valid === undefined) {
      return null;
    }
    body.quiet_hours = valid;
  }
  if (digest !== undefined) {
    const valid = digestOf(digest);
    if (valid === undefined) {
      return null;
    }
    body.digest_hours = valid;
  }
  if (cardStyle !== undefined) {
    const valid = oneOf(cardStyle, CARD_STYLES);
    if (valid === null) {
      return null;
    }
    body.card_style = valid;
  }
  return Object.keys(body).length > 0 ? body : null;
}

/**
 * `PATCH /settings` (WP-23, WP-31; `25` §4.2): only the keys present are sent, and the answer is the whole settings
 * resource. An input with no key, or with one that fails its check, makes no request and answers `validation`.
 */
export async function updateSettings(input: SettingsInput, auth?: ActionAuth, locale?: string): Promise<ActionResult<Settings>> {
  const body = bodyOf(input);
  if (body === null) {
    return runAction.invalid("PATCH", "settings");
  }
  return runAction(auth, locale, (api) => api.updateSettings(body));
}

/**
 * `POST /settings/card-sample` (WP-31, SCR-048): the bot sends one sample card in the saved style. A success answers
 * `{ sent }`; an answer whose `sent` is not a boolean counts as not sent (LB-APP-052). A failure comes back as it is,
 * and the caller treats it as not sent too. The input is unused: every action takes one.
 */
export async function sendCardSample(_input: null, auth?: ActionAuth, locale?: string): Promise<ActionResult<{ sent: boolean }>> {
  const result = await runAction(auth, locale, (api) => api.cardSample());
  if (!result.ok) {
    return result;
  }
  const sent = (result.data as { sent?: unknown } | null)?.sent;
  return { ...result, data: { sent: sent === true } };
}
