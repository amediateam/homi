import type { CityStatsRef, Deal } from "@homi/search";
import { describe, expect, it } from "vitest";

import {
  FEW_RESULTS,
  type FewResultsContext,
  fewTitleKey,
  type ListEnd,
  listEnd,
  offersReset,
  otherDealOf,
  otherDealOffer,
  showsFewResults,
} from "@/features/feed/fewResults";
import { devFlags } from "@/lib/flags";

import { withDevFlags } from "../helpers/flags";

const STATS: CityStatsRef = { code: "tashkent", counts: { rent_long: 40, rent_daily: 12, sale: 120 } };

/** A fully loaded search list of 3 visible items in a known city without filters: the note shows. */
const LIST: ListEnd = { source: "feed", done: true, error: false, visible: 3 };
const CONTEXT: FewResultsContext = { activeFilters: 0, stats: STATS, cityName: "Ташкент" };

describe("showsFewResults (BR-APP-025)", () => {
  it("the limit is 10 visible items", () => {
    expect(FEW_RESULTS).toBe(10);
  });

  it.each<[string, Partial<ListEnd>, Partial<FewResultsContext>, boolean]>([
    ["0 visible", { visible: 0 }, {}, true],
    ["9 visible", { visible: 9 }, {}, true],
    ["10 visible", { visible: 10 }, {}, false],
    ["favourites", { source: "favorites" }, {}, false],
    ["history", { source: "history" }, {}, false],
    ["still loading", { done: false }, {}, false],
    ["an error shown", { error: true }, {}, false],
    ["0 visible with an error", { visible: 0, error: true }, {}, false],
    ["one active filter", {}, { activeFilters: 1 }, false],
    ["city stats not loaded", {}, { stats: null }, false],
    ["the city has no name", {}, { cityName: null }, false],
    ["an empty city name", {}, { cityName: "" }, false],
    ["9 visible, filters active", { visible: 9 }, { activeFilters: 2 }, false],
  ])("%s → %s", (_name, list, context, shown) => {
    expect(showsFewResults({ ...LIST, ...list }, { ...CONTEXT, ...context })).toBe(shown);
  });

  it("without a search context (favourites, history) the note never shows", () => {
    expect(showsFewResults(LIST, null)).toBe(false);
  });
});

describe("listEnd (SCR-009)", () => {
  it.each<[string, Partial<ListEnd>, FewResultsContext | null, "few" | "empty" | null]>([
    ["few items, no filters", {}, CONTEXT, "few"],
    ["0 items, no filters, stats known: the note, not the empty state", { visible: 0 }, CONTEXT, "few"],
    ["0 items with filters", { visible: 0 }, { ...CONTEXT, activeFilters: 1 }, "empty"],
    ["0 items, stats not loaded (LB-APP-038)", { visible: 0 }, { ...CONTEXT, stats: null }, "empty"],
    ["few items with filters", {}, { ...CONTEXT, activeFilters: 1 }, null],
    ["10 items", { visible: 10 }, CONTEXT, null],
    ["0 items still loading", { visible: 0, done: false }, CONTEXT, null],
    ["0 items with an error", { visible: 0, error: true }, CONTEXT, null],
    ["empty favourites", { source: "favorites", visible: 0 }, null, "empty"],
    ["empty history", { source: "history", visible: 0 }, null, "empty"],
    ["favourites with items", { source: "favorites", visible: 3 }, null, null],
  ])("%s → %s", (_name, list, context, end) => {
    expect(listEnd({ ...LIST, ...list }, context)).toBe(end);
  });
});

describe("the note's title", () => {
  it.each<[number, Deal, string]>([
    [0, "rent_long", "feed.nothing"],
    [0, "sale", "feed.nothing"],
    [3, "rent_long", "feed.fewRent"],
    [3, "rent_daily", "feed.fewRent"],
    [9, "sale", "feed.fewSale"],
  ])("%i visible, %s → %s", (visible, deal, key) => {
    expect(fewTitleKey(visible, deal)).toBe(key);
  });
});

describe("the other deal", () => {
  it("rent → sale, daily rent → sale, sale → long-term rent", () => {
    expect(otherDealOf("rent_long")).toBe("sale");
    expect(otherDealOf("rent_daily")).toBe("sale");
    expect(otherDealOf("sale")).toBe("rent_long");
  });

  it("is offered only when the city has more listings of it than are visible now", () => {
    expect(otherDealOffer("rent_long", STATS, 3)).toEqual({ deal: "sale", count: 120 });
    expect(otherDealOffer("rent_daily", STATS, 3)).toEqual({ deal: "sale", count: 120 });
    expect(otherDealOffer("sale", STATS, 3)).toEqual({ deal: "rent_long", count: 40 });
    expect(otherDealOffer("sale", STATS, 39)).toEqual({ deal: "rent_long", count: 40 });
    expect(otherDealOffer("sale", STATS, 40)).toBeNull();
    expect(otherDealOffer("rent_long", { code: "nukus", counts: { rent_long: 2, rent_daily: 0, sale: 3 } }, 3)).toBeNull();
  });

  it("a missing count is 0, and without stats nothing is offered", () => {
    expect(otherDealOffer("rent_long", { code: "nukus", counts: { rent_long: 5 } }, 0)).toBeNull();
    expect(otherDealOffer("rent_long", { code: "nukus", counts: null }, 0)).toBeNull();
    expect(otherDealOffer("rent_long", null, 0)).toBeNull();
  });
});

describe("offersReset (LB-APP-038, DEV-024)", () => {
  it("flag off (legacy): the reset is offered with or without active filters", () => {
    expect(devFlags.dev024ResetOnlyWithActiveFilters).toBe(false);
    expect(offersReset(0)).toBe(true);
    expect(offersReset(2)).toBe(true);
  });

  it("flag on: only with an active filter", () => {
    withDevFlags({ dev024ResetOnlyWithActiveFilters: true }, (flags) => {
      expect(offersReset(0, flags)).toBe(false);
      expect(offersReset(1, flags)).toBe(true);
    });
  });
});
