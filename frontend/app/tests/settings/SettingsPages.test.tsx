import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/actions/run";
import type { ApiResult } from "@/lib/api/types";

const state = vi.hoisted(() => ({
  answers: new Map<string, ApiResult<unknown>>(),
  sent: [] as string[],
  session: { status: "ready", me: { currency: "USD" } } as Record<string, unknown>,
  updateSettings: vi.fn<(input: unknown) => Promise<ActionResult<unknown>>>(),
  patchMe: vi.fn<(change: unknown) => void>(),
  refresh: vi.fn<() => void>(),
}));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string) => {
    state.sent.push(path);
    const answer = state.answers.get(path);
    return answer === undefined ? new Promise(() => undefined) : Promise.resolve(answer);
  },
}));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn(), patchMe: (change: unknown) => state.patchMe(change) }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => state.session }));
vi.mock("@/lib/actions/settings", () => ({ updateSettings: (input: unknown) => state.updateSettings(input), sendCardSample: vi.fn() }));
vi.mock("@/lib/actions/useAction", () => ({ useAction: (action: (input: unknown) => unknown) => (input: unknown) => action(input) }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh: () => state.refresh(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));

import { bumpFeedEpoch, feedEpoch } from "@/features/feed/feedQuery";
import { resetProfileChange } from "@/features/settings/applyProfileChange";
import { CurrencyPage } from "@/features/settings/CurrencyPage";
import { DigestHint, DigestPage } from "@/features/settings/DigestPage";
import { GraphicsPage } from "@/features/settings/GraphicsPage";
import { LanguagePage } from "@/features/settings/LanguagePage";
import { QuietHoursPage } from "@/features/settings/QuietHoursPage";
import { ThemePage } from "@/features/settings/ThemePage";
import { SETTINGS_KEY } from "@/features/settings/useSettings";
import { readResource, resetResources, seedResource } from "@/lib/data/useResource";
import { resetReference } from "@/lib/reference/useReference";
import { currentToast, dismissToast } from "@/lib/ui/toast";

import { withDevFlags } from "../helpers/flags";
import { feedReference } from "../helpers/reference";
import { deferred, settingsOf, withIntl } from "./harness";

let fake: FakeTelegram | null = null;
const ok = (data: unknown): ActionResult<unknown> => ({ ok: true, data, meta: { source: "stub" } });
const FAILED: ActionResult<unknown> = { ok: false, error: "server", status: 500, method: "PATCH", path: "settings" } as ActionResult<unknown>;
const settle = () => act(async () => undefined);
const radios = () => screen.getAllByRole("radio");
const checked = () => radios().filter((radio) => radio.getAttribute("aria-checked") === "true").map((radio) => radio.textContent);
const pick = (name: string) => fireEvent.click(screen.getByRole("radio", { name }));
const impacts = () => (fake?.calls ?? []).filter((call) => call.member === "HapticFeedback.impactOccurred").length;

beforeEach(() => {
  state.answers.clear();
  state.sent.length = 0;
  state.session = { status: "ready", me: { currency: "USD" } };
  state.updateSettings.mockReset();
  state.patchMe.mockReset();
  state.refresh.mockReset();
  resetResources();
  resetProfileChange();
  window.localStorage.clear();
  document.documentElement.classList.remove("lite");
  fake = fakeTelegram({ version: "8.0" });
  feedReference({ reference: { radars_enabled: true } });
  seedResource(SETTINGS_KEY, settingsOf());
});

afterEach(() => {
  cleanup();
  dismissToast("app");
  fake?.uninstall();
  fake = null;
  resetReference();
});

describe("ThemePage (WP-31, SCR-033)", () => {
  it("a pick re-colours at once, before the save answers; the current one sends nothing", async () => {
    const save = deferred<ActionResult<unknown>>();
    state.updateSettings.mockReturnValueOnce(save.promise);
    render(withIntl(<ThemePage />));
    expect(checked()).toEqual(["Как в Telegram"]);

    pick("Как в Telegram");
    expect(state.updateSettings).not.toHaveBeenCalled();

    pick("Тёмная");
    expect(window.localStorage.getItem("homi-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(checked()).toEqual(["Тёмная"]);
    expect(state.updateSettings).toHaveBeenCalledWith({ theme: "dark" });
    expect(impacts()).toBe(1);

    await act(async () => save.resolve(ok(settingsOf({ theme: "dark" }))));
    expect(checked()).toEqual(["Тёмная"]);
  });

  it.each([true, false])("a failed save puts the previous theme back; dev016ErrorToastOnFailure %s", async (flag) => {
    await withDevFlags({ dev016ErrorToastOnFailure: flag }, async (flags) => {
      state.updateSettings.mockResolvedValueOnce(FAILED);
      render(withIntl(<ThemePage flags={flags} />));

      pick("Светлая");
      await settle();

      expect(checked()).toEqual(["Как в Telegram"]);
      expect(window.localStorage.getItem("homi-theme")).toBe("auto");
      expect(fake?.calls.some((call) => call.member === "HapticFeedback.notificationOccurred" && call.args[0] === "error")).toBe(true);
      expect(currentToast("app")?.message ?? null).toEqual(flag ? { key: "common.saveFailed" } : null);
    });
  });

  it("two quick picks end on the last; only the failure of the latest restores", async () => {
    const first = deferred<ActionResult<unknown>>();
    const second = deferred<ActionResult<unknown>>();
    state.updateSettings.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(withIntl(<ThemePage />));

    pick("Светлая");
    pick("Тёмная");
    await act(async () => first.resolve(FAILED));
    expect(checked()).toEqual(["Тёмная"]);

    await act(async () => second.resolve(ok(settingsOf({ theme: "dark" }))));
    expect(checked()).toEqual(["Тёмная"]);
    expect(window.localStorage.getItem("homi-theme")).toBe("dark");
  });
});

describe("ThemePage: answers out of order (review of WP-31)", () => {
  it("an older success after a newer one is not the theme a later failure restores", async () => {
    const first = deferred<ActionResult<unknown>>();
    const second = deferred<ActionResult<unknown>>();
    const third = deferred<ActionResult<unknown>>();
    state.updateSettings.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise);
    render(withIntl(<ThemePage />));

    pick("Светлая");
    pick("Тёмная");
    pick("Как в Telegram");
    await act(async () => second.resolve(ok(settingsOf({ theme: "dark" }))));
    await act(async () => first.resolve(ok(settingsOf({ theme: "light" }))));
    await act(async () => third.resolve(FAILED));

    expect(checked()).toEqual(["Тёмная"]);
  });
});

describe("GraphicsPage (WP-31, SCR-034)", () => {
  it("each mode writes or clears the storage and switches html.lite at once, with no request", () => {
    render(withIntl(<GraphicsPage />));
    expect(checked()).toEqual(["Авто · полная"]);

    pick("Облегчённая");
    expect(window.localStorage.getItem("homi-graphics")).toBe("lite");
    expect(document.documentElement.classList.contains("lite")).toBe(true);

    pick("Полная");
    expect(window.localStorage.getItem("homi-graphics")).toBe("full");
    expect(document.documentElement.classList.contains("lite")).toBe(false);

    window.localStorage.setItem("homi-graphics-measured", "lite");
    pick("Авто · полная");
    expect(window.localStorage.getItem("homi-graphics")).toBeNull();
    expect(window.localStorage.getItem("homi-graphics-measured")).toBeNull();
    expect(state.updateSettings).not.toHaveBeenCalled();
    expect(state.sent).toEqual([]);
  });

  it("the auto label says what auto chooses now", () => {
    window.localStorage.setItem("homi-graphics", "full");
    window.localStorage.setItem("homi-graphics-measured", "lite");
    render(withIntl(<GraphicsPage />));

    expect(radios().map((radio) => radio.textContent)).toEqual(["Авто · облегчённая", "Полная", "Облегчённая"]);
  });
});

describe("LanguagePage and CurrencyPage (WP-31, SCR-035, SCR-036)", () => {
  it("language: rows disabled while saving and the check stays; on success the profile takes it, and once the address carries it everything reads again", async () => {
    const save = deferred<ActionResult<unknown>>();
    state.updateSettings.mockReturnValueOnce(save.promise);
    document.documentElement.lang = "ru";
    render(withIntl(<LanguagePage />));
    expect(checked()).toEqual(["Русский"]);

    pick("English");
    expect(state.updateSettings).toHaveBeenCalledWith({ locale: "en" });
    expect(radios().every((radio) => radio.hasAttribute("disabled") || radio.getAttribute("data-disabled") !== null)).toBe(true);
    expect(checked()).toEqual(["Русский"]);

    const epoch = feedEpoch();
    await act(async () => save.resolve(ok(settingsOf({ locale: "en" }))));
    expect(state.patchMe).toHaveBeenCalledExactlyOnceWith({ locale: "en" });
    // The locale guard switches the address; nothing reads again before the page carries the new locale.
    expect(feedEpoch()).toBe(epoch);
    expect(readResource(SETTINGS_KEY)).toBeDefined();

    // The locale guard's navigation renders the new segment; the document's `lang` follows it.
    await act(async () => {
      document.documentElement.lang = "en";
    });
    expect(feedEpoch()).toBe(epoch + 1);
    // The page still reads the settings: they are asked again, in the new language.
    expect(state.sent).toEqual(["settings"]);
  });

  it("language: a failure changes nothing, with failed(); uz is sent as uz", async () => {
    state.updateSettings.mockResolvedValueOnce(FAILED);
    render(withIntl(<LanguagePage />));

    pick("Oʻzbekcha");
    await settle();

    expect(state.updateSettings).toHaveBeenCalledWith({ locale: "uz" });
    expect(state.patchMe).not.toHaveBeenCalled();
    expect(checked()).toEqual(["Русский"]);
    expect(radios().some((radio) => radio.hasAttribute("disabled"))).toBe(false);
    expect(currentToast("app")?.message).toEqual({ key: "common.saveFailed" });
  });

  it("currency: disabled while saving; on success the profile, the server parts and every read follow; a failure changes nothing", async () => {
    const save = deferred<ActionResult<unknown>>();
    state.updateSettings.mockReturnValueOnce(save.promise);
    const view = render(withIntl(<CurrencyPage />));
    expect(checked()).toEqual(["Доллары"]);

    pick("Сумы");
    expect(state.updateSettings).toHaveBeenCalledWith({ currency: "UZS" });
    expect(radios().every((radio) => radio.hasAttribute("disabled"))).toBe(true);
    const epoch = feedEpoch();

    await act(async () => save.resolve(ok(settingsOf({ currency: "UZS" }))));
    expect(state.patchMe).toHaveBeenCalledExactlyOnceWith({ currency: "UZS" });
    expect(state.refresh).toHaveBeenCalledTimes(1);
    expect(feedEpoch()).toBe(epoch + 1);
    view.unmount();

    state.session = { status: "ready", me: { currency: "UZS" } };
    state.updateSettings.mockResolvedValueOnce(FAILED);
    render(withIntl(<CurrencyPage />));
    expect(checked()).toEqual(["Сумы"]);
    pick("Доллары");
    await settle();
    expect(state.patchMe).toHaveBeenCalledTimes(1);
    expect(checked()).toEqual(["Сумы"]);
  });
});

describe("QuietHoursPage and DigestPage (WP-31, SCR-037, SCR-038)", () => {
  it("quiet hours: the presets, a pick checks at once and the answer replaces the settings", async () => {
    const save = deferred<ActionResult<unknown>>();
    state.updateSettings.mockReturnValueOnce(save.promise);
    render(withIntl(<QuietHoursPage />));
    expect(radios().map((radio) => radio.textContent)).toEqual(["Выкл", "22–08", "23–08", "00–09", "23–07"]);
    expect(checked()).toEqual(["23–08"]);

    pick("Выкл");
    expect(checked()).toEqual(["Выкл"]);
    expect(state.updateSettings).toHaveBeenCalledWith({ quiet_hours: null });
    expect(impacts()).toBe(1);

    await act(async () => save.resolve(ok(settingsOf({ quiet_hours: { from: 0, to: 9 } }))));
    expect(checked()).toEqual(["00–09"]);
  });

  it("quiet hours: a failure restores the settings with failed(); a value in no preset checks none", async () => {
    state.updateSettings.mockResolvedValueOnce(FAILED);
    render(withIntl(<QuietHoursPage />));

    pick("22–08");
    await settle();
    expect(checked()).toEqual(["23–08"]);
    expect(currentToast("app")?.message).toEqual({ key: "common.saveFailed" });
    cleanup();

    seedResource(SETTINGS_KEY, settingsOf({ quiet_hours: { from: 21, to: 6 } }));
    render(withIntl(<QuietHoursPage />));
    expect(checked()).toEqual([]);
  });

  it("a later answer wins, and a failed earlier request does not undo a later success", async () => {
    const first = deferred<ActionResult<unknown>>();
    const second = deferred<ActionResult<unknown>>();
    state.updateSettings.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(withIntl(<DigestPage />));
    expect(checked()).toEqual(["9 и 19"]);

    pick("9");
    pick("12 и 20");
    await act(async () => second.resolve(ok(settingsOf({ digest_hours: [12, 20] }))));
    expect(checked()).toEqual(["12 и 20"]);
    await act(async () => first.resolve(FAILED));
    expect(checked()).toEqual(["12 и 20"]);
    expect(currentToast("app")).toBeNull();
  });

  it("an earlier success that arrives after the latest save settled is not what a later failure restores", async () => {
    const first = deferred<ActionResult<unknown>>();
    const second = deferred<ActionResult<unknown>>();
    state.updateSettings.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockResolvedValueOnce(FAILED);
    render(withIntl(<DigestPage />));

    pick("9");
    pick("12 и 20");
    await act(async () => second.resolve(ok(settingsOf({ digest_hours: [12, 20] }))));
    await act(async () => first.resolve(ok(settingsOf({ digest_hours: [9] }))));
    pick("19");
    await settle();

    expect(checked()).toEqual(["12 и 20"]);
  });

  it("the newest success is what a failure restores, also one that arrives after the latest failed (the server takes saves in order)", async () => {
    const first = deferred<ActionResult<unknown>>();
    const third = deferred<ActionResult<unknown>>();
    state.updateSettings.mockReturnValueOnce(first.promise).mockResolvedValueOnce(FAILED).mockReturnValueOnce(third.promise);
    render(withIntl(<DigestPage />));
    const start = checked();

    pick("9");
    pick("12 и 20");
    await settle();
    expect(checked()).toEqual(start);

    pick("19");
    await act(async () => first.resolve(ok(settingsOf({ digest_hours: [9] }))));
    expect(checked()).toEqual(["19"]);
    await act(async () => third.resolve(FAILED));
    expect(checked()).toEqual(["9"]);
  });

  it("an earlier success that arrives after the latest failed, with nothing pending, is shown", async () => {
    const first = deferred<ActionResult<unknown>>();
    state.updateSettings.mockReturnValueOnce(first.promise).mockResolvedValueOnce(FAILED);
    render(withIntl(<DigestPage />));

    pick("9");
    pick("12 и 20");
    await settle();
    await act(async () => first.resolve(ok(settingsOf({ digest_hours: [9] }))));

    expect(checked()).toEqual(["9"]);
  });

  it("an empty preset list renders nothing but the page's hint", () => {
    seedResource(SETTINGS_KEY, settingsOf({ options: { ...settingsOf().options, digest_hours: [], quiet_hours: [] } }));
    const view = render(withIntl(<DigestPage />));
    expect(view.container.querySelectorAll('[role="radio"]')).toHaveLength(0);
  });

  it("the digest hint: what the hours are for with an active digest radar, else how to switch one; none read while radars are off", async () => {
    state.answers.set("radars", { ok: true, data: [{ id: "01JD0000000000000000000001", active: true, mode: "digest", filters: {} }], meta: { source: "stub" } });
    const view = render(withIntl(<DigestHint />));
    await settle();
    expect(view.container.textContent).toBe("Во сколько присылать новое от радаров в режиме «Подборкой». Время — ташкентское.");
    cleanup();
    resetResources();

    state.answers.set("radars", { ok: true, data: [{ id: "01JD0000000000000000000001", active: true, mode: "instant", filters: {} }], meta: { source: "stub" } });
    const second = render(withIntl(<DigestHint />));
    await settle();
    expect(second.container.textContent).toMatch(/^Для радаров в режиме «Подборкой»/);
    cleanup();
    resetResources();

    feedReference({ reference: { radars_enabled: false } });
    state.sent.length = 0;
    const off = render(withIntl(<DigestHint />));
    await settle();
    expect(off.container.textContent).toMatch(/^Для радаров в режиме «Подборкой»/);
    expect(state.sent).not.toContain("radars");
  });
});

void bumpFeedEpoch;
