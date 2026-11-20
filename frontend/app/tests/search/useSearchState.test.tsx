import { defaultFilters, switchDeal } from "@homi/search";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { devFlags } from "@/lib/flags";

const address = vi.hoisted(() => ({ pathname: "/", search: "" }));
const replace = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({ me: null as { city: string } | null }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(address.search) }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => address.pathname }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { replace: (href: string) => replace(href) } }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ me: session.me }) }));

const { useSearchState } = await import("@/lib/search/useSearchState");
const { addressCity, readSearchState, searchStateFromHref } = await import("@/lib/search/readSearchState");
const { searchRules } = await import("@/lib/search/rules");
const { storageSet } = await import("@/lib/storage");

beforeEach(() => {
  address.pathname = "/";
  address.search = "";
  session.me = null;
  replace.mockReset();
  window.localStorage.clear();
});

afterEach(() => cleanup());

describe("useSearchState (WP-22)", () => {
  it("BR-APP-010: the city of an address without one is the profile's, else the saved one, else tashkent", () => {
    expect(renderHook(() => useSearchState()).result.current.filters.city).toBe("tashkent");

    window.localStorage.setItem("homi-city", "samarkand");
    expect(renderHook(() => useSearchState()).result.current.filters.city).toBe("samarkand");

    session.me = { city: "bukhara" };
    expect(renderHook(() => useSearchState()).result.current.filters.city).toBe("bukhara");

    address.search = "city=fergana";
    expect(renderHook(() => useSearchState()).result.current.filters.city).toBe("fergana");
  });

  it("hydrates as the server rendered, without the saved city, and takes it right after (WP-24)", async () => {
    function City({ profileCity }: { profileCity?: string }) {
      return <output>{useSearchState({ profileCity }).filters.city}</output>;
    }
    window.localStorage.setItem("homi-city", "samarkand");
    const hydrated = async (element: ReactElement) => {
      const container = document.createElement("div");
      container.innerHTML = renderToString(element);
      const server = container.textContent;
      const recoverable: unknown[] = [];
      await act(async () => {
        hydrateRoot(container, element, { onRecoverableError: (error) => void recoverable.push(error) });
      });
      return { server, after: container.textContent, recoverable };
    };

    expect(await hydrated(<City />)).toEqual({ server: "tashkent", after: "samarkand", recoverable: [] });
    // The server's reading of the profile wins over the saved city in both renders, and `me` over both once known.
    expect(await hydrated(<City profileCity="bukhara" />)).toEqual({ server: "bukhara", after: "bukhara", recoverable: [] });
    session.me = { city: "fergana" };
    expect(renderHook(() => useSearchState({ profileCity: "bukhara" })).result.current.filters.city).toBe("fergana");
  });

  it("follows a write of the saved city at once (the sign-in's, WelcomeCity's)", () => {
    const { result } = renderHook(() => useSearchState());
    expect(result.current.filters.city).toBe("tashkent");

    act(() => storageSet("homi-city", "namangan"));
    expect(result.current.filters.city).toBe("namangan");
  });

  it("setFilters writes the state with replace on the current root and keeps a reserved parameter", () => {
    address.pathname = "/map";
    address.search = "city=tashkent&focus=pets&pin=5";
    const { result } = renderHook(() => useSearchState());

    act(() => result.current.setFilters(switchDeal(result.current.filters, "sale")));

    expect(replace).toHaveBeenCalledTimes(1);
    const [href] = replace.mock.calls[0] as [string];
    const url = new URL(href, "https://app.test");
    expect(url.pathname).toBe("/map");
    expect(url.searchParams.get("deal")).toBe("sale");
    expect(url.searchParams.get("city")).toBe("tashkent");
    expect(url.searchParams.get("focus")).toBe("pets");
    expect(url.searchParams.get("pin")).toBe("5");
  });

  it("setSort('new') removes the parameter; another sort writes it", () => {
    address.search = "city=tashkent&sort=cheap&from=map";
    const { result } = renderHook(() => useSearchState());
    expect(result.current.sort).toBe("cheap");

    act(() => result.current.setSort("new"));
    expect(replace).toHaveBeenLastCalledWith("/?city=tashkent&from=map");

    act(() => result.current.setSort("expensive"));
    expect(replace).toHaveBeenLastCalledWith("/?city=tashkent&sort=expensive&from=map");
  });

  it("write(filters, sort) changes both in one replace (the deal switch, D-SH-2)", () => {
    address.pathname = "/map";
    address.search = "city=tashkent&sort=deal&pin=5";
    const { result } = renderHook(() => useSearchState());

    act(() => result.current.write(switchDeal(result.current.filters, "sale"), "ppm"));

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenLastCalledWith("/map?city=tashkent&deal=sale&sort=ppm&pin=5");
  });

  it("setFilters drops from=radar, the mark of a radar's feed, and keeps every other parameter (WP-30)", () => {
    address.search = "city=tashkent&rooms_min=2&from=radar&focus=pets";
    const { result } = renderHook(() => useSearchState());

    act(() => result.current.setFilters({ ...result.current.filters, rooms_min: 3 }));
    expect(replace).toHaveBeenLastCalledWith("/?city=tashkent&rooms_min=3&focus=pets");
  });

  it("setSort drops from=radar on the feed and on the map (WP-30)", () => {
    address.search = "city=tashkent&from=radar";
    const feed = renderHook(() => useSearchState()).result.current;
    act(() => feed.setSort("cheap"));
    expect(replace).toHaveBeenLastCalledWith("/?city=tashkent&sort=cheap");

    address.pathname = "/map";
    address.search = "from=radar&city=tashkent&sort=cheap&pin=5";
    const map = renderHook(() => useSearchState()).result.current;
    act(() => map.setSort("new"));
    expect(replace).toHaveBeenLastCalledWith("/map?city=tashkent&pin=5");
  });

  it("write drops from=radar too, also when the state does not change (the deal switch, the few-results actions)", () => {
    address.search = "city=tashkent&deal=sale&from=radar";
    const { result } = renderHook(() => useSearchState());

    act(() => result.current.write(switchDeal(result.current.filters, "rent_long"), "new"));
    expect(replace).toHaveBeenLastCalledWith("/?city=tashkent");

    act(() => result.current.write(result.current.filters, result.current.sort));
    expect(replace).toHaveBeenLastCalledWith("/?city=tashkent&deal=sale");
  });

  it("only the value radar of from is dropped: from=map and every other from stay", () => {
    address.search = "city=tashkent&from=map";
    const fromMap = renderHook(() => useSearchState()).result.current;
    act(() => fromMap.setFilters(defaultFilters("sale", "tashkent")));
    expect(replace).toHaveBeenLastCalledWith("/?city=tashkent&deal=sale&from=map");

    address.search = "city=tashkent&from=radars";
    const fromOther = renderHook(() => useSearchState()).result.current;
    act(() => fromOther.setSort("cheap"));
    expect(replace).toHaveBeenLastCalledWith("/?city=tashkent&sort=cheap&from=radars");
  });

  it("equal states give equal addresses, whatever the order of the current one", () => {
    address.search = "rooms_min=2&city=tashkent&types=house&types=apartment";
    const first = renderHook(() => useSearchState()).result.current;
    address.search = "types=apartment&city=tashkent&types=house&rooms_min=2";
    const second = renderHook(() => useSearchState()).result.current;

    act(() => first.setFilters(first.filters));
    act(() => second.setFilters(second.filters));

    expect(replace.mock.calls[0][0]).toBe(replace.mock.calls[1][0]);
  });

  it("href(builder) builds another address with the current state", () => {
    address.search = "city=tashkent&deal=sale&from=map";
    const { result } = renderHook(() => useSearchState());

    expect(result.current.href((params) => `/map?${params.toString()}`)).toBe("/map?city=tashkent&deal=sale");
  });
});

