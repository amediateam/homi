import { ApiError } from "@homi/api-client";

import { bootState } from "@/lib/telegram/sdk";

import { reportError } from "./report";

/**
 * The global error handlers of the Mini App (WP-32, `03` §1.6; TMA-003, TMA-044), installed synchronously by
 * `instrumentation-client.ts` before hydration, so hydration errors are caught. An uncaught error with a message is
 * reported as `error` (not «Script error.», a cross-origin script's, and not one without text); an unhandled
 * rejection as `rejection`, except an `ApiError` of `@homi/api-client`, a result already mapped to a `UiError` (an
 * `ApiResult` failure) and an abort. Next's control-flow throws (`redirect()`, `notFound()`) are caught by its own
 * boundaries; any that reached here are ignored by their `digest`. The hand-over with the boot guard of WP-21: until
 * React has mounted (`BootGuard` sets `__homiBoot.watching` with `ok`), uncaught errors stay the guard's — it posts
 * `/bff/boot-error`, which needs no session, and shows «Обновите Telegram» — so a bundle that never reaches a session
 * still reports them, and nothing is sent twice; rejections, which the guard does not watch, are reported here from the
 * start. The entries the guard collected are not sent again. Errors thrown in
 * Telegram callbacks are re-thrown asynchronously by `safeCallback` and arrive here once. Imports no React, no
 * catalogue and no PostHog: `instrumentation-client` must stay light.
 */

const CONTROL_FLOW = /^(NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK|NEXT_NOT_FOUND|BAILOUT_TO_CLIENT_SIDE_RENDERING|DYNAMIC_SERVER_USAGE)/;

function controlFlow(value: unknown): boolean {
  const digest = typeof value === "object" && value !== null ? (value as { digest?: unknown }).digest : undefined;
  return typeof digest === "string" && CONTROL_FLOW.test(digest);
}

function isAbort(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as { name?: unknown }).name === "AbortError";
}

/** An `ApiResult` failure (`lib/api/types.ts`): already shown as a `UiError` where it happened. */
function isMappedFailure(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as { ok?: unknown }).ok === false && typeof (value as { error?: unknown }).error === "string";
}

/** Whether an uncaught error event is reported. */
export function reportsErrorEvent(event: Pick<ErrorEvent, "message" | "error">): boolean {
  const message = event.message || (event.error instanceof Error ? event.error.message : "");
  return message !== "" && message !== "Script error." && !controlFlow(event.error);
}

/** Whether an unhandled rejection is reported. */
export function reportsRejection(reason: unknown): boolean {
  return !(reason instanceof ApiError) && !isMappedFailure(reason) && !isAbort(reason) && !controlFlow(reason);
}

let installed = false;

function onError(event: ErrorEvent): void {
  const boot = bootState();
  // The boot guard reports until React has mounted.
  if (!reportsErrorEvent(event) || (boot !== null && !boot.watching)) {
    return;
  }
  const source = event.filename ? `${event.filename}${event.lineno ? `:${event.lineno}${event.colno ? `:${event.colno}` : ""}` : ""}` : undefined;
  reportError(event.error ?? event.message, { kind: "error", ...(source === undefined ? {} : { source }) });
}

function onRejection(event: PromiseRejectionEvent): void {
  if (reportsRejection(event.reason)) {
    reportError(event.reason, { kind: "rejection" });
  }
}

/** Installs both listeners once per document. */
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === "undefined") {
    return;
  }
  installed = true;
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
}

/** Tests only. */
export function uninstallGlobalErrorHandlers(): void {
  if (!installed) {
    return;
  }
  installed = false;
  window.removeEventListener("error", onError);
  window.removeEventListener("unhandledrejection", onRejection);
}
