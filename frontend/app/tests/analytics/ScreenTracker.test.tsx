import { act, cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pathname: "/",
  search: "",
  tracked: [] as { screen: string; props: Record<string, unknown> }[],
}));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.search) }));
vi.mock("@/lib/analytics/posthog", () => ({
  trackScreen: (screen: string, props: Record<string, unknown> = {}) => state.tracked.push({ screen, props }),
}));

import { listingKnown, resetScreenTracker, ScreenTracker } from "@/features/shell/ScreenTracker";
import { useScreenLayer } from "@/features/shell/useScreenLayer";
import { currentScreen, resetScreens } from "@/lib/analytics/screens";

beforeEach(() => {
  state.pathname = "/";
  state.search = "";
  state.tracked = [];
  resetScreens();
  resetScreenTracker();
});

afterEach(() => {
  cleanup();
});

const at = (pathname: string, search = "") => {
  state.pathname = pathname;
  state.search = search;
};

describe("ScreenTracker (WP-32, LB-APP-037)", () => {
  it("an address change gives one pageview and sets the screen for error reports", () => {
    const view = render(<ScreenTracker />);
    at("/map", "draw=1");
    view.rerender(<ScreenTracker />);
    at("/map", "draw=1&pin=4");
    view.rerender(<ScreenTracker />);

    expect(state.tracked.map((entry) => entry.screen)).toEqual(["search/list", "map/draw"]);
    expect(currentScreen()).toBe("map/draw");
  });

  it("a listing's pageview waits for its record or failure; a card closed before that sends none", () => {
    at("/listing/41");
    const view = render(<ScreenTracker />);
    expect(currentScreen()).toBe("listing");
    expect(state.tracked).toEqual([]);

    act(() => listingKnown(41));
    expect(state.tracked).toEqual([{ screen: "listing", props: { listing_id: 41 } }]);

    at("/listing/42");
    view.rerender(<ScreenTracker />);
    at("/");
    view.rerender(<ScreenTracker />);
    act(() => listingKnown(42));
    expect(state.tracked.map((entry) => entry.screen)).toEqual(["listing", "search/list"]);
  });

  it("a listing whose record was known before the address's effect sends at once; its children carry listing_id", () => {
    act(() => listingKnown(7));
    at("/listing/7");
    const view = render(<ScreenTracker />);
    at("/listing/7/photos", "i=2");
    view.rerender(<ScreenTracker />);

    expect(state.tracked).toEqual([
      { screen: "listing", props: { listing_id: 7 } },
      { screen: "listing/photos", props: { listing_id: 7 } },
    ]);
  });
});

describe("useScreenLayer", () => {
  it("names the top while shown and active; the address name comes back when it goes", () => {
    render(<ScreenTracker />);
    const layer = renderHook(({ active }) => useScreenLayer("map/card", active), { initialProps: { active: true } });
    expect(currentScreen()).toBe("map/card");
    expect(state.tracked.at(-1)?.screen).toBe("map/card");

    layer.rerender({ active: false });
    expect(currentScreen()).toBe("search/list");
    layer.rerender({ active: true });
    layer.unmount();
    expect(currentScreen()).toBe("search/list");
  });
});
