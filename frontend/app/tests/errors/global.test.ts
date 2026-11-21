import { ApiError } from "@homi/api-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearTracked, recentTracked } from "@/lib/analytics/events";
import { resetJournal } from "@/lib/analytics/journal";
import { installGlobalErrorHandlers, reportsErrorEvent, reportsRejection, uninstallGlobalErrorHandlers } from "@/lib/errors/global";
import { clearRecentErrors } from "@/lib/errors/report";

type Boot = { ok: boolean; watching: boolean; sdk: null; errors: unknown[] };

beforeEach(() => {
  clearRecentErrors();
  clearTracked();
  resetJournal();
  (window as unknown as { __homiBoot?: Boot }).__homiBoot = { ok: false, watching: false, sdk: null, errors: [{ name: "early" }] };
});

afterEach(() => {
  uninstallGlobalErrorHandlers();
  delete (window as unknown as { __homiBoot?: Boot }).__homiBoot;
});

const reported = () => recentTracked().filter((event) => event.name === "app_error").map((event) => (event.props as { error: Record<string, string> }).error);

describe("the global handlers (WP-32, 03 §1.6; TMA-003, TMA-044)", () => {
  it("ignore «Script error.», an error without text and Next's control-flow throws", () => {
    expect(reportsErrorEvent({ message: "Script error.", error: null })).toBe(false);
    expect(reportsErrorEvent({ message: "", error: null })).toBe(false);
    expect(reportsErrorEvent({ message: "NEXT_REDIRECT", error: Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/ru;307;" }) })).toBe(false);
    expect(reportsErrorEvent({ message: "boom", error: new Error("boom") })).toBe(true);
  });

  it("ignore ApiError, a result already mapped to a UiError and an abort among rejections", () => {
    expect(reportsRejection(new ApiError("x", 500, "server"))).toBe(false);
    expect(reportsRejection({ ok: false, error: "offline", status: 0 })).toBe(false);
    expect(reportsRejection(new DOMException("aborted", "AbortError"))).toBe(false);
    expect(reportsRejection(new Error("real"))).toBe(true);
  });

  it("leave uncaught errors to the boot guard until React has mounted; report rejections from the start", () => {
    installGlobalErrorHandlers();
    window.dispatchEvent(new ErrorEvent("error", { message: "early", error: new Error("early") }));
    window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: new Error("early rejection"), promise: Promise.resolve() }));

    expect(reported().map((entry) => `${entry.kind}:${entry.message}`)).toEqual(["rejection:early rejection"]);
    expect((window as unknown as { __homiBoot: Boot }).__homiBoot.watching).toBe(false);
  });

  it("report an uncaught error with its file position and a rejection, once each, after the hand-over", () => {
    installGlobalErrorHandlers();
    installGlobalErrorHandlers();
    // BootGuard's hand-over, once React has mounted.
    (window as unknown as { __homiBoot: Boot }).__homiBoot.watching = true;

    const error = new Error("boom");
    window.dispatchEvent(new ErrorEvent("error", { message: "boom", error, filename: "https://app.homi.uz/a.js?x=1", lineno: 4, colno: 2 }));
    window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: new Error("lost"), promise: Promise.resolve() }));

    expect(reported()).toEqual([
      expect.objectContaining({ kind: "error", message: "boom", source: "https://app.homi.uz/a.js:4:2" }),
      expect.objectContaining({ kind: "rejection", message: "lost" }),
    ]);
    // The boot guard's own entries are not sent again.
    expect(reported().some((entry) => entry.name === "early")).toBe(false);
  });

  it("an error re-thrown asynchronously (safeCallback) is reported once", () => {
    installGlobalErrorHandlers();
    (window as unknown as { __homiBoot: Boot }).__homiBoot.watching = true;
    const error = new Error("in a Telegram callback");
    window.dispatchEvent(new ErrorEvent("error", { message: error.message, error }));
    window.dispatchEvent(new ErrorEvent("error", { message: error.message, error }));

    expect(reported()).toHaveLength(1);
  });
});
