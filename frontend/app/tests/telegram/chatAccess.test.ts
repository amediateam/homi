import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearTracked, recentTracked } from "@/lib/analytics/events";
import type { ApiResult } from "@/lib/api/types";
import { LINK_DEBOUNCE_MS } from "@/lib/telegram";
import { isNoChat, withChatAccess } from "@/lib/telegram/chatAccess";

const bot = vi.hoisted(() => ({ url: "https://t.me/homi_test_bot" as string | null }));
vi.mock("@/lib/deeplinks/build", () => ({ botUrl: () => bot.url }));

type Result = ApiResult<{ id: string }>;

const success: Result = { ok: true, data: { id: "01JD0000000000000000000001" }, meta: { source: "stub" } };
const noChat: Result = { ok: false, error: "conflict", status: 409, code: "no_chat", method: "POST", path: "radars" };
const limit: Result = { ok: false, error: "conflict", status: 409, code: "radar_limit", method: "POST", path: "radars" };
const offline: Result = { ok: false, error: "offline", status: 0, method: "ACTION", path: "createRadar" };

const RESTART = "Перезапустите бота";

let fake: FakeTelegram | null = null;
/** `tg.openLink` refuses the same address again within 1.5 s (module state): every test starts later than the last. */
let clock = Date.now();

const members = () => (fake?.calls ?? []).map((entry) => entry.member);
const count = (member: string) => members().filter((name) => name === member).length;
const events = () => recentTracked().map((event) => event.name);

/** A write that answers `answers` in turn, the last one for every further call. */
function writes(...answers: Result[]) {
  return vi.fn(async () => (answers.length > 1 ? answers.shift()! : answers[0]));
}

beforeEach(() => {
  clock += 10 * LINK_DEBOUNCE_MS;
  vi.spyOn(Date, "now").mockReturnValue(clock);
  bot.url = "https://t.me/homi_test_bot";
  clearTracked();
});

afterEach(() => {
  vi.restoreAllMocks();
  fake?.uninstall();
  fake = null;
});

describe("isNoChat (WP-30)", () => {
  it("is a 409 conflict with the code no_chat, nothing else", () => {
    expect(isNoChat(noChat)).toBe(true);
    expect(isNoChat(limit)).toBe(false);
    expect(isNoChat(success)).toBe(false);
    expect(isNoChat({ ...noChat, error: "forbidden", status: 403 })).toBe(false);
    expect(isNoChat({ ...noChat, code: undefined })).toBe(false);
  });
});

