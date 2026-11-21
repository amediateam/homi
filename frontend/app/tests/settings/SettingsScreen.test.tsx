import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/lib/api/types";

const state = vi.hoisted(() => ({
  answers: new Map<string, ApiResult<unknown> | "pending">(),
  sent: [] as string[],
  session: { status: "ready", me: { currency: "USD" } } as Record<string, unknown>,
  push: vi.fn<(href: string) => void>(),
}));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string) => {
    state.sent.push(path);
    const answer = state.answers.get(path);
    return answer === "pending" || answer === undefined ? new Promise(() => undefined) : Promise.resolve(answer);
  },
}));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn(), patchMe: vi.fn() }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => state.session }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { push: (href: string) => state.push(href) } }));
vi.mock("@/features/settings/server", () => ({ SettingsServer: () => null }));

import { resetGraphicsRow, SettingsFallback, SettingsScreen } from "@/features/settings/SettingsScreen";
import { resetResources } from "@/lib/data/useResource";
import { resetReference } from "@/lib/reference/useReference";

import { feedReference } from "../helpers/reference";
import { settingsOf, withIntl } from "./harness";

let fake: FakeTelegram | null = null;
const ok = (data: unknown): ApiResult<unknown> => ({ ok: true, data, meta: { source: "stub" } });
const HIDDEN = {
  listings: [{ number: 100013 }, { number: 101020 }],
  authors: [{ id: "01JD0000000000000000000011", kind: "phone", label: "+998 ** *** ** 41", count: 24 }],
};

const group = (id: string) => document.querySelector<HTMLElement>(`[data-settings-group="${id}"]`);
const row = (id: string) => document.querySelector<HTMLButtonElement>(`[data-settings-row="${id}"]`);
const value = (id: string) => row(id)?.querySelector("[data-settings-value]")?.textContent ?? null;
const rows = () => [...document.querySelectorAll("[data-settings-row]")].map((node) => node.getAttribute("data-settings-row"));
const groups = () => [...document.querySelectorAll("[data-settings-group]")].map((node) => node.getAttribute("data-settings-group"));
const settle = () => act(async () => undefined);

function shown({ settings = ok(settingsOf()), hidden = ok({ listings: [], authors: [] }) }: { settings?: ApiResult<unknown> | "pending"; hidden?: ApiResult<unknown> | "pending" } = {}) {
  state.answers.set("settings", settings);
  state.answers.set("hidden", hidden);
  return render(withIntl(<SettingsScreen />));
}

beforeEach(() => {
  state.answers.clear();
  state.sent.length = 0;
  state.session = { status: "ready", me: { currency: "USD" } };
  state.push.mockReset();
  resetResources();
  resetGraphicsRow();
  window.localStorage.clear();
  fake = fakeTelegram({ version: "8.0", answers: { homeScreenStatus: "added" } });
  feedReference({ reference: {} });
});

afterEach(() => {
  cleanup();
  fake?.uninstall();
  fake = null;
  resetReference();
  vi.unstubAllGlobals();
});

describe("SettingsScreen (WP-31, SCR-032): states", () => {
  it("a centred spinner until GET /settings answers, inside the one root data-route", () => {
    shown({ settings: "pending" });

    expect(document.querySelector('[data-route="settings"] [data-settings-state="loading"]')).not.toBeNull();
    expect(rows()).toEqual([]);
  });

  it("with nothing loaded and an error: the tall error state; «Повторить» reads everything again", async () => {
    shown({ settings: { ok: false, error: "offline", method: "GET", path: "settings" } as ApiResult<unknown> });
    await settle();
    expect(screen.getByText("Нет связи")).toBeTruthy();

    state.answers.set("settings", ok(settingsOf()));
    state.sent.length = 0;
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    await settle();

    expect(state.sent).toEqual(expect.arrayContaining(["settings", "hidden"]));
    expect(row("theme")).not.toBeNull();
  });

  it("the layout's fallback is the frame and a spinner, with no reads of its own (so the server read is adopted)", async () => {
    const { default: SettingsLayout } = await import("@/app/[locale]/(main)/settings/layout");
    const tree = SettingsLayout({ children: null }) as { props: { children: [{ props: { fallback: { type: unknown } } }, unknown] } };
    expect(tree.props.children[0].props.fallback.type).toBe(SettingsFallback);

    render(withIntl(<SettingsFallback />));

    expect(document.querySelector('[data-route="settings"] [data-settings-state="loading"]')).not.toBeNull();
    expect(state.sent).toEqual([]);
  });

  it("a server failure says «Не загрузилось»", async () => {
    shown({ settings: { ok: false, error: "server", status: 500, method: "GET", path: "settings" } as ApiResult<unknown> });
    await settle();

    expect(screen.getByText("Не загрузилось")).toBeTruthy();
  });

  it("the server render hides the graphics row, so hydration matches; the client decides it once", async () => {
    window.localStorage.setItem("homi-graphics", "lite");
    const { renderToString } = await import("react-dom/server");
    const markup = renderToString(withIntl(<SettingsScreen initialSettings={settingsOf()} initialHidden={{ listings: [], authors: [] }} />));
    expect(markup).not.toContain('data-settings-row="graphics"');

    shown();
    await settle();
    expect(row("graphics")).not.toBeNull();
    // Decided once: the mode set back to auto does not take the row away in this launch.
    window.localStorage.removeItem("homi-graphics");
    cleanup();
    shown();
    await settle();
    expect(row("graphics")).not.toBeNull();
  });

  it("the layout's server read shows at once, without a request", () => {
    render(withIntl(<SettingsScreen initialSettings={settingsOf({ quiet_hours: null })} initialHidden={{ listings: [], authors: [] }} />));

    expect(value("quiet-hours")).toBe("Выкл");
    expect(state.sent).toEqual([]);
  });
});

