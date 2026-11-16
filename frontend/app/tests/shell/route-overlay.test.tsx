import { getMessages } from "@homi/i18n";
import { SWIPE_BACK_SETTLE_MS } from "@homi/ui";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
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
});
