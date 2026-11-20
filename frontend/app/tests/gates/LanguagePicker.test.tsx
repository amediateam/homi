import { getMessages } from "@homi/i18n";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/actions/run";

const state = vi.hoisted(() => ({
  status: "ready" as string,
  language: "ru",
  patchMe: vi.fn(),
  updateSettings: vi.fn<(input: unknown, auth?: unknown, locale?: string) => Promise<ActionResult<unknown>>>(),
  impact: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: state.status, patchMe: state.patchMe }) }));
vi.mock("@/lib/actions/settings", () => ({ updateSettings: state.updateSettings }));
vi.mock("@/lib/telegram", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telegram")>()),
  tg: {
    languageCode: () => state.language,
    haptic: { impact: state.impact, success: state.success, error: state.error },
  },
}));

import Page from "@/app/[locale]/welcome/language/page";
import { publishBootRetry, resetBootRetry, setBootRetryHandler } from "@/features/gates/bootRetryStore";
import { gateState, resetGateState } from "@/features/gates/gateState";
import { LanguagePicker } from "@/features/gates/LanguagePicker";
import { EMPTY_REFERENCE } from "@/lib/reference/empty";
import type { Reference } from "@/lib/reference/types";
import { resetReference, setReference } from "@/lib/reference/useReference";
import { currentToast, dismissToast } from "@/lib/ui/toast";

import { withDevFlags } from "../helpers/flags";

/** The locales of the stub reference data (`default.ru.json`), in the server's order. */
const STUB_LOCALES: Reference["locales"] = [
  { code: "ru", name: "Русский" },
  { code: "uz", name: "Oʻzbekcha" },
  { code: "en", name: "English" },
];

const SAVED: ActionResult<unknown> = { ok: true, data: { locale: "en" }, meta: {} };
const REFUSED: ActionResult<unknown> = { ok: false, error: "server", status: 500, method: "PATCH", path: "settings" };

function withLocales(locales: unknown) {
  setReference({
    reference: { loaded: true, data: { ...EMPTY_REFERENCE, locales: locales as Reference["locales"] } },
    cities: { loaded: false, data: [] },
  });
}

function picker(props: Parameters<typeof LanguagePicker>[0] = {}) {
  return render(
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      <LanguagePicker {...props} />
    </NextIntlClientProvider>,
  );
}

const buttons = () => [...document.querySelectorAll<HTMLButtonElement>("button[data-locale]")];
const button = (code: string) => document.querySelector<HTMLButtonElement>(`button[data-locale="${code}"]`)!;
/** Disabled for the user: `aria-disabled`, while the element keeps its focus (`disabled` would drop it). */
const disabled = (element: HTMLButtonElement) => element.getAttribute("aria-disabled") === "true" && !element.disabled;
const enabled = (element: HTMLButtonElement) => element.getAttribute("aria-disabled") === "false" && !element.disabled;
/** The failure line under the list (LB-APP-027 fixed in `index-CIa0Ldj2.js`). */
const alertLine = () => document.querySelector<HTMLElement>('[data-slot="save-failed"][role="alert"]');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  state.status = "ready";
  state.language = "ru";
  state.updateSettings.mockReset();
  withLocales(STUB_LOCALES);
});