describe("readSearchState and searchStateFromHref (WP-22)", () => {
  it("the server reads the same state, with the profile's city as the fallback", () => {
    expect(readSearchState({ deal: "sale", focus: "x" }, { city: "bukhara" })).toMatchObject({ filters: { deal: "sale", city: "bukhara" }, sort: "new" });
    expect(readSearchState({}, null).filters.city).toBe("tashkent");
  });

  it.each([
    [{ city: "samarkand", deal: "sale" }, "samarkand"],
    [{ city: ["andijan", "tashkent"] }, "andijan"],
    [{ city: ["not a code", "tashkent"] }, null],
    [{ city: "" }, null],
    [{ city: "not a code" }, null],
    [{ deal: "sale" }, null],
    [{}, null],
    ["city=fergana&deal=sale", "fergana"],
    ["city=not%20a%20code&city=tashkent", null],
    ["deal=sale", null],
    [new URLSearchParams("city=bukhara&rooms_min=2"), "bukhara"],
    [new URLSearchParams("city="), null],
  ] as const)("addressCity(%j) is %j: the address's first city when it has the shape of a code (WP-24)", (input, expected) => {
    expect(addressCity(input)).toBe(expected);
  });

  it("a remembered address gives its state", () => {
    expect(searchStateFromHref("/map?city=fergana&sort=cheap&draw=1")).toMatchObject({ filters: { city: "fergana" }, sort: "cheap" });
  });
});

describe("searchRules (WP-22)", () => {
  it("is the one place where app flags become the rules of @homi/search", () => {
    expect(searchRules(devFlags)).toEqual({
      dev017TenantPetsDailyRule: false,
      dev017PetsLongRentOnly: true,
      dev018ResetKeepsDaily: false,
      dev025ValidateRanges: false,
      dev052UnifiedBelowMedianRule: false,
      dev005RadarDropsPostedDays: false,
    });
    expect(searchRules({ ...devFlags, dev018ResetKeepsDaily: true }).dev018ResetKeepsDaily).toBe(true);
    expect(searchRules({ ...devFlags, dev017PetsLongRentOnly: false }).dev017PetsLongRentOnly).toBe(false);
  });
});
