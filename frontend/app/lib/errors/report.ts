import type { I18nReporter } from "@homi/i18n";

/** Where an error was caught: the boot guard, the global handlers, a render boundary, or the i18n runtime rules. */
export type ErrorKind = "boot" | "error" | "rejection" | "render" | "i18n";

export type ErrorContext = { kind: ErrorKind } & Record<string, unknown>;

export type ReportedError = { error: Error; context: ErrorContext };

const LIMIT = 20;
const recent: ReportedError[] = [];

/**
 * Reports an error (WP-20 facade). A no-op that keeps the last 20 calls in memory for tests until WP-32 sends
 * them as `app_error`.
 */
export function reportError(error: unknown, context: ErrorContext): void {
  recent.push({ error: error instanceof Error ? error : new Error(String(error)), context });
  if (recent.length > LIMIT) {
    recent.shift();
  }
}

/** The i18n runtime rules of @homi/i18n report through the same facade. */
export const reportI18n: I18nReporter = (error, issue) => reportError(error, issue);

/** The last 20 reports, oldest first; tests only. */
export function recentErrors(): readonly ReportedError[] {
  return recent;
}

/** Forgets the kept reports; tests only. */
export function clearRecentErrors(): void {
  recent.length = 0;
}
