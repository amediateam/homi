import { type CityRef, defaultFilters, SEARCH_PARAM_KEYS, type SearchFilters } from "@homi/search";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ depth: 0, log: [] as string[] }));
vi.mock("@/lib/navigation/history", () => ({ depth: () => state.depth }));
vi.mock("@/lib/navigation/nav", () => ({
  nav: {
    back: () => {
      state.log.push("back");
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    replace: (href: string) => void state.log.push(`replace ${href}`),
  },
}));

import { applyFilters, type ApplyOptions, onFiltersApplied } from "@/features/filters/applyFilters";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { searchRules } from "@/lib/search/rules";

import { withDevFlags } from "../helpers/flags";

const TASHKENT: CityRef = { code: "tashkent", has_median: true, has_metro: true, zones: [{ code: "center", name: "Центр" }] };
const ANDIJAN: CityRef = { code: "andijan", has_median: false, has_metro: false, zones: [] };
const RENT = defaultFilters("rent_long", "tashkent");
const SALE = defaultFilters("sale", "tashkent");

const unsubscribers: (() => void)[] = [];
const listen = (listener: (filters: SearchFilters) => void) => unsubscribers.push(onFiltersApplied(listener));

function options(overrides: Partial<ApplyOptions> = {}): ApplyOptions {
  return { sort: "new", target: routes.feed, city: TASHKENT, rules: searchRules(), ...overrides };
}

/** The address of the one replace `applyFilters` made. */
function replaced(): URL {
  const replaces = state.log.filter((entry) => entry.startsWith("replace "));
  expect(replaces).toHaveLength(1);
  return new URL(replaces[0].slice("replace ".length), "https://app.test");
}

beforeEach(() => {
  state.depth = 0;
  state.log = [];
  vi.spyOn(window, "scrollTo").mockImplementation(() => void state.log.push("scroll"));
});

afterEach(() => {
  for (const unsubscribe of unsubscribers.splice(0)) {
    unsubscribe();
  }
  vi.restoreAllMocks();
});

describe("applyFilters (WP-25)", () => {
  it("falls back to new when the applied search no longer offers the sort, and never writes new (BR-APP-023)", async () => {
    await applyFilters(SALE, options({ sort: "deal", city: null }));
    expect(replaced().searchParams.has("sort")).toBe(false);

    state.log = [];
    await applyFilters(RENT, options({ sort: "center", city: ANDIJAN }));
    expect(replaced().searchParams.has("sort")).toBe(false);

    state.log = [];
    await applyFilters(RENT, options({ sort: "new" }));
    expect(replaced().searchParams.has("sort")).toBe(false);
  });

  it("keeps a sort the applied city and filters still offer", async () => {
    await applyFilters(SALE, options({ sort: "ppm" }));
    expect(replaced().searchParams.get("sort")).toBe("ppm");

    state.log = [];
    await applyFilters(RENT, options({ sort: "deal" }));
    expect(replaced().searchParams.get("sort")).toBe("deal");
  });

  it("targets the feed, or the map when the sheet came from the map", async () => {
    await applyFilters(SALE, options());
    expect(replaced().pathname).toBe("/");

    state.log = [];
    await applyFilters(SALE, options({ target: routes.map }));
    expect(replaced().pathname).toBe("/map");
    expect(replaced().searchParams.get("deal")).toBe("sale");
  });

  it("writes only the search keys: from, focus and pick stay behind with the sheet", async () => {
    const dirty = { ...SALE, from: "map", focus: "pets", pick: "city", rooms_min: 2 } as SearchFilters;

    await applyFilters(dirty, options({ target: routes.map }));

    const keys = [...replaced().searchParams.keys()];
    expect(keys).toEqual(["city", "deal", "rooms_min"]);
    expect(keys.every((key) => (SEARCH_PARAM_KEYS as readonly string[]).includes(key))).toBe(true);
  });

  it("at depth 0 (a direct load) only replaces; opened in the app it steps back first, then replaces", async () => {
    await applyFilters(RENT, options());
    expect(state.log).toEqual(["replace /?city=tashkent", "scroll"]);

    state.log = [];
    state.depth = 1;
    await applyFilters(RENT, options());
    expect(state.log).toEqual(["back", "replace /?city=tashkent", "scroll"]);
  });

  it("tells every listener once, after the new address and the scroll, with the applied filters", async () => {
    const first = vi.fn(() => void state.log.push("first"));
    const second = vi.fn();
    listen(first);
    listen(second);

    await applyFilters({ ...RENT, rooms_min: 2 }, options());

    expect(state.log).toEqual(["replace /?city=tashkent&rooms_min=2", "scroll", "first"]);
    expect(first).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith({ ...RENT, rooms_min: 2 });
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("a listener that throws does not keep the others from hearing", async () => {
    const after = vi.fn();
    listen(() => {
      throw new Error("listener failed");
    });
    listen(after);

    await expect(applyFilters(RENT, options())).resolves.toBeUndefined();
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("an unsubscribed listener is not told", async () => {
    const listener = vi.fn();
    onFiltersApplied(listener)();

    await applyFilters(RENT, options());

    expect(listener).not.toHaveBeenCalled();
  });

  it("a second apply while the first is on its way does nothing: one Back, one replace, one notice", async () => {
    vi.useFakeTimers();
    try {
      state.depth = 1;
      const listener = vi.fn();
      listen(listener);
      state.log = [];
      // A Back whose popstate never comes: closeThen waits its 500 ms cap.
      vi.spyOn(nav, "back").mockImplementation(() => void state.log.push("back"));

      const first = applyFilters(RENT, options());
      const second = applyFilters({ ...RENT, rooms_min: 3 }, options());
      await vi.advanceTimersByTimeAsync(500);
      await Promise.all([first, second]);

      expect(second).toBe(first);
      expect(state.log).toEqual(["back", "replace /?city=tashkent", "scroll"]);
      expect(listener).toHaveBeenCalledTimes(1);

      state.depth = 0;
      await applyFilters({ ...RENT, rooms_min: 3 }, options());
      expect(listener).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("swaps inverted price and area ranges only with dev025ValidateRanges (LB-APP-043)", async () => {
    const inverted = { ...SALE, price_min: 90_000, price_max: 40_000, area_min: 80, area_max: 50 };
    const ranges = () => {
      const url = replaced();
      return ["price_min", "price_max", "area_min", "area_max"].map((key) => url.searchParams.get(key));
    };

    await applyFilters(inverted, options({ rules: withDevFlags({ dev025ValidateRanges: false }, searchRules) }));
    expect(ranges()).toEqual(["90000", "40000", "80", "50"]);

    state.log = [];
    const listener = vi.fn();
    listen(listener);
    await applyFilters(inverted, options({ rules: withDevFlags({ dev025ValidateRanges: true }, searchRules) }));
    expect(ranges()).toEqual(["40000", "90000", "50", "80"]);
    expect(listener).toHaveBeenCalledWith({ ...SALE, price_min: 40_000, price_max: 90_000, area_min: 50, area_max: 80 });
  });
});
