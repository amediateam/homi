import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearTracked, recentTracked } from "@/lib/analytics/events";
import { resetJournal } from "@/lib/analytics/journal";
import { pushScreenLayer, resetScreens, setScreen } from "@/lib/analytics/screens";
import { clearRecentErrors, markAppStarted, MISSING_MAX, reportError, reportI18n, REPORTS_MAX, setRenderHook } from "@/lib/errors/report";

const errors = () => recentTracked().filter((event) => event.name === "app_error").map((event) => (event.props as { error: Record<string, string> }).error);

beforeEach(() => {
  clearRecentErrors();
  clearTracked();
  resetJournal();
  resetScreens();
});

afterEach(() => {
  clearRecentErrors();
});

describe("reportError (WP-32, 03 §1.6, §3.4)", () => {
  it("builds { v, error } with every field, the screen on top and the stage of the launch", () => {
    setScreen("search/list");
    reportError(new TypeError("x is undefined"), { kind: "error", where: "subscribe", source: "toast" });
    markAppStarted();
    const pop = pushScreenLayer("map/card");
    reportError("thrown", { kind: "rejection" });
    pop();

    const [first, second] = errors();
    expect(Object.keys(first!).sort()).toEqual(["kind", "message", "name", "platform", "screen", "source", "stage", "tg"]);
    expect(first).toMatchObject({ kind: "error", name: "TypeError", message: "x is undefined", source: "toast", stage: "boot", screen: "search/list" });
    expect(second).toMatchObject({ kind: "rejection", name: "string", message: "thrown", stage: "app", screen: "map/card" });
    expect((recentTracked()[0]?.props as { v: string }).v).toBe("dev");
  });

  it("sends the same kind, name and message once, and at most 5 distinct reports per launch", () => {
    reportError(new Error("same"), { kind: "error" });
    reportError(new Error("same"), { kind: "error" });
    reportError(new Error("same"), { kind: "rejection" });
    for (let index = 0; index < REPORTS_MAX + 3; index += 1) {
      reportError(new Error(`distinct ${index}`), { kind: "error" });
    }

    expect(errors()).toHaveLength(REPORTS_MAX);
    expect(errors().map((error) => error.message).slice(0, 2)).toEqual(["same", "same"]);
  });

  it("a missing message goes as kind error, name MissingMessage, its key as the message and source i18n — with its own cap of 3", () => {
    for (let index = 0; index < MISSING_MAX + 2; index += 1) {
      reportI18n(new Error("MISSING_MESSAGE"), { kind: "i18n", key: `feed.key${index}`, code: "MISSING_MESSAGE" });
    }
    for (let index = 0; index < REPORTS_MAX; index += 1) {
      reportError(new Error(`real ${index}`), { kind: "error" });
    }

    const missing = errors().filter((error) => error.name === "MissingMessage");
    expect(missing).toHaveLength(MISSING_MAX);
    expect(missing[0]).toMatchObject({ kind: "error", message: "feed.key0", source: "i18n" });
    expect(errors().filter((error) => error.name === "Error")).toHaveLength(REPORTS_MAX);
  });

  it("calls PostHog's exception hook for render reports only", () => {
    const hook = vi.fn();
    setRenderHook(hook);
    reportError(new Error("render"), { kind: "render" });
    reportError(new Error("plain"), { kind: "error" });

    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it("scrubs the message and takes the source from the stack without its query", () => {
    const error = new Error("failed for x@y.uz at +998901234567");
    error.stack = "Error\n    at https://app.homi.uz/_next/static/a.js?v=1:3:4";
    reportError(error, { kind: "error" });

    expect(errors()[0]).toMatchObject({ message: "failed for ***@*** at +998***", source: "https://app.homi.uz/_next/static/a.js:3:4" });
  });
});