describe("withChatAccess (WP-30, TMA-033)", () => {
  it("granted: one retry, chat_access_allowed once, and the retry's success comes back", async () => {
    fake = fakeTelegram({ version: "7.0", answers: { writeAccess: true } });
    const run = writes(noChat, success);

    await expect(withChatAccess(run, { restartText: RESTART })).resolves.toEqual(success);

    expect(run).toHaveBeenCalledTimes(2);
    expect(count("requestWriteAccess")).toBe(1);
    expect(events()).toEqual(["chat_access_allowed"]);
    expect(members()).not.toContain("showConfirm");
  });

  it("granted, then another failure: the retry's failure comes back without a question", async () => {
    fake = fakeTelegram({ answers: { writeAccess: true } });

    await expect(withChatAccess(writes(noChat, limit), { restartText: RESTART })).resolves.toEqual(limit);
    expect(members()).not.toContain("showConfirm");
  });

  it("declined: chat_access_declined, the failure comes back, no retry and no confirm", async () => {
    fake = fakeTelegram({ answers: { writeAccess: false } });
    const run = writes(noChat);

    await expect(withChatAccess(run, { restartText: RESTART })).resolves.toEqual(noChat);

    expect(run).toHaveBeenCalledTimes(1);
    expect(events()).toEqual(["chat_access_declined"]);
    expect(members()).not.toContain("showConfirm");
    expect(members()).not.toContain("openTelegramLink");
  });

  it("version 6.8 cannot ask: the restart question, and OK opens HOMI's bot", async () => {
    fake = fakeTelegram({ version: "6.8", answers: { confirm: true } });
    const run = writes(noChat);

    await expect(withChatAccess(run, { restartText: RESTART })).resolves.toEqual(noChat);

    expect(run).toHaveBeenCalledTimes(1);
    expect(members()).not.toContain("requestWriteAccess");
    expect(fake.calls.find((entry) => entry.member === "showConfirm")?.args[0]).toBe(RESTART);
    expect(fake.calls.filter((entry) => entry.member === "openTelegramLink").map((entry) => entry.args[0])).toEqual(["https://t.me/homi_test_bot"]);
    expect(events()).toEqual([]);
  });

  it("the question answered Cancel opens nothing", async () => {
    fake = fakeTelegram({ version: "6.8", answers: { confirm: false } });

    await expect(withChatAccess(writes(noChat), { restartText: RESTART })).resolves.toEqual(noChat);

    expect(count("showConfirm")).toBe(1);
    expect(members()).not.toContain("openTelegramLink");
  });

  it("granted but still no_chat: the question once, the original failure back", async () => {
    fake = fakeTelegram({ answers: { writeAccess: true, confirm: true } });
    const first: Result = { ...noChat, path: "radars/:id" };
    const run = writes(first, noChat);

    await expect(withChatAccess(run, { restartText: RESTART })).resolves.toBe(first);

    expect(run).toHaveBeenCalledTimes(2);
    expect(count("requestWriteAccess")).toBe(1);
    expect(count("showConfirm")).toBe(1);
    expect(count("openTelegramLink")).toBe(1);
  });

  it("other results pass untouched: no sheet, no question, one run", async () => {
    fake = fakeTelegram();
    for (const result of [success, limit, offline]) {
      const run = writes(result);
      await expect(withChatAccess(run, { restartText: RESTART })).resolves.toBe(result);
      expect(run).toHaveBeenCalledTimes(1);
    }

    expect(fake.calls.filter((entry) => ["requestWriteAccess", "showConfirm", "openTelegramLink"].includes(entry.member))).toEqual([]);
    expect(events()).toEqual([]);
  });

  it("without HOMI's bot there is no question to ask", async () => {
    bot.url = null;
    fake = fakeTelegram({ version: "6.8" });

    await expect(withChatAccess(writes(noChat), { restartText: RESTART })).resolves.toEqual(noChat);

    expect(members()).not.toContain("showConfirm");
    expect(members()).not.toContain("openTelegramLink");
  });

  it("outside Telegram: the browser's confirm, and OK opens the bot in a new tab", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    await expect(withChatAccess(writes(noChat), { restartText: RESTART })).resolves.toEqual(noChat);

    expect(confirm).toHaveBeenCalledWith(RESTART);
    expect(open).toHaveBeenCalledWith("https://t.me/homi_test_bot", "_blank", "noopener");
  });

  it("concurrent calls share one native sheet and log one answer; each retries its own write", async () => {
    fake = fakeTelegram({ answers: { writeAccess: true } });
    const a = writes(noChat, success);
    const b = writes(noChat, { ...success, data: { id: "01JD0000000000000000000002" } });

    const [first, second] = await Promise.all([withChatAccess(a, { restartText: RESTART }), withChatAccess(b, { restartText: RESTART })]);

    expect(first).toEqual(success);
    expect(second).toMatchObject({ ok: true, data: { id: "01JD0000000000000000000002" } });
    expect(count("requestWriteAccess")).toBe(1);
    expect(events()).toEqual(["chat_access_allowed"]);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it("concurrent calls that cannot ask share one restart question", async () => {
    fake = fakeTelegram({ version: "6.8", answers: { confirm: true } });

    await Promise.all([withChatAccess(writes(noChat), { restartText: RESTART }), withChatAccess(writes(noChat), { restartText: RESTART })]);

    expect(count("showConfirm")).toBe(1);
    expect(count("openTelegramLink")).toBe(1);
  });

  it("a later call asks again once the sheet has answered", async () => {
    fake = fakeTelegram({ answers: { writeAccess: false } });

    await withChatAccess(writes(noChat), { restartText: RESTART });
    await withChatAccess(writes(noChat), { restartText: RESTART });

    expect(count("requestWriteAccess")).toBe(2);
    expect(events()).toEqual(["chat_access_declined", "chat_access_declined"]);
  });
});