afterEach(() => {
  cleanup();
  resetReference();
  resetGateState();
  resetBootRetry();
  dismissToast("app");
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("LanguagePicker (SCR-004)", () => {
  it.each([
    ["ru", "ru", "Выберите язык", "Tilni tanlang · Choose a language", ["ru", "uz", "en"]],
    ["uz-UZ", "uz", "Tilni tanlang", "Выберите язык · Choose a language", ["uz", "ru", "en"]],
    ["en-US", "en", "Choose a language", "Выберите язык · Tilni tanlang", ["en", "ru", "uz"]],
    ["de", "ru", "Выберите язык", "Tilni tanlang · Choose a language", ["ru", "uz", "en"]],
  ])("Telegram %s: the heading in %s, the other two below, that language first", (language, locale, heading, subtitle, order) => {
    state.language = language;
    picker();

    const h1 = document.querySelector("h1")!;
    expect(h1.textContent).toBe(heading);
    expect(h1.lang).toBe(locale);
    expect(document.querySelector('[data-slot="subtitle"]')!.textContent).toBe(subtitle);
    expect(buttons().map((entry) => entry.dataset.locale)).toEqual(order);
    expect(document.querySelector("svg")).not.toBeNull();
  });

  it("renders inside the page's server-rendered root", () => {
    render(
      <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
        <Page />
      </NextIntlClientProvider>,
    );

    const main = document.querySelector('main[data-route="welcome/language"]')!;
    expect(main.querySelectorAll("button[data-locale]")).toHaveLength(3);
    expect(main.querySelectorAll("h1")).toHaveLength(1);
  });

  it("the buttons are a group named by the heading, which takes the focus when the picker shows", () => {
    state.status = "booting";
    const view = picker();
    expect(document.activeElement).toBe(document.body);

    state.status = "ready";
    view.rerender(
      <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
        <LanguagePicker />
      </NextIntlClientProvider>,
    );
    const h1 = document.querySelector("h1")!;
    const group = document.querySelector('[role="group"]')!;
    expect(document.activeElement).toBe(h1);
    expect(h1.tabIndex).toBe(-1);
    expect(group.getAttribute("aria-labelledby")).toBe(h1.id);
    expect(group.querySelectorAll("button[data-locale]")).toHaveLength(3);
    expect(buttons().every(enabled)).toBe(true);
  });

  it("names the locales with the server's strings and keeps the server's order after the first", () => {
    state.language = "uz";
    withLocales([STUB_LOCALES[2], STUB_LOCALES[0], STUB_LOCALES[1]]);
    picker();

    expect(buttons().map((entry) => entry.textContent)).toEqual(["Oʻzbekcha", "English", "Русский"]);
  });

  it("accent-colours the first button only", () => {
    state.language = "en";
    picker();

    expect(buttons().map((entry) => entry.dataset.variant)).toEqual(["primary", "secondary", "secondary"]);
  });

  it.each([
    ["an empty list", []],
    ["only locales the app does not know", [{ code: "kk", name: "Қазақша" }]],
    ["no list at all", undefined],
  ])("%s → the three known locales", (_, locales) => {
    state.language = "en-GB";
    withLocales(locales);
    picker();

    expect(buttons().map((entry) => [entry.dataset.locale, entry.textContent])).toEqual([
      ["en", "English"],
      ["ru", "Русский"],
      ["uz", "Oʻzbekcha"],
    ]);
  });

  it("leaves out a listed locale the app does not know", () => {
    withLocales([...STUB_LOCALES, { code: "kk", name: "Қазақша" }]);
    picker();

    expect(buttons().map((entry) => entry.dataset.locale)).toEqual(["ru", "uz", "en"]);
  });

  it("waits quietly while the session is not ready, and shows ErrorState after the boot retry gave up", () => {
    state.status = "booting";
    const retry = vi.fn();
    setBootRetryHandler(retry);
    picker();

    expect(buttons()).toHaveLength(0);
    expect(document.querySelector('[data-gate-wait][aria-busy="true"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="error-state"]')).toBeNull();

    act(() => publishBootRetry({ failed: true, kind: "offline", checking: false }));
    const error = document.querySelector('[data-slot="error-state"]')!;
    expect(error.textContent).toContain("Нет связи");
    fireEvent.click(error.querySelector("button")!);
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("LanguagePicker tap (D-S-6)", () => {
  it("disables every button while saving, the tapped one keeping the focus; a second tap is ignored", async () => {
    const answer = deferred<ActionResult<unknown>>();
    state.updateSettings.mockReturnValue(answer.promise);
    picker();

    button("en").focus();
    await act(async () => {
      fireEvent.click(button("en"));
      fireEvent.click(button("en"));
      fireEvent.click(button("uz"));
    });

    expect(buttons().every(disabled)).toBe(true);
    expect(document.activeElement).toBe(button("en"));
    expect(document.querySelector('[role="group"]')?.getAttribute("aria-busy")).toBe("true");
    expect(state.updateSettings).toHaveBeenCalledTimes(1);
    expect(state.updateSettings).toHaveBeenCalledWith({ locale: "en" }, undefined, "ru");
    expect(state.impact).toHaveBeenCalledExactlyOnceWith("medium");

    await act(async () => answer.resolve(SAVED));
  });

  it("on success marks the pick and patches me, and navigates nowhere itself", async () => {
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");
    const before = window.location.href;
    state.updateSettings.mockResolvedValue(SAVED);
    picker();

    await act(async () => {
      fireEvent.click(button("en"));
    });

    expect(gateState.localePicked).toBe(true);
    expect(state.patchMe).toHaveBeenCalledExactlyOnceWith({ locale: "en", locale_chosen: true });
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(window.location.href).toBe(before);
    // The gates replace the address; until then nothing can be tapped again.
    expect(buttons().every(disabled)).toBe(true);
    expect(state.error).not.toHaveBeenCalled();
  });

  it("on failure enables the buttons again with the error haptic and «Не получилось сохранить» under the list, no toast", async () => {
    state.updateSettings.mockResolvedValue(REFUSED);
    picker();
    expect(alertLine()).toBeNull();

    await act(async () => {
      fireEvent.click(button("uz"));
    });

    expect(buttons().every(enabled)).toBe(true);
    expect(document.querySelector('[role="group"]')?.hasAttribute("aria-busy")).toBe(false);
    expect(state.error).toHaveBeenCalledTimes(1);
    expect(currentToast()).toBeNull();
    expect(alertLine()?.textContent).toBe("Не получилось сохранить");
    expect(document.querySelector('[role="group"]')?.nextElementSibling).toBe(alertLine());
    expect(gateState.localePicked).toBe(false);
    expect(state.patchMe).not.toHaveBeenCalled();

    // The next tap clears the line before it saves; a success leaves none.
    const answer = deferred<ActionResult<unknown>>();
    state.updateSettings.mockReturnValue(answer.promise);
    await act(async () => {
      fireEvent.click(button("uz"));
    });
    expect(alertLine()).toBeNull();
    await act(async () => answer.resolve(SAVED));
    expect(state.updateSettings).toHaveBeenCalledTimes(2);
    expect(state.patchMe).toHaveBeenCalledExactlyOnceWith({ locale: "uz", locale_chosen: true });
    expect(alertLine()).toBeNull();
  });

  it("a second failure shows the line again; dev016ErrorToastOnFailure changes nothing here", async () => {
    state.updateSettings.mockResolvedValue(REFUSED);
    withDevFlags({ dev016ErrorToastOnFailure: false }, (flags) => picker({ flags }));

    await act(async () => {
      fireEvent.click(button("ru"));
    });
    await act(async () => {
      fireEvent.click(button("ru"));
    });

    expect(state.error).toHaveBeenCalledTimes(2);
    expect(currentToast()).toBeNull();
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(buttons().every(enabled)).toBe(true);
  });

  it("drops a result that arrives after the page was left", async () => {
    const answer = deferred<ActionResult<unknown>>();
    state.updateSettings.mockReturnValue(answer.promise);
    const view = picker();

    await act(async () => {
      fireEvent.click(button("en"));
    });
    view.unmount();
    await act(async () => answer.resolve(SAVED));

    expect(gateState.localePicked).toBe(false);
    expect(state.patchMe).not.toHaveBeenCalled();
  });
});
