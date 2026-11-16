import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { syntheticInitData } from "@homi/testing";
import { act, cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

import type { AccessReason } from "@/lib/session/types";

const state = vi.hoisted(() => ({ status: "denied", reason: "join" as unknown, bot: "homi_test_bot" }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: state.status, reason: state.reason }) }));
vi.mock("@/lib/brand", async (importOriginal) => {
  const { brand } = await importOriginal<typeof import("@/lib/brand")>();
  return {
    brand: {
      ...brand,
      get botUsername() {
        return state.bot;
      },
    },
  };
});

import NoAccessPage from "@/app/[locale]/no-access/page";
import { publishBootRetry, resetBootRetry, setBootRetryHandler } from "@/features/gates/bootRetryStore";
import { NoAccessScreen } from "@/features/gates/NoAccessScreen";
import { EMPTY_REFERENCE } from "@/lib/reference/empty";
import { resetReference, setReference } from "@/lib/reference/useReference";
import { ACCESS_REASONS } from "@/lib/session/types";
import { tg } from "@/lib/telegram";

/** The texts of the pinned release `index-DY_DH7h-.js` (SCR-003; `invite` and `full` without the beta since `index-Dbpp463V.js`). */
const TEXTS: Record<Locale, Record<AccessReason, [title: string, text: string]>> = {
  ru: {
    private: ["Бот приватный", "Приложение сейчас доступно только владельцу."],
    invite: ["Вход по приглашению", "Войти можно по ссылке-приглашению: откройте её и нажмите «Старт» в боте."],
    full: ["Мест пока нет", "Сейчас все места заняты. Попробуйте позже."],
    blocked: ["Нет доступа", "Доступ к приложению закрыт."],
    join: ["Сначала — бот", "Нажмите «Старт» в боте — после этого приложение откроется."],
  },
  uz: {
    private: ["Maxfiy bot", "Ilova hozir faqat egasi uchun ochiq."],
    invite: ["Taklif orqali kirish", "Kirish taklif havolasi orqali: uni oching va botda «Start»ni bosing."],
    full: ["Joy qolmadi", "Hozir joy qolmadi. Keyinroq urinib koʻring."],
    blocked: ["Ruxsat yoʻq", "Ilovaga kirish cheklangan."],
    join: ["Avval — bot", "Botda «Start»ni bosing — keyin ilova ochiladi."],
  },
  en: {
    private: ["This bot is private", "The app is available only to its owner for now."],
    invite: ["Invite only", "You can join with an invite link: open it and tap “Start” in the bot."],
    full: ["No spots yet", "All spots are taken right now. Please try again later."],
    blocked: ["No access", "Access to the app is closed."],
    join: ["Start with the bot", "Tap “Start” in the bot — then the app will open."],
  },
};

/** The checking line and the four button labels: post, «Перейти в бота», «Вернуться в бот», support. */
const LINES: Record<Locale, { checking: string; post: string; toBot: string; back: string; support: string }> = {
  ru: {
    checking: "Только что нажали «Старт»? Подождите пару секунд — проверяем доступ…",
    post: "📢 Открыть пост в канале",
    toBot: "Перейти в бота",
    back: "Вернуться в бот",
    support: "Написать в поддержку",
  },
  uz: {
    checking: "Hozirgina «Start»ni bosdingizmi? Bir necha soniya kuting — kirishni tekshiryapmiz…",
    post: "📢 Postni kanalda ochish",
    toBot: "Botga oʻtish",
    back: "Botga qaytish",
    support: "Yordamga yozish",
  },
  en: {
    checking: "Just tapped “Start”? Give it a couple of seconds — checking access…",
    post: "📢 Open the post in the channel",
    toBot: "Go to the bot",
    back: "Back to the bot",
    support: "Contact support",
  },
};

const LOCALES = ["ru", "uz", "en"] as const satisfies readonly Locale[];
const BETA = /бета|beta/iu;

function inLocale(locale: Locale, children: ReactNode) {
  return (
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      {children}
    </NextIntlClientProvider>
  );
}

/** Launches with `startParam` (none: from the menu) and a support account of the reference data, then renders. */
function show({ locale = "ru", startParam, support = null }: { locale?: Locale; startParam?: string; support?: string | null } = {}) {
  vi.spyOn(tg, "initData").mockReturnValue(syntheticInitData({}, { startParam }));
  setReference({
    reference: { loaded: true, data: { ...EMPTY_REFERENCE, bot: { username: null, support_username: support } } },
    cities: { loaded: false, data: [] },
  });
  return render(inLocale(locale, <NoAccessScreen />));
}

