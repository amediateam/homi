import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { fakeTelegram, syntheticInitData, type FakeTelegram } from "@homi/testing";
import { act, cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ status: "ready" }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: state.status }) }));

import { SessionExpired } from "@/features/gates/SessionExpired";
import { SessionExpiredScreen } from "@/features/gates/SessionExpiredScreen";

let fake: FakeTelegram | null = null;

function inLocale(locale: Locale, children: React.ReactNode) {
  return (
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      {children}
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  cleanup();
  fake?.uninstall();
  fake = null;
  state.status = "ready";
  vi.unstubAllGlobals();
});

describe("SessionExpiredScreen (LB-APP-047, `03` §1.6)", () => {
  it.each([
    ["ru", "Сессия устарела — закройте и откройте приложение снова", "Закрыть"],
    ["uz", "Seans eskirdi — ilovani yopib, qayta oching", "Yopish"],
    ["en", "The session has expired — close the app and open it again", "Close"],
  ] as const)("%s: the text and a single action, «Закрыть»", (locale, text, close) => {
    render(inLocale(locale, <SessionExpiredScreen />));
    const screen = document.querySelector('[data-screen="session-expired"]')!;
    expect(screen.querySelector("h1")?.textContent).toBe(text);
    const buttons = screen.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe(close);
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("«Закрыть» closes the Mini App and sends no request", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    fake = fakeTelegram({ initData: syntheticInitData({}) });
    render(inLocale("ru", <SessionExpiredScreen />));

    act(() => document.querySelector("button")!.click());
    expect(fake.closed).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("SessionExpired (D-S-14)", () => {
  it("renders the route until the session expires, then the screen in its place", () => {
    const tree = () => inLocale("ru", <SessionExpired>{<section data-part="page" />}</SessionExpired>);
    const view = render(tree());
    expect(document.querySelector('[data-part="page"]')).not.toBeNull();
    expect(document.querySelector('[data-screen="session-expired"]')).toBeNull();

    state.status = "expired";
    view.rerender(tree());
    expect(document.querySelector('[data-part="page"]')).toBeNull();
    expect(document.querySelector('[data-screen="session-expired"]')).not.toBeNull();
  });
});
