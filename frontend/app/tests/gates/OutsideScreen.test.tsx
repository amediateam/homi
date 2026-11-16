import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ status: "outside" as string, prepared: true }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: state.status, prepared: state.prepared }) }));

import OutsidePage from "@/app/[locale]/outside/page";
import { publishBootRetry, resetBootRetry, setBootRetryHandler } from "@/features/gates/bootRetryStore";

function page(locale: Locale = "ru") {
  return render(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      <OutsidePage />
    </NextIntlClientProvider>,
  );
}

const root = () => document.querySelector('[data-route="outside"]');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetBootRetry();
  Object.assign(state, { status: "outside", prepared: true });
});

describe("the outside page (SCR-002)", () => {
  it.each([
    ["ru", "Откройте приложение через бота в Telegram."],
    ["uz", "Ilovani Telegram boti orqali oching."],
    ["en", "Open the app via the bot in Telegram."],
  ] as const)("%s: one sentence, no button, no link, no request", (locale: Locale, sentence) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    page(locale);

    expect(root()?.tagName).toBe("MAIN");
    expect(root()?.textContent).toBe(sentence);
    expect(root()?.querySelector('h1[data-screen="outside"]')?.textContent).toBe(sentence);
    expect(document.querySelectorAll("button, a, [role=button]")).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("the server and the hydration pass (a session not prepared yet) render the sentence", () => {
    Object.assign(state, { status: "booting", prepared: false });
    page();
    expect(root()?.textContent).toBe("Откройте приложение через бота в Telegram.");
  });
});

describe("the outside page with a late SDK (SCR-002, D-S-3)", () => {
  it("waits quietly while the session signs in: the user is inside Telegram after all", () => {
    Object.assign(state, { status: "booting", prepared: true });
    page();

    expect(document.querySelector('[data-screen="outside"]')).toBeNull();
    expect(root()?.querySelector('[data-gate-wait][aria-busy="true"]')).not.toBeNull();
    expect(root()?.textContent).toBe("");
  });

  it("shows ErrorState with «Повторить» after the sixth failed sign-in", () => {
    Object.assign(state, { status: "booting", prepared: true });
    const retry = vi.fn();
    setBootRetryHandler(retry);
    page();

    act(() => publishBootRetry({ failed: true, kind: "server", checking: false }));
    const error = root()!.querySelector('[data-slot="error-state"]')!;
    expect(error.getAttribute("data-kind")).toBe("server");
    expect(error.textContent).toContain("Не загрузилось");
    expect(document.querySelector('[data-screen="outside"]')).toBeNull();
    fireEvent.click(error.querySelector("button")!);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it.each(["ready", "denied"])("%s: still quiet until the gate leaves the page", (status) => {
    Object.assign(state, { status, prepared: true });
    page();
    expect(document.querySelector('[data-screen="outside"]')).toBeNull();
    expect(root()?.querySelector("[data-gate-wait]")).not.toBeNull();
  });
});