const screenEl = () => document.querySelector('[data-screen="no-access"]');
const buttons = () => [...document.querySelectorAll<HTMLButtonElement>("[data-action]")];
const actions = () => buttons().map((button) => button.dataset.action);
const button = (action: string) => document.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
const checkingLine = () => document.querySelector("[data-checking]");

/** Every string the page shows: its text and the value of every attribute. */
function renderedStrings(): string[] {
  const elements = [...document.body.querySelectorAll("*")];
  return [document.body.textContent ?? "", ...elements.flatMap((element) => [...element.attributes].map((attribute) => attribute.value))];
}

let openLink: MockInstance<typeof tg.openLink>;
let close: MockInstance<typeof tg.close>;
let impact: MockInstance<typeof tg.haptic.impact>;
const fetchSpy = vi.fn();

beforeEach(() => {
  openLink = vi.spyOn(tg, "openLink").mockReturnValue(true);
  close = vi.spyOn(tg, "close").mockImplementation(() => undefined);
  impact = vi.spyOn(tg.haptic, "impact").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fetchSpy.mockReset();
  resetReference();
  resetBootRetry();
  Object.assign(state, { status: "denied", reason: "join", bot: "homi_test_bot" });
});

describe("NoAccessScreen: the refusal (SCR-003)", () => {
  for (const locale of LOCALES) {
    it.each(ACCESS_REASONS)(`%s in ${locale}: the Lock icon, the pinned title and text, no beta anywhere`, (reason) => {
      state.reason = reason;
      publishBootRetry({ failed: false, kind: null, checking: true });
      show({ locale, startParam: "l_123-seo-chan-45", support: "homi_support" });

      const [title, text] = TEXTS[locale][reason];
      expect(screenEl()?.getAttribute("data-reason")).toBe(reason);
      expect(screenEl()?.querySelector("svg.lucide-lock")).not.toBeNull();
      expect(screenEl()?.querySelector("h1")?.textContent).toBe(title);
      expect(screenEl()?.querySelector("h1 + p")?.textContent).toBe(text);
      expect(buttons().map((element) => element.textContent)).toEqual(
        reason === "blocked"
          ? [LINES[locale].post, LINES[locale].back, LINES[locale].support]
          : [LINES[locale].post, LINES[locale].toBot, LINES[locale].support],
      );
      expect(checkingLine()?.textContent ?? null).toBe(reason === "blocked" ? null : LINES[locale].checking);
      expect(renderedStrings().filter((value) => BETA.test(value))).toEqual([]);
    });
  }

  it.each(LOCALES)("no catalogue value of the screen mentions a beta in %s", (locale) => {
    const messages = getMessages(locale);
    const values = [...Object.values(messages.noAccess.title), ...Object.values(messages.noAccess.text)];
    values.push(messages.noAccess.checking, messages.noAccess.openPost, messages.noAccess.toBot, messages.noAccess.back);
    values.push(messages.settings.support);
    expect(values.filter((value) => BETA.test(value))).toEqual([]);
  });

  it("an unknown reason shows the private pair", () => {
    state.reason = "beta";
    show();
    expect(screenEl()?.getAttribute("data-reason")).toBe("private");
    expect(screenEl()?.querySelector("h1")?.textContent).toBe(TEXTS.ru.private[0]);
  });

  it("trusts the session, not the reason in the address", () => {
    window.history.replaceState(null, "", "/ru/no-access?reason=blocked");
    state.reason = "join";
    show({ startParam: "l_123" });
    expect(screenEl()?.getAttribute("data-reason")).toBe("join");
    expect(actions()).toEqual(["toBot"]);
    window.history.replaceState(null, "", "/");
  });
});

