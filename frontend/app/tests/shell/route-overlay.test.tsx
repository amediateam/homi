import { getMessages } from "@homi/i18n";
import { SWIPE_BACK_SETTLE_MS } from "@homi/ui";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ back: vi.fn() }));
vi.mock("@/lib/navigation/useBack", () => ({ useBack: () => ({ canGoBack: true, back: state.back }) }));
/** The counted `Link` needs the App Router; a plain anchor keeps its address. */
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, ...props }: ComponentProps<"a"> & { href: string }) => <a href={href} {...props} />,
}));

import { RouteOverlay } from "@/features/shell/RouteOverlay";
import { ListingPlaceholder } from "@/features/shell/RouteParamPlaceholder";

import { ANDROID_USER_AGENT, swipeRight } from "../helpers/gestures";

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

const layer = () => screen.getByTestId("overlay");

describe("RouteOverlay (the listing layer)", () => {
  it("is a fixed layer of its own above the shell, marked with its presentation", () => {
    const { rerender } = render(
      <RouteOverlay data-testid="overlay">
        <p>Listing</p>
      </RouteOverlay>,
    );
    expect(layer().getAttribute("data-slot")).toBe("route-overlay");
    expect(layer().getAttribute("data-presentation")).toBe("layer");
    expect(layer().className).toMatch(/(?:^|\s)z-\(--z-overlay\)(?:\s|$)/);
    expect(layer().className).toMatch(/(?:^|\s)overflow-y-auto(?:\s|$)/);
    expect(screen.getByText("Listing")).toBeTruthy();

    rerender(<RouteOverlay data-testid="overlay" presentation="standalone" className="z-100" />);
    expect(layer().getAttribute("data-presentation")).toBe("standalone");
    expect(layer().className).toMatch(/(?:^|\s)z-100(?:\s|$)/);
    expect(layer().className).not.toMatch(/z-\(--z-overlay\)/);
  });

  it("keeps no top inset of its own; the listing placeholder in it clears Telegram's header", async () => {
    const placeholder = await ListingPlaceholder({ params: Promise.resolve({ number: "42" }), layer: "overlay", children: null });
    render(
      <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
        <RouteOverlay data-testid="overlay">{placeholder}</RouteOverlay>
      </NextIntlClientProvider>,
    );
    expect(layer().className).not.toMatch(/top-inset/);
    expect(document.querySelector('[data-route="listing"]')?.className).toMatch(/(?:^|\s)pt-\[calc\(16px\+var\(--top-inset\)\)\](?:\s|$)/);
  });

  it("with swipe back on, a swipe closes it through back() once, after a light impact and the slide", () => {
    render(<RouteOverlay data-testid="overlay" swipeBack />);

    swipeRight(layer(), 150);
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
    expect(state.back).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS));
    expect(state.back).toHaveBeenCalledTimes(1);

    swipeRight(layer(), 150);
    act(() => vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS));
    expect(state.back).toHaveBeenCalledTimes(1);
  });

  it("has no swipe back unless the content turns it on", () => {
    render(<RouteOverlay data-testid="overlay" />);
    swipeRight(layer(), 150);
    act(() => vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS));
    expect(layer().style.transform).toBe("");
    expect(state.back).not.toHaveBeenCalled();
  });

  it("has no swipe back when loaded directly, or on Android", () => {
    const { unmount } = render(<RouteOverlay data-testid="overlay" presentation="standalone" swipeBack />);
    swipeRight(layer(), 150);
    act(() => vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS));
    unmount();

    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ANDROID_USER_AGENT);
    render(<RouteOverlay data-testid="overlay" swipeBack />);
    swipeRight(layer(), 150);
    act(() => vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS));

    expect(state.back).not.toHaveBeenCalled();
    expect(haptics()).toEqual([]);
  });

  describe("the listing's own close, entrance and leave (WP-36)", () => {
    const cross = () => document.querySelector<HTMLButtonElement>("[data-fallback-close]");
    const inIntl = (ui: ReactNode) => (
      <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
        {ui}
      </NextIntlClientProvider>
    );

    it("plays nothing and carries no cross by default (the fullscreen map keeps its own ×)", () => {
      fake?.uninstall();
      fake = null;
      render(inIntl(<RouteOverlay data-testid="overlay" />));

      expect(layer().className).not.toContain("animate-listing-in");
      expect(layer().hasAttribute("data-layer-motion")).toBe(false);
      expect(cross()).toBeNull();
    });

    it("entrance: the listing-in animation, marked for lite graphics", () => {
      render(inIntl(<RouteOverlay data-testid="overlay" entrance />));

      expect(layer().className).toContain("animate-listing-in");
      expect(layer().hasAttribute("data-layer-motion")).toBe(true);
    });

    it("leaving: the listing-out animation and no taps", () => {
      render(inIntl(<RouteOverlay data-testid="overlay" entrance leaving />));

      expect(layer().hasAttribute("data-leaving")).toBe(true);
      expect(layer().className).toContain("animate-listing-out");
      expect(layer().className).toContain("pointer-events-none");
    });

    it("with onClose and without the SDK it carries the cross, which asks for the leave", () => {
      fake?.uninstall();
      fake = null;
      const onClose = vi.fn();
      render(inIntl(<RouteOverlay data-testid="overlay" onClose={onClose} />));

      expect(cross()?.getAttribute("aria-label")).toBe("Закрыть");
      act(() => cross()!.click());

      expect(onClose.mock.calls).toEqual([["leave"]]);
      expect(state.back).not.toHaveBeenCalled();
    });

    it("with onClose the swipe asks for its close with swipe, not back()", () => {
      const onClose = vi.fn();
      render(inIntl(<RouteOverlay data-testid="overlay" swipeBack onClose={onClose} />));

      swipeRight(layer(), 150);
      act(() => vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS));

      expect(onClose.mock.calls).toEqual([["swipe"]]);
      expect(state.back).not.toHaveBeenCalled();
      expect(cross()).toBeNull();
    });
  });
});
