"use server";

import { locales, type Locale } from "@homi/config";
import type { components } from "@homi/types";

import { runAction, type ActionAuth, type ActionResult } from "./run";
import { oneOf, referenceCode } from "./validate";

type SettingsBody = components["schemas"]["UpdateSettingsRequest"];
type Settings = components["schemas"]["SettingsResource"];

/** What the first-launch pickers save (WP-23); WP-31 adds the other keys of `PATCH /settings`. */
export interface SettingsInput {
  locale?: Locale;
  city?: string;
}

/** The body of the keys present in `input`; `null` when one of them fails its check or none is present. */
function bodyOf(input: unknown): SettingsBody | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const { locale, city } = input as Record<string, unknown>;
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
  return Object.keys(body).length > 0 ? body : null;
}

/**
 * `PATCH /settings` (WP-23, `25` §4.2): the language and the city picked at the first launch. Only the keys present
 * are sent; an input with no key, or with one that fails its check, makes no request and answers `validation`.
 */
export async function updateSettings(input: SettingsInput, auth?: ActionAuth, locale?: string): Promise<ActionResult<Settings>> {
  const body = bodyOf(input);
  if (body === null) {
    return runAction.invalid("PATCH", "settings");
  }
  return runAction(auth, locale, (api) => api.updateSettings(body));
}
