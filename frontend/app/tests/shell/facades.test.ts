import { afterEach, describe, expect, it } from "vitest";

import { clearTracked, JOURNAL_EVENTS, recentTracked, track } from "@/lib/analytics/events";
import { clearRecentErrors, recentErrors, reportError } from "@/lib/errors/report";
import { devFlags } from "@/lib/flags";

import { withDevFlags } from "../helpers/flags";

afterEach(() => {
  clearTracked();
  clearRecentErrors();
});

describe("devFlags", () => {
  it("has the 17 DEV flags, every one off", () => {
    expect(Object.keys(devFlags)).toHaveLength(17);
    expect(Object.values(devFlags).every((value) => value === false)).toBe(true);
  });

  it("withDevFlags hands the overrides to the code under test and changes nothing global", () => {
    const seen = withDevFlags({ dev018ResetKeepsDaily: true }, (flags) => flags.dev018ResetKeepsDaily);

    expect(seen).toBe(true);
    expect(devFlags.dev018ResetKeepsDaily).toBe(false);
  });
});

describe("track", () => {
  it("knows the 21 journal events of 03 §3.3", () => {
    expect([...JOURNAL_EVENTS].sort()).toEqual(
      [
        "app_launch",
        "app_opened",
        "app_error",
        "follow_prompt_shown",
        "follow_prompt_expired",
        "follow_prompt_closed",
        "return_prompt_shown",
        "return_prompt_expired",
        "return_prompt_closed",
        "feed_radar_shown",
        "feed_radar_closed",
        "home_screen_offered",
        "home_screen_closed",
        "home_screen_added",
        "chat_access_declined",
        "chat_access_allowed",
        "listing_shared",
        "original_opened",
        "original_copied",
        "contact_call",
        "contact_write",
      ].sort(),
    );
  });

  it("is a no-op that keeps the last 20 calls", () => {
    track("listing_shared", { listing_id: 1 });
    track("follow_prompt_shown");
    expect(recentTracked()).toEqual([
      { name: "listing_shared", props: { listing_id: 1 } },
      { name: "follow_prompt_shown", props: {} },
    ]);

    for (let n = 2; n <= 30; n++) {
      track("original_copied", { listing_id: n });
    }
    expect(recentTracked()).toHaveLength(20);
    expect(recentTracked()[0]).toEqual({ name: "original_copied", props: { listing_id: 11 } });
  });
});

describe("reportError", () => {
  it("is a no-op that keeps the last 20 reports with their kind", () => {
    reportError(new Error("boom"), { kind: "render" });
    reportError("plain", { kind: "rejection" });

    expect(recentErrors().map(({ error, context }) => [error.message, context.kind])).toEqual([
      ["boom", "render"],
      ["plain", "rejection"],
    ]);

    for (let n = 0; n < 25; n++) {
      reportError(new Error(`e${n}`), { kind: "error" });
    }
    expect(recentErrors()).toHaveLength(20);
    expect(recentErrors()[0].error.message).toBe("e5");
  });
});