describe("SettingsScreen: groups, rows and values", () => {
  it("the legacy groups in order with the values of the settings", async () => {
    shown();
    await settle();

    expect(groups()).toEqual(["look", "region", "notify", "chat", "about"]);
    expect(within(group("look")!).getByRole("heading").textContent).toBe("Оформление");
    expect(value("theme")).toBe("Как в Telegram");
    expect(value("language")).toBe("Русский");
    expect(value("currency")).toBe("Доллары");
    expect(value("quiet-hours")).toBe("23–08");
    expect(value("digest")).toBe("9 и 19");
    expect(value("cards")).toBe("Классический");
    expect(group("notify")?.textContent).toContain("Время — ташкентское.");
    // No «Новое» pill on the card style (DEC-57).
    expect(row("cards")?.textContent).not.toContain("Новое");
  });

  it("a language code the list does not name shows the code; the currency is the profile's", async () => {
    state.session = { status: "ready", me: { currency: "UZS" } };
    shown({ settings: ok(settingsOf({ options: { ...settingsOf().options, locales: [{ code: "en", name: "English" }] } })) });
    await settle();

    expect(value("language")).toBe("ru");
    expect(value("currency")).toBe("Сумы");
  });

  it("an unknown card style reads «Классический», rich «Новый»", async () => {
    shown({ settings: ok(settingsOf({ card_style: "fancy" as never })) });
    await settle();
    expect(value("cards")).toBe("Классический");
    cleanup();
    resetResources();

    shown({ settings: ok(settingsOf({ card_style: "rich" })) });
    await settle();
    expect(value("cards")).toBe("Новый");
  });

  it("the graphics row: not by default, on Android, or once the mode was set by hand (BR-APP-052)", async () => {
    shown();
    await settle();
    expect(row("graphics")).toBeNull();
    cleanup();
    resetGraphicsRow();

    vi.stubGlobal("navigator", { ...navigator, userAgent: "Mozilla/5.0 (Linux; Android 14)" });
    shown();
    await settle();
    expect(value("graphics")).toMatch(/^Авто · /);
    cleanup();
    vi.unstubAllGlobals();
    resetGraphicsRow();

    window.localStorage.setItem("homi-graphics", "lite");
    shown();
    await settle();
    expect(value("graphics")).toBe("Облегчённая");
  });

  it("«Лента» only while something is hidden, with the count of listings plus authors (BR-APP-053)", async () => {
    shown();
    await settle();
    expect(group("feed")).toBeNull();
    cleanup();
    resetResources();

    shown({ hidden: ok(HIDDEN) });
    await settle();
    expect(groups()).toEqual(["look", "region", "notify", "chat", "feed", "about"]);
    expect(value("hidden")).toBe("3");
  });

  it("a failed hidden list leaves the group out and the screen standing", async () => {
    shown({ hidden: { ok: false, error: "server", status: 500, method: "GET", path: "hidden" } as ApiResult<unknown> });
    await settle();

    expect(group("feed")).toBeNull();
    expect(row("theme")).not.toBeNull();
  });

  it("a row plays a light impact and pushes its page", async () => {
    shown();
    await settle();

    for (const [id, href] of [
      ["theme", "/settings/theme"],
      ["language", "/settings/language"],
      ["currency", "/settings/currency"],
      ["quiet-hours", "/settings/quiet-hours"],
      ["digest", "/settings/digest"],
      ["cards", "/settings/cards"],
    ] as const) {
      fireEvent.click(row(id)!);
      expect(state.push).toHaveBeenLastCalledWith(href);
    }
    expect(fake?.calls.filter((call) => call.member === "HapticFeedback.impactOccurred").map((call) => call.args[0])).toEqual(Array(6).fill("light"));
  });
});

describe("SettingsScreen: «О приложении»", () => {
  it("no home, support, Instagram or privacy row by default; the about text names HOMI", async () => {
    shown();
    await settle();

    expect(rows().filter((id) => ["home", "support", "instagram", "privacy"].includes(id ?? ""))).toEqual([]);
    expect(group("about")?.textContent).toContain("HOMI собирает объявления из открытых Telegram-каналов.");
    expect(group("about")?.textContent).not.toMatch(/kvadro/i);
  });

  it("support while the reference data names an account: it opens through Telegram", async () => {
    feedReference({ reference: { bot: { username: "homi_bot", support_username: "homi_support" } } as never });
    shown();
    await settle();

    fireEvent.click(row("support")!);
    expect(fake?.calls.find((call) => call.member === "openTelegramLink" || call.member === "openLink")?.args[0]).toBe("https://t.me/homi_support");
  });

  it.each([
    ["missed", true],
    ["unknown", true],
    ["added", false],
    ["unsupported", false],
  ] as const)("the home-screen row for the status «%s»: %s", async (status, present) => {
    fake?.uninstall();
    fake = fakeTelegram({ version: "8.0", answers: { homeScreenStatus: status } });
    shown();
    await settle();

    expect(row("home") !== null).toBe(present);
    if (present) {
      expect(value("home")).toBe("Добавить");
      fireEvent.click(row("home")!);
      expect(fake.calls.some((call) => call.member === "addToHomeScreen")).toBe(true);
    }
  });

  it("the row goes once Telegram reports the icon added", async () => {
    fake?.uninstall();
    fake = fakeTelegram({ version: "8.0", answers: { homeScreenStatus: "missed" } });
    shown();
    await settle();
    expect(row("home")).not.toBeNull();

    act(() => fake?.emit("homeScreenAdded"));
    expect(row("home")).toBeNull();
  });
});
