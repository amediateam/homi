import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { afterEach, describe, expect, it } from "vitest";

import { requestContact } from "@/lib/telegram/contact";

let fake: FakeTelegram | null = null;

afterEach(() => {
  fake?.uninstall();
  fake = null;
});

describe("requestContact (TMA-034, WP-81)", () => {
  it.each([
    ["6.0", null],
    ["6.2", null],
    ["6.9", true],
    ["7.0", true],
    ["8.0", true],
    ["9.0", true],
  ])("on %s answers %s when the user shares", async (version, expected) => {
    fake = fakeTelegram({ version, answers: { contact: true } });

    await expect(requestContact()).resolves.toBe(expected);
    expect(fake.calls.some((call) => call.member === "requestContact")).toBe(expected !== null);
  });

  it("answers false when the user declines", async () => {
    fake = fakeTelegram({ version: "7.0", answers: { contact: false } });

    await expect(requestContact()).resolves.toBe(false);
  });

  it("is null outside Telegram", async () => {
    await expect(requestContact()).resolves.toBeNull();
  });

  it("drops the contact the client passes second: the answer is a boolean only (DEC-72)", async () => {
    fake = fakeTelegram({ version: "8.0", answers: { contact: true } });

    const answer = await requestContact();

    expect(answer).toBe(true);
    expect(JSON.stringify(answer)).not.toContain("998");
  });

  it("is null when the client's method throws", async () => {
    fake = fakeTelegram({ version: "8.0" });
    (fake.webApp as unknown as { requestContact: () => void }).requestContact = () => {
      throw new Error("WebAppMethodUnsupported");
    };

    await expect(requestContact()).resolves.toBeNull();
  });
});
