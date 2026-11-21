import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/actions/run";

const state = vi.hoisted(() => ({
  updateSettings: vi.fn<(input: unknown) => Promise<ActionResult<unknown>>>(),
  sendCardSample: vi.fn<(input: unknown) => Promise<ActionResult<{ sent: boolean }>>>(),
}));
vi.mock("@/lib/api/browser", () => ({ bffFetch: () => new Promise(() => undefined) }));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn(), patchMe: vi.fn() }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: "ready", me: null }) }));
vi.mock("@/lib/actions/settings", () => ({
  updateSettings: (input: unknown) => state.updateSettings(input),
  sendCardSample: (input: unknown) => state.sendCardSample(input),
}));
vi.mock("@/lib/actions/useAction", () => ({ useAction: (action: (input: unknown) => unknown) => (input: unknown) => action(input) }));

import { setCardSample } from "@/features/settings/cardSample";
import { CardStylePage } from "@/features/settings/CardStylePage";
import { resetPresetSaves } from "@/features/settings/usePresetSave";
import { SETTINGS_KEY } from "@/features/settings/useSettings";
import { resetResources, seedResource } from "@/lib/data/useResource";
import { currentToast, dismissToast } from "@/lib/ui/toast";

import { deferred, settingsOf, withIntl } from "./harness";

let fake: FakeTelegram | null = null;
const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data, meta: { source: "stub" } });
const FAILED = { ok: false, error: "server", status: 500, method: "POST", path: "settings/card-sample" } as ActionResult<never>;
const settle = () => act(async () => undefined);
const option = (style: string) => document.querySelector<HTMLButtonElement>(`[data-card-style-option="${style}"]`)!;
const checked = () => [...document.querySelectorAll('[role="radio"][aria-checked="true"]')].map((node) => node.getAttribute("data-card-style-option"));
const sampleLine = () => document.querySelector("[data-card-sample]");
const sendButton = () => document.querySelector<HTMLButtonElement>('[data-action="card-sample"]')!;
const notified = () => (fake?.calls ?? []).filter((call) => call.member === "HapticFeedback.notificationOccurred").map((call) => call.args[0]);

beforeEach(() => {
  state.updateSettings.mockReset();
  state.sendCardSample.mockReset();
  resetResources();
  resetPresetSaves();
  setCardSample("idle");
  seedResource(SETTINGS_KEY, settingsOf());
  fake = fakeTelegram({ version: "8.0" });
});

afterEach(() => {
  cleanup();
  dismissToast("app");
  fake?.uninstall();
  fake = null;
});

