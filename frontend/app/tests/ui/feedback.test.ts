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
  it("only vibrates with the flag off", () => {
    fake = fakeTelegram();
    failed();
    expect(haptics()).toEqual(["HapticFeedback.notificationOccurred(error)"]);
    expect(currentToast()).toBeNull();
  });

  it("also shows «Не получилось сохранить» with the flag on", () => {
    fake = fakeTelegram();
    withDevFlags({ dev016ErrorToastOnFailure: true }, (flags) => failed({ flags }));
    expect(haptics()).toEqual(["HapticFeedback.notificationOccurred(error)"]);
    expect(currentToast()?.message).toEqual({ key: "common.saveFailed" });
  });

  it("reads the app's flags when handed a rejection reason", async () => {
    fake = fakeTelegram();
    await Promise.reject(new Error("offline")).catch(failed);
    expect(haptics()).toEqual(["HapticFeedback.notificationOccurred(error)"]);
    expect(currentToast()).toBeNull();
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
