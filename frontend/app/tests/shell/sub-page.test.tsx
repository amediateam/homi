import { SWIPE_BACK_SETTLE_MS } from "@homi/ui";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { getMessages } from "@homi/i18n";
import { act, cleanup, render as renderPage, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ back: vi.fn() }));
vi.mock("@/lib/navigation/useBack", () => ({ useBack: () => ({ canGoBack: true, back: state.back }) }));

import { SubPage } from "@/features/shell/SubPage";
import { toastPlacement } from "@/lib/ui/shellState";

import { ANDROID_USER_AGENT, swipeRight } from "../helpers/gestures";

/** The fallback cross (WP-36) names itself from the catalogue. */
function Intl({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      {children}
    </NextIntlClientProvider>
  );
}

const render = (ui: ReactNode) => renderPage(ui, { wrapper: Intl });

let fake: FakeTelegram | null = null;
const haptics = () =>
  (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);

beforeEach(() => {
  state.back.mockReset();
  fake = fakeTelegram({ version: "8.0" });
  vi.useFakeTimers();
  vi.stubGlobal("innerWidth", 300);
});

afterEach(() => {
  cleanup();
  fake?.uninstall();
  fake = null;
  vi.useRealTimers();
});

const page = () => document.querySelector<HTMLElement>('[data-slot="subpage"]')!;

describe("SubPage", () => {
  it("puts the app's toast 16 px above the bottom inset while it is mounted (SCR-042)", () => {
    expect(toastPlacement()).toBe("tabbar");
    const { unmount } = render(<SubPage title="Тема" />);
    expect(toastPlacement()).toBe("subpage");
    unmount();
    expect(toastPlacement()).toBe("tabbar");
  });

  it("passes the title, the hint and bare through to the frame", () => {
    const { rerender } = render(
      <SubPage title="Тема" hint="Как в Telegram">
        <p>Rows</p>
      </SubPage>,
    );
    expect(screen.getByRole("heading", { name: "Тема" })).toBeTruthy();
    expect(screen.getByText("Как в Telegram")).toBeTruthy();
    expect(document.querySelector('[data-slot="subpage-card"]')).not.toBeNull();

    rerender(
      <SubPage title="Тема" bare>
        <p>Rows</p>
      </SubPage>,
    );
    expect(document.querySelector('[data-slot="subpage-card"]')).toBeNull();
    expect(screen.getByText("Rows")).toBeTruthy();
  });

  it("a swipe back closes it through back() once, after a light impact and the slide", () => {
    render(<SubPage title="Тема" />);

    swipeRight(page(), 150);
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
    expect(state.back).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS));
    expect(state.back).toHaveBeenCalledTimes(1);
  });

  it("has no swipe back on Android (TMA-041)", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ANDROID_USER_AGENT);
    render(<SubPage title="Тема" />);

    swipeRight(page(), 150);
    act(() => vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS));
    expect(page().style.transform).toBe("");
    expect(state.back).not.toHaveBeenCalled();
    expect(haptics()).toEqual([]);
  });

  it("carries no cross of its own while the Telegram SDK is there (its BackButton closes it)", () => {
    render(<SubPage title="Тема" />);
    expect(document.querySelector("[data-fallback-close]")).toBeNull();
  });

  it("without the SDK the header carries the cross «Закрыть», which closes it as Back does (WP-36, TMA-047)", () => {
    fake?.uninstall();
    fake = null;
    render(<SubPage title="Тема" />);

    const cross = screen.getByRole("button", { name: "Закрыть" });
    expect(cross.closest('[data-slot="subpage-header"]')).not.toBeNull();
    act(() => cross.click());

    expect(state.back).toHaveBeenCalledTimes(1);
  });
});