describe("CardStylePage (WP-31, SCR-048, BR-APP-074)", () => {
  it("two options with their mocks, names and hints in a radio group, the current one checked, no «Новое» pill", () => {
    render(withIntl(<CardStylePage />));

    expect(screen.getByRole("radiogroup", { name: "Вид карточек" })).toBeTruthy();
    expect(checked()).toEqual(["classic"]);
    expect(option("classic").textContent).toContain("Классический");
    expect(option("classic").textContent).toContain("Фото и подпись");
    expect(option("rich").textContent).toContain("Новый");
    expect(document.querySelector('[data-card-preview="classic"]')?.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector('[data-card-preview="rich"] table')).not.toBeNull();
    expect(document.querySelector('[data-card-preview="classic"]')?.textContent).toContain("2-комн. квартира");
    expect(document.body.textContent).not.toContain("Новое");
  });

  it("an unknown card style checks «Классический»", () => {
    seedResource(SETTINGS_KEY, settingsOf({ card_style: "fancy" as never }));
    render(withIntl(<CardStylePage />));

    expect(checked()).toEqual(["classic"]);
  });

  it("a pick saves optimistically and the answer replaces it; the current style sends nothing", async () => {
    const save = deferred<ActionResult<unknown>>();
    state.updateSettings.mockReturnValueOnce(save.promise);
    render(withIntl(<CardStylePage />));

    fireEvent.click(option("classic"));
    expect(state.updateSettings).not.toHaveBeenCalled();

    fireEvent.click(option("rich"));
    expect(checked()).toEqual(["rich"]);
    expect(state.updateSettings).toHaveBeenCalledExactlyOnceWith({ card_style: "rich" });
    await act(async () => save.resolve(ok(settingsOf({ card_style: "rich" }))));
    expect(checked()).toEqual(["rich"]);
  });

  it("a failed save restores the style, with failed()", async () => {
    state.updateSettings.mockResolvedValueOnce(FAILED);
    render(withIntl(<CardStylePage />));

    fireEvent.click(option("rich"));
    await settle();

    expect(checked()).toEqual(["classic"]);
    expect(currentToast("app")?.message).toEqual({ key: "common.saveFailed" });
  });

  it.each([
    ["sent: true", ok({ sent: true }), "sent", "success"],
    ["sent: false", ok({ sent: false }), "failed", "warning"],
    ["a failure", FAILED, "failed", "warning"],
  ] as const)("«Прислать пример в чат», %s: the line and the haptic", async (_name, answer, line, haptic) => {
    const send = deferred<ActionResult<{ sent: boolean }>>();
    state.sendCardSample.mockReturnValueOnce(send.promise);
    render(withIntl(<CardStylePage />));

    fireEvent.click(sendButton());
    expect(sendButton().disabled).toBe(true);
    expect(sendButton().textContent).toBe("Отправляем пример в чат…");

    await act(async () => send.resolve(answer as ActionResult<{ sent: boolean }>));
    expect(sampleLine()?.getAttribute("data-card-sample")).toBe(line);
    expect(notified()).toEqual([haptic]);
    expect(sendButton().disabled).toBe(false);
    if (line === "sent") {
      expect(sampleLine()?.textContent).toBe("Пример — в чате с ботомЧтобы посмотреть, сверните приложение — смахните его вниз");
    } else {
      expect(sampleLine()?.textContent).toBe("Пример не отправился — вид всё равно сохранён");
    }
  });

  it("a pick while the sample is sending changes nothing; a later pick clears the result", async () => {
    const send = deferred<ActionResult<{ sent: boolean }>>();
    state.sendCardSample.mockReturnValueOnce(send.promise);
    state.updateSettings.mockResolvedValue(ok(settingsOf({ card_style: "rich" })));
    render(withIntl(<CardStylePage />));

    fireEvent.click(sendButton());
    fireEvent.click(option("rich"));
    expect(state.updateSettings).not.toHaveBeenCalled();
    expect(checked()).toEqual(["classic"]);

    await act(async () => send.resolve(ok({ sent: true })));
    expect(sampleLine()).not.toBeNull();
    fireEvent.click(option("rich"));
    await settle();
    expect(sampleLine()).toBeNull();
    expect(state.updateSettings).toHaveBeenCalledWith({ card_style: "rich" });
  });

  it("the result outlives the page: closed and opened again it still shows", async () => {
    state.sendCardSample.mockResolvedValueOnce(ok({ sent: true }));
    const view = render(withIntl(<CardStylePage />));
    fireEvent.click(sendButton());
    await settle();
    view.unmount();

    render(withIntl(<CardStylePage />));
    expect(sampleLine()?.getAttribute("data-card-sample")).toBe("sent");
  });
});

describe("CardStylePage: keyboard and a late answer (review of WP-31)", () => {
  it("the arrow keys move the choice; only the checked option takes the Tab stop", () => {
    state.updateSettings.mockResolvedValue(ok(settingsOf({ card_style: "rich" })));
    render(withIntl(<CardStylePage />));
    expect(option("classic").tabIndex).toBe(0);
    expect(option("rich").tabIndex).toBe(-1);

    option("classic").focus();
    fireEvent.keyDown(option("classic"), { key: "ArrowRight" });

    expect(checked()).toEqual(["rich"]);
    expect(document.activeElement).toBe(option("rich"));
    expect(option("rich").tabIndex).toBe(0);
    expect(state.updateSettings).toHaveBeenCalledWith({ card_style: "rich" });
  });

  it("an answer that arrives after the tab went is dropped: the next showing is idle and can ask again", async () => {
    const send = deferred<ActionResult<{ sent: boolean }>>();
    state.sendCardSample.mockReturnValueOnce(send.promise);
    const view = render(withIntl(<CardStylePage />));
    fireEvent.click(sendButton());
    view.unmount();
    // The settings tab unmounts: its screen resets the sample.
    setCardSample("idle");

    await act(async () => send.resolve(ok({ sent: true })));
    render(withIntl(<CardStylePage />));
    expect(sampleLine()).toBeNull();
    expect(sendButton().disabled).toBe(false);
    expect(notified()).toEqual([]);
  });

  it("while a sample is on its way an arrow changes nothing and keeps the focus on the checked option", () => {
    state.sendCardSample.mockReturnValueOnce(new Promise(() => undefined));
    render(withIntl(<CardStylePage />));
    fireEvent.click(sendButton());
    option("classic").focus();

    fireEvent.keyDown(option("classic"), { key: "ArrowRight" });

    expect(checked()).toEqual(["classic"]);
    expect(document.activeElement).toBe(option("classic"));
    expect(state.updateSettings).not.toHaveBeenCalled();
  });

  it("the result line is in a live region", () => {
    render(withIntl(<CardStylePage />));

    expect(document.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();
  });
});
