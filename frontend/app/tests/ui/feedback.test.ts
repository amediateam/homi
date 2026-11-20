import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { afterEach, describe, expect, it } from "vitest";

import { failed, saved } from "@/lib/ui/feedback";
import { currentToast, dismissToast } from "@/lib/ui/toast";

import { withDevFlags } from "../helpers/flags";

let fake: FakeTelegram | null = null;
const haptics = () =>
  (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);

afterEach(() => {
  dismissToast("app");
  fake?.uninstall();
  fake = null;
});

describe("failed (LB-APP-027, DEV-016)", () => {
  it("vibrates and shows «Не получилось сохранить» with the default flags (DEC-58)", () => {
    fake = fakeTelegram();
    failed();
    expect(haptics()).toEqual(["HapticFeedback.notificationOccurred(error)"]);
    expect(currentToast()?.message).toEqual({ key: "common.saveFailed" });
  });

  it("only vibrates with `toast: false`, whatever the flag", () => {
    fake = fakeTelegram();
    failed({ toast: false });
    withDevFlags({ dev016ErrorToastOnFailure: true }, (flags) => failed({ flags, toast: false }));
    expect(haptics()).toEqual(["HapticFeedback.notificationOccurred(error)", "HapticFeedback.notificationOccurred(error)"]);
    expect(currentToast()).toBeNull();
  });

  it("only vibrates with dev016ErrorToastOnFailure off", () => {
    fake = fakeTelegram();
    withDevFlags({ dev016ErrorToastOnFailure: false }, (flags) => failed({ flags }));
    expect(haptics()).toEqual(["HapticFeedback.notificationOccurred(error)"]);
    expect(currentToast()).toBeNull();
  });

  it("reads the app's flags when handed a rejection reason", async () => {
    fake = fakeTelegram();
    await Promise.reject(new Error("offline")).catch(failed);
    expect(haptics()).toEqual(["HapticFeedback.notificationOccurred(error)"]);
    expect(currentToast()?.message).toEqual({ key: "common.saveFailed" });
  });

  it("does not throw outside Telegram", () => {
    expect(() => failed()).not.toThrow();
  });
});

describe("saved", () => {
  it("plays the success haptic", () => {
    fake = fakeTelegram();
    saved();
    expect(haptics()).toEqual(["HapticFeedback.notificationOccurred(success)"]);
  });
});
