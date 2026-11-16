import { toSearchParams } from "@homi/search";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const address = vi.hoisted(() => ({ pathname: "/", search: "" }));
const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(address.search) }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => address.pathname }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { replace: (href: string) => replace(href) } }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ me: null }) }));

const { useScreenSearchState } = await import("@/lib/search/useScreenSearchState");
const { useSearchState } = await import("@/lib/search/useSearchState");
const { routes } = await import("@/lib/navigation/routes");

/** Moves the global address; `rerender()` then shows the hook what a mounted screen would read. */
const at = (pathname: string, search = "") => {
  address.pathname = pathname;
  address.search = search;
};

beforeEach(() => {
  at("/");
  replace.mockReset();
  window.localStorage.clear();
});

afterEach(() => cleanup());

describe("useScreenSearchState (KI-43)", () => {
  it("on its own address it is the live state of useSearchState", () => {
    at("/", "city=tashkent&deal=sale&rooms_min=2&sort=cheap&from=x");
    const own = renderHook(() => useScreenSearchState("feed")).result.current;
    const live = renderHook(() => useSearchState()).result.current;

    expect(own.filters).toEqual(live.filters);
    expect(own.sort).toBe("cheap");
    expect(own.href(routes.sort)).toBe(live.href(routes.sort));
  });

  it("a listing over the feed keeps the feed's state, and so does a sheet that carries other parameters", () => {
    at("/", "city=tashkent&deal=sale");
    const { result, rerender } = renderHook(() => useScreenSearchState("feed"));
    expect(result.current.filters.deal).toBe("sale");

    at("/listing/42");
    rerender();
    expect(result.current.filters.deal).toBe("sale");
    expect(result.current.href(routes.feed)).toBe("/?city=tashkent&deal=sale");

    at("/filters", "city=tashkent&deal=sale&rooms_min=3");
    rerender();
    expect(result.current.filters.deal).toBe("sale");
    expect(result.current.filters.rooms_min).toBeNull();
  });

  it("the feed hidden under another tab keeps its state; back on the feed the new address applies", () => {
    at("/", "city=tashkent&deal=sale");
    const { result, rerender } = renderHook(() => useScreenSearchState("feed"));

    at("/saved");
    rerender();
    expect(result.current.filters.deal).toBe("sale");

    at("/map", "city=samarkand");
    rerender();
    expect(result.current.filters.city).toBe("tashkent");

    at("/", "city=tashkent&rooms_min=2");
    rerender();
    expect(result.current.filters.deal).toBe("rent_long");
    expect(result.current.filters.rooms_min).toBe(2);
  });

  it("the held state gives the same canonical query, and the same filters object on every render", () => {
    at("/", "districts=yunusabad&districts=chilonzor&city=tashkent&deal=sale&sort=ppm&price_max=90000");
    const { result, rerender } = renderHook(() => useScreenSearchState("feed"));
    const canonical = toSearchParams(result.current.filters, result.current.sort).toString();

    at("/listing/42");
    rerender();
    const held = result.current.filters;
    expect(toSearchParams(held, result.current.sort).toString()).toBe(canonical);
    rerender();
    expect(result.current.filters).toBe(held);
  });

  it("the held state keeps the city the live address resolved (an address without one)", () => {
    window.localStorage.setItem("homi-city", "samarkand");
    at("/", "deal=sale");
    const { result, rerender } = renderHook(() => useScreenSearchState("feed"));
    expect(result.current.filters.city).toBe("samarkand");

    window.localStorage.clear();
    at("/listing/42");
    rerender();
    expect(result.current.filters.city).toBe("samarkand");
  });

  it("before its own address was ever read it is the live reading (a sheet loaded directly)", () => {
    at("/filters", "city=tashkent&deal=sale");
    const { result, rerender } = renderHook(() => useScreenSearchState("feed"));
    expect(result.current.filters.deal).toBe("sale");

    at("/filters", "city=tashkent&rooms_min=1");
    rerender();
    expect(result.current.filters.deal).toBe("rent_long");
    expect(result.current.filters.rooms_min).toBe(1);
  });

  it("the map is its own address with the drawing layer too, and holds under a listing", () => {
    at("/map", "city=tashkent&deal=sale&draw=1");
    const { result, rerender } = renderHook(() => useScreenSearchState("map"));
    expect(result.current.filters.deal).toBe("sale");

    at("/listing/7");
    rerender();
    expect(result.current.filters.deal).toBe("sale");

    at("/map", "city=tashkent");
    rerender();
    expect(result.current.filters.deal).toBe("rent_long");
  });

  it("a write while held goes through the live address with the held state", () => {
    at("/", "city=tashkent&deal=sale");
    const { result, rerender } = renderHook(() => useScreenSearchState("feed"));
    at("/listing/42");
    rerender();

    act(() => result.current.setSort("cheap"));

    expect(replace).toHaveBeenCalledWith("/?city=tashkent&deal=sale&sort=cheap");
  });
});
