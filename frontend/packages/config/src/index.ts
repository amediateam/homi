/**
 * Shared, environment-independent product constants (ADR-0006, docs/infrastructure/environments.md).
 * Environment-specific values come from NEXT_PUBLIC_* variables in each app, never from here.
 */

export const locales = ["ru", "uz", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ru";

export const currencies = ["UZS", "USD"] as const;
export type Currency = (typeof currencies)[number];
export const defaultCurrency: Currency = "UZS";

/** Display time zone; the API stores and returns UTC. */
export const displayTimeZone = "Asia/Tashkent";

export const apiVersion = "v1";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