describe("NoAccessScreen: the rows", () => {
  it("the support row is absent without a support account, and nothing spins", () => {
    show({ startParam: "l_123" });
    expect(actions()).toEqual(["toBot"]);
    expect(document.querySelector('[data-slot="spinner"], [aria-busy="true"]')).toBeNull();
  });

  it("the post row shows only for a channel-and-post start parameter, first and accented", () => {
    show({ startParam: "l_123-web" });
    expect(actions()).toEqual(["toBot"]);
    cleanup();

    show({ startParam: "l_123-homi_rent-7" });
    expect(actions()).toEqual(["post", "toBot"]);
    expect(buttons().map((element) => element.dataset.variant)).toEqual(["primary", "secondary"]);
  });

  it("«Перейти в бота» opens the bot with the launch's source and listing, with a medium haptic", () => {
    show({ startParam: "l_123-web" });
    act(() => button("toBot").click());
    expect(openLink).toHaveBeenCalledExactlyOnceWith("https://t.me/homi_test_bot?start=s_web--l123");
    expect(impact).toHaveBeenCalledExactlyOnceWith("medium");
    expect(close).not.toHaveBeenCalled();
  });

  it("l_123 carries s_share--l123", () => {
    show({ startParam: "l_123" });
    act(() => button("toBot").click());
    expect(openLink).toHaveBeenCalledExactlyOnceWith("https://t.me/homi_test_bot?start=s_share--l123");
  });

  it.each([
    ["no start parameter", undefined, "join", "homi_test_bot"],
    ["no bot name", "l_123-web", "join", ""],
    ["blocked", "l_123-web", "blocked", "homi_test_bot"],
  ])("with %s the main button is «Вернуться в бот» and closes the app", (_, startParam, reason, botName) => {
    state.reason = reason;
    state.bot = botName;
    show({ startParam });
    expect(button("back").textContent).toBe(LINES.ru.back);
    act(() => button("back").click());
    expect(close).toHaveBeenCalledOnce();
    expect(openLink).not.toHaveBeenCalled();
    expect(impact).toHaveBeenCalledExactlyOnceWith("light");
  });

  it("the post and support rows open their links through tg.openLink", () => {
    show({ startParam: "l_123-seo-chan-45", support: "homi_support" });
    act(() => button("post").click());
    act(() => button("support").click());
    expect(openLink.mock.calls).toEqual([["https://t.me/chan/45"], ["https://t.me/homi_support"]]);
    expect(impact.mock.calls).toEqual([["light"], ["light"]]);
  });

  it("sends no request", () => {
    show({ startParam: "l_123-seo-chan-45", support: "homi_support" });
    for (const element of buttons()) {
      act(() => element.click());
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("NoAccessScreen: the checking line", () => {
  it("shows while a re-check is pending and the buttons stay enabled", () => {
    show({ startParam: "l_123" });
    expect(checkingLine()).toBeNull();

    act(() => publishBootRetry({ failed: false, kind: null, checking: true }));
    expect(checkingLine()?.textContent).toBe(LINES.ru.checking);
    expect(buttons().every((element) => !element.disabled)).toBe(true);

    act(() => publishBootRetry({ failed: false, kind: null, checking: false }));
    expect(checkingLine()).toBeNull();
  });

  it("never shows for blocked", () => {
    state.reason = "blocked";
    publishBootRetry({ failed: false, kind: null, checking: true });
    show();
    expect(checkingLine()).toBeNull();
  });
});

describe("NoAccessScreen: before and after the refusal", () => {
  it.each(["booting", "ready", "outside"])("%s: a quiet page, no reason and no button", (status) => {
    state.status = status;
    show({ startParam: "l_123" });
    expect(screenEl()).toBeNull();
    expect(document.querySelector('[data-gate-wait][aria-busy="true"]')).not.toBeNull();
    expect(document.querySelectorAll("button, h1")).toHaveLength(0);
  });

  it.each([
    ["offline", "Нет связи"],
    ["server", "Не загрузилось"],
  ] as const)("after the sixth failed sign-in (%s): ErrorState, whose «Повторить» retries the boot", (kind, title) => {
    const retry = vi.fn();
    setBootRetryHandler(retry);
    state.status = "booting";
    publishBootRetry({ failed: true, kind, checking: false });
    show();

    const error = document.querySelector('[data-slot="error-state"]');
    expect(error?.getAttribute("data-kind")).toBe(kind);
    expect(error?.textContent).toContain(title);
    expect(screenEl()).toBeNull();
    act(() => error!.querySelector("button")!.click());
    expect(retry).toHaveBeenCalledOnce();
  });

  it("the title takes the focus when the refusal shows, and not again when only the reason changes", () => {
    state.status = "booting";
    const view = show({ startParam: "l_123" });
    expect(document.activeElement).toBe(document.body);

    state.status = "denied";
    view.rerender(inLocale("ru", <NoAccessScreen />));
    const title = screenEl()!.querySelector("h1")!;
    expect(document.activeElement).toBe(title);
    expect(title.tabIndex).toBe(-1);

    title.blur();
    state.reason = "full";
    view.rerender(inLocale("ru", <NoAccessScreen />));
    expect(screenEl()?.getAttribute("data-reason")).toBe("full");
    expect(document.activeElement).toBe(document.body);
  });

  it("the page's root names the route", () => {
    vi.spyOn(tg, "initData").mockReturnValue(syntheticInitData({}, { startParam: "l_123" }));
    render(inLocale("ru", <NoAccessPage />));
    const root = document.querySelector('[data-route="no-access"]');
    expect(root?.tagName).toBe("MAIN");
    expect(root?.querySelector('[data-screen="no-access"]')).not.toBeNull();
  });
});
