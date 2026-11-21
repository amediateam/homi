import type { I18nReporter } from "@homi/i18n";

import { BUILD_VERSION } from "@/lib/analytics/buildVersion";
import { track } from "@/lib/analytics/events";
import { currentScreen } from "@/lib/analytics/screens";
import { platform, version } from "@/lib/telegram/sdk";

import { errorMessage, errorName, errorSource, limit, PLATFORM_MAX, SCREEN_MAX, TG_MAX } from "./sanitize";

/** Where an error was caught: the boot guard, the global handlers, a render boundary, or the i18n runtime rules. */
export type ErrorKind = "boot" | "error" | "rejection" | "render" | "i18n";

/** `source` names where it came from when no stack does (a label such as `toast`); other fields are not sent. */
export type ErrorContext = { kind: ErrorKind; source?: string; key?: string | null } & Record<string, unknown>;

export type ReportedError = { error: Error; context: ErrorContext };

/** Distinct reports per launch, and their own cap for missing catalogue messages (`03` §3.4). */
export const REPORTS_MAX = 5;
export const MISSING_MAX = 3;

const LIMIT = 20;
const recent: ReportedError[] = [];
const seen = new Set<string>();
let reports = 0;
let missing = 0;
let started = false;
let renderHook: ((error: Error) => void) | null = null;

/** The session is ready: later reports carry `stage: 'app'` (`AnalyticsBoot`). */
export function markAppStarted(): void {
  started = true;
}

/** PostHog's exception capture, called for `render` reports once PostHog is loaded (`lib/analytics/posthog.ts`). */
export function setRenderHook(hook: ((error: Error) => void) | null): void {
  renderHook = hook;
}

/**
 * Reports an error as `app_error` (WP-32, `03` §1.6, §3.4): `{ v, error: { kind, name, message, source, stage, screen,
 * tg, platform } }` within the limits of `sanitize.ts`, scrubbed; only those fields — the context's other keys stay
 * in the browser. A missing catalogue message (`kind: 'i18n'`, from `@homi/i18n`) goes as `kind: 'error'`, `name:
 * 'MissingMessage'`, its key path as the message and `source: 'i18n'` (no contract change). The same `kind|name|message`
 * is sent once; at most 5 distinct reports per launch, missing messages with their own cap of 3. `stage` is `boot`
 * until `markAppStarted()`. A `render` report also reaches PostHog's exception capture when it is loaded. The last 20
 * calls stay in memory for tests.
 */
export function reportError(error: unknown, context: ErrorContext): void {
  const value = error instanceof Error ? error : new Error(String(error));
  recent.push({ error: value, context });
  if (recent.length > LIMIT) {
    recent.shift();
  }

  const i18n = context.kind === "i18n";
  const kind = i18n ? "error" : context.kind;
  const name = i18n ? "MissingMessage" : errorName(error);
  const message = i18n ? limit(typeof context.key === "string" ? context.key : errorMessage(error), 300) : errorMessage(error);
  const id = `${kind}|${name}|${message}`;
  if (seen.has(id) || (i18n ? missing >= MISSING_MAX : reports >= REPORTS_MAX)) {
    return;
  }
  seen.add(id);
  if (i18n) {
    missing += 1;
  } else {
    reports += 1;
  }

  track("app_error", {
    v: BUILD_VERSION,
    error: {
      kind,
      name,
      message,
      source: i18n ? "i18n" : errorSource(error, typeof context.source === "string" ? context.source : undefined),
      stage: started ? "app" : "boot",
      screen: limit(currentScreen(), SCREEN_MAX),
      tg: limit(version(), TG_MAX),
      platform: limit(platform(), PLATFORM_MAX),
    },
  });
  if (kind === "render") {
    try {
      renderHook?.(value);
    } catch {
      // PostHog failing changes nothing.
    }
  }
}

/** The i18n runtime rules of @homi/i18n report through the same facade. */
export const reportI18n: I18nReporter = (error, issue) => reportError(error, issue);

/** The last 20 reports, oldest first; tests only. */
export function recentErrors(): readonly ReportedError[] {
  return recent;
}

/** Forgets the kept reports and the launch's de-duplication, caps and stage; tests only. */
export function clearRecentErrors(): void {
  recent.length = 0;
  seen.clear();
  reports = 0;
  missing = 0;
  started = false;
  renderHook = null;
}
