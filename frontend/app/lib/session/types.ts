import type { Currency, Locale } from "@homi/config";

/**
 * The user part of the session (`MeResource` of `docs/api/openapi.json`, WP-11). Written by hand because the app does
 * not depend on `@homi/types` yet; `tests/session/types.test.ts` compares the keys with the contract, and WP-22
 * replaces this with the generated type.
 */
export interface Me {
  locale: Locale;
  locale_chosen: boolean;
  currency: Currency;
  theme: "auto" | "light" | "dark";
  city: string | null;
  city_chosen: boolean;
  team: boolean;
  analytics: { distinct_id: string; autocapture: boolean; replay: boolean; replay_rate: number } | null;
}

export const ME_KEYS = ["locale", "locale_chosen", "currency", "theme", "city", "city_chosen", "team", "analytics"] as const satisfies readonly (keyof Me)[];

/** `reason` of `403 access_denied`; an unknown or missing one counts as `private` (`docs/api/README.md`). */
export type AccessReason = "private" | "invite" | "full" | "blocked" | "join";

export const ACCESS_REASONS: readonly AccessReason[] = ["private", "invite", "full", "blocked", "join"];

export function accessReason(value: unknown): AccessReason {
  return ACCESS_REASONS.includes(value as AccessReason) ? (value as AccessReason) : "private";
}
