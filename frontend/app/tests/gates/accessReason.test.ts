import { syntheticInitData } from "@homi/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

const bot = vi.hoisted(() => ({ username: "homi_test_bot" }));
vi.mock("@/lib/brand", async (importOriginal) => {
  const { brand } = await importOriginal<typeof import("@/lib/brand")>();
  return {
    brand: {
      ...brand,
      get botUsername() {
        return bot.username;
      },
    },
  };
});

import { mainRow, type NoAccessInput, noAccessView } from "@/features/gates/accessReason";
import { parseLaunch } from "@/lib/deeplinks/parse";
import { ACCESS_REASONS } from "@/lib/session/types";

/** The launch of a start parameter (none: a launch from the menu), read by WP-21's parser as the screen reads it. */
const launchOf = (startParam?: string, search = "") => parseLaunch(syntheticInitData({}, { startParam }), search);

const view = (input: Partial<NoAccessInput>) =>
  noAccessView({ reason: "join", checking: false, launch: launchOf(), supportUsername: null, locale: "ru", ...input });

afterEach(() => {
  bot.username = "homi_test_bot";
});

describe("the refusal reason (SCR-003)", () => {
  it.each(ACCESS_REASONS)("%s is shown as itself", (reason) => {
    expect(view({ reason }).reason).toBe(reason);
  });

  it.each([["beta"], [""], ["Private"], [null], [undefined], [403], [["join"]], [{ reason: "join" }]])("%j reads as private", (reason) => {
    expect(view({ reason }).reason).toBe("private");
  });
});

describe("the main button", () => {
  it.each([
    ["l_123", "https://t.me/homi_test_bot?start=s_share--l123"],
    ["l_123-web", "https://t.me/homi_test_bot?start=s_web--l123"],
    ["l_123-fb12", "https://t.me/homi_test_bot?start=s_fb12--l123"],
    ["l_123-seo-chan-45", "https://t.me/homi_test_bot?start=s_seo--l123"],
  ])("%s → «Перейти в бота» with its source and listing", (startParam, url) => {
    expect(mainRow("join", launchOf(startParam), "ru")).toEqual({ action: "toBot", url });
  });

  it.each([
    ["ru", "s_seo--l123"],
    ["uz", "s_seo_uz--l123"],
    ["en", "s_seo_en--l123"],
  ] as const)("the SEO source carries the interface language: %s → %s (BR-API-194)", (locale, payload) => {
    expect(mainRow("join", launchOf("l_123-seo-chan-45"), locale)).toEqual({ action: "toBot", url: `https://t.me/homi_test_bot?start=${payload}` });
  });

  it.each(["uz", "en"] as const)("other sources keep their name in %s", (locale) => {
    expect(mainRow("join", launchOf("l_123-web"), locale)).toEqual({ action: "toBot", url: "https://t.me/homi_test_bot?start=s_web--l123" });
    expect(mainRow("join", launchOf("l_123-fb12"), locale)).toEqual({ action: "toBot", url: "https://t.me/homi_test_bot?start=s_fb12--l123" });
  });

  it("is «Вернуться в бот» without a start parameter, also with ?listing= in the address", () => {
    expect(mainRow("join", launchOf(), "ru")).toEqual({ action: "back" });
    expect(mainRow("join", launchOf(undefined, "?listing=123"), "ru")).toEqual({ action: "back" });
    expect(mainRow("join", launchOf("l_0"), "ru")).toEqual({ action: "back" });
    expect(mainRow("join", launchOf("s_web"), "ru")).toEqual({ action: "back" });
  });

  it("is «Вернуться в бот» without a bot name", () => {
    bot.username = "";
    expect(mainRow("join", launchOf("l_123-web"), "ru")).toEqual({ action: "back" });
  });

  it("is «Вернуться в бот» for blocked and paused (no source passed to the bot), «Перейти в бота» for every other reason", () => {
    expect(mainRow("blocked", launchOf("l_123-web"), "ru")).toEqual({ action: "back" });
    expect(mainRow("paused", launchOf("l_123-seo-chan-45"), "en")).toEqual({ action: "back" });
    for (const reason of ACCESS_REASONS.filter((name) => name !== "blocked" && name !== "paused")) {
      expect(mainRow(reason, launchOf("l_123-web"), "ru").action, reason).toBe("toBot");
    }
  });
});

describe("the rows (SCR-003, in order)", () => {
  it("a channel-and-post start parameter adds the post first", () => {
    expect(view({ launch: launchOf("l_123-seo-chan-45") }).rows).toEqual([
      { action: "post", url: "https://t.me/chan/45" },
      { action: "toBot", url: "https://t.me/homi_test_bot?start=s_seo--l123" },
    ]);
    expect(view({ launch: launchOf("l_123-homi_rent-7") }).rows[0]).toEqual({ action: "post", url: "https://t.me/homi_rent/7" });
  });

  it.each(["l_123", "l_123-web", "l_123-fb12", "l_123-seo"])("%s has no post row", (startParam) => {
    expect(view({ launch: launchOf(startParam) }).rows.map((row) => row.action)).toEqual(["toBot"]);
  });

  it("the support row comes last and only with a valid support account", () => {
    expect(view({ supportUsername: "homi_support" }).rows).toEqual([{ action: "back" }, { action: "support", url: "https://t.me/homi_support" }]);
    expect(view({ supportUsername: null }).rows).toEqual([{ action: "back" }]);
    expect(view({ supportUsername: "bad name" }).rows).toEqual([{ action: "back" }]);
  });

  it("blocked keeps the post and support rows; only the main button changes", () => {
    expect(view({ reason: "blocked", launch: launchOf("l_123-seo-chan-45"), supportUsername: "homi_support" }).rows).toEqual([
      { action: "post", url: "https://t.me/chan/45" },
      { action: "back" },
      { action: "support", url: "https://t.me/homi_support" },
    ]);
  });
});

describe("the checking line", () => {
  it("shows while a re-check is pending, never for blocked; paused keeps it", () => {
    expect(view({ reason: "join", checking: true }).checking).toBe(true);
    expect(view({ reason: "join", checking: false }).checking).toBe(false);
    expect(view({ reason: "blocked", checking: true }).checking).toBe(false);
    expect(view({ reason: "paused", checking: true }).checking).toBe(true);
    expect(view({ reason: "something", checking: true }).checking).toBe(true);
  });
});
