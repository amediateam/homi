import { describe, expect, it } from "vitest";

import * as search from "../src/index";

describe("@homi/search public exports", () => {
  it("exposes the model, the rules and the mappings", () => {
    const functions = [
      "defaultFilters",
      "normalizeFilters",
      "filtersKey",
      "filtersHash",
      "sameFilters",
      "isCustomFilters",
      "countActiveFilters",
      "pickRooms",
      "isRoomPicked",
      "switchDeal",
      "switchRentTerm",
      "toggleType",
      "setGeography",
      "pickCity",
      "resetAll",
      "resetQuick",
      "applyPreset",
      "isPresetSelected",
      "presetSource",
      "sectionsFor",
      "belowMedianAvailable",
      "fixRanges",
      "sortOptions",
      "normalizeSort",
      "roomsLabel",
      "priceLabel",
      "areaLabel",
      "filtersSummary",
      "filtersTitle",
      "filtersAreaSummary",
      "findCity",
      "toSearchParams",
      "fromSearchParams",
      "toApiQuery",
      "toRadarFilters",
      "serializePolygon",
      "parsePolygon",
    ] as const;
    for (const name of functions) {
      expect(typeof search[name], name).toBe("function");
    }
    expect(search.FILTER_KEYS).toHaveLength(25);
    expect(search.SEARCH_PARAM_KEYS).toEqual([...search.FILTER_KEYS, "sort"]);
  });
});
