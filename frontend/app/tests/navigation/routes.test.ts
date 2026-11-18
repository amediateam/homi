import { describe, expect, it } from "vitest";

import {
  isListingNumber,
  isQuickFilterKind,
  isRadarId,
  isRootTab,
  parentOf,
  RESERVED_PARAMS,
  routes,
  screenNameOf,
  SEARCH_KEYS,
  searchStateOf,
} from "@/lib/navigation/routes";

const RADAR = "01JD7K3QZ8V6R3M2N4P5Q6R7S8";
const params = (query = "") => new URLSearchParams(query);

describe("builders", () => {
  it.each([
    [routes.feed(), "/"],
    [routes.feed({ city: "tashkent", rooms_min: 2 }), "/?city=tashkent&rooms_min=2"],
    [routes.feed({ types: ["apartment", "house"], sort: null, deal: undefined }), "/?types=apartment&types=house"],
    [routes.map(params("city=x")), "/map?city=x"],
    [routes.filters({ focus: "pets" }), "/filters?focus=pets"],
    [routes.quickFilter("rooms"), "/filters/rooms"],
    [routes.quickFilter("price", { from: "map" }), "/filters/price?from=map"],
    [routes.sort(), "/sort"],
    [routes.city({ city: "samarkand" }), "/city?city=samarkand"],
    [routes.listing(5), "/listing/5"],
    [routes.listingPhotos(5), "/listing/5/photos"],
    [routes.listingPhotos(5, 2), "/listing/5/photos?i=2"],
    [routes.listingLocation(5), "/listing/5/location"],
    [routes.listingMarket(5), "/listing/5/market"],
    [routes.listingActions(5), "/listing/5/actions"],
    [routes.saved(), "/saved"],
    [routes.history(), "/saved/history"],
    [routes.radars(), "/radars"],
    [routes.radarNew(), "/radars/new"],
    [routes.radarNew({ city: "x" }), "/radars/new?city=x"],
    [routes.radar(RADAR), `/radars/${RADAR}`],
    [routes.radarEdit(RADAR), `/radars/${RADAR}/edit`],
    [routes.radarFound({ radar: RADAR }), `/radars/found?radar=${RADAR}`],
    [routes.settings(), "/settings"],
    [routes.settingsPage("quiet-hours"), "/settings/quiet-hours"],
    [routes.welcomeLanguage(), "/welcome/language"],
    [routes.welcomeCity(), "/welcome/city"],
    [routes.noAccess(), "/no-access"],
    [routes.noAccess("invite"), "/no-access?reason=invite"],
    [routes.outside(), "/outside"],
  ])("%s", (built, expected) => {
    expect(built).toBe(expected);
  });

  it("encodes values", () => {
    expect(routes.feed({ city: "a b&c" })).toBe("/?city=a+b%26c");
  });
});

describe("parameter checks", () => {
  it("accepts positive integers only as a listing number", () => {
    expect(["1", "5", "100016", "9007199254740991"].every(isListingNumber)).toBe(true);
    expect(["0", "-1", "01", "1.5", "abc", "", "9007199254740992", " 1"].some(isListingNumber)).toBe(false);
  });

  it("accepts a ULID only as a radar id", () => {
    expect(isRadarId(RADAR)).toBe(true);
    expect(isRadarId(RADAR.toLowerCase())).toBe(true);
    expect([RADAR.slice(1), `${RADAR}0`, "81JD7K3QZ8V6R3M2N4P5Q6R7S8", "01JD7K3QZ8V6R3M2N4P5Q6R7SU", "12"].some(isRadarId)).toBe(
      false,
    );
  });

  it("accepts the three quick filters", () => {
    expect(["rooms", "price", "owner"].every(isQuickFilterKind)).toBe(true);
    expect(["sort", "Rooms", ""].some(isQuickFilterKind)).toBe(false);
  });
});

describe("isRootTab", () => {
  it.each([
    ["/", true],
    ["/map", true],
    ["/saved", true],
    ["/saved/history", true],
    ["/radars", true],
    ["/settings", true],
    ["/settings/", true],
    ["/filters", false],
    ["/listing/5", false],
    ["/radars/new", false],
    ["/settings/theme", false],
    ["/welcome/language", false],
  ])("%s → %s", (pathname, expected) => {
    expect(isRootTab(pathname)).toBe(expected);
  });
});

describe("searchStateOf", () => {
  it("drops the reserved parameters and keeps the rest", () => {
    expect([...RESERVED_PARAMS]).toEqual(["from", "focus", "pick", "draw", "pin", "step", "i"]);
    expect(searchStateOf(params("city=x&from=map&focus=pets&i=2&sort=cheap&utm=1")).toString()).toBe(
      "city=x&sort=cheap&utm=1",
    );
  });

  it("knows the 25 filter keys and sort", () => {
    expect(SEARCH_KEYS).toHaveLength(26);
    expect(SEARCH_KEYS).toContain("polygon");
    expect(SEARCH_KEYS).toContain("sort");
  });
});

describe("parentOf", () => {
  it.each([
    // (4) root tabs and gates
    ["/", "", null],
    ["/map", "city=x", null],
    ["/saved", "", null],
    ["/saved/history", "", null],
    ["/radars", "", null],
    ["/settings", "", null],
    ["/welcome/language", "", null],
    ["/welcome/city", "", null],
    ["/no-access", "reason=full", null],
    ["/outside", "", null],
    ["/unknown/address", "", null],
    // (1) layer parameters
    ["/map", "draw=1", "/map"],
    ["/map", "draw=1&city=x", "/map?city=x"],
    ["/map", "pin=7", "/map"],
    ["/map", "pick=12&city=x", "/map?city=x"],
    ["/map", "pin=5", "/map"],
    ["/listing/5/actions", "step=detail", "/listing/5/actions?step=report"],
    ["/listing/5/actions", "step=report", "/listing/5/actions"],
    // (2) search sheets
    ["/filters", "city=x&from=map", "/map?city=x"],
    ["/filters", "from=map&city=tashkent&zones=center&focus=pets", "/map?city=tashkent&zones=center"],
    ["/filters", "city=x", "/?city=x"],
    ["/filters/rooms", "rooms_min=2&from=map", "/map?rooms_min=2"],
    ["/filters/price", "", "/"],
    ["/filters/owner", "owner=owners", "/?owner=owners"],
    ["/sort", "rooms_min=2&focus=pets", "/?rooms_min=2"],
    ["/sort", "sort=cheap&utm=1&types=room&types=house", "/?sort=cheap&types=room&types=house"],
    ["/city", "from=map&deal=sale", "/map?deal=sale"],
    // (3) pushed screens and their layers
    ["/listing/5", "", "/"],
    ["/listing/5/photos", "i=2", "/listing/5"],
    ["/listing/5/location", "", "/listing/5"],
    ["/listing/5/market", "", "/listing/5"],
    ["/listing/5/actions", "", "/listing/5"],
    ["/radars/new", "city=x", "/radars"],
    [`/radars/${RADAR}`, "", "/radars"],
    ["/radars/found", `radar=${RADAR}`, "/radars"],
    [`/radars/${RADAR}/edit`, "", `/radars/${RADAR}`],
    ["/settings/theme", "", "/settings"],
    ["/settings/graphics", "", "/settings"],
    ["/settings/language", "", "/settings"],
    ["/settings/currency", "", "/settings"],
    ["/settings/quiet-hours", "", "/settings"],
    ["/settings/digest", "", "/settings"],
    ["/settings/hidden", "", "/settings"],
  ])("%s?%s → %s", (pathname, query, expected) => {
    expect(parentOf(pathname, params(query))).toBe(expected);
  });
});

describe("screenNameOf", () => {
  it.each([
    ["/", "", "search/list"],
    ["/map", "", "search/map"],
    ["/map", "draw=1", "map/draw"],
    ["/saved", "", "saved/favorites"],
    ["/saved/history", "", "saved/history"],
    ["/radars", "", "subs"],
    ["/settings", "", "settings"],
    ["/listing/5", "", "listing"],
    [`/radars/${RADAR}/edit`, "", "radar/edit"],
    ["/radars/new", "", "radar/new"],
    ["/filters", "", "filters"],
    ["/filters/rooms", "", "filters/rooms"],
    ["/filters/price", "", "filters/price"],
    ["/filters/owner", "", "filters/owner"],
    ["/sort", "", "sort"],
    ["/city", "", "city"],
  ])("%s?%s → %s (the 16 legacy names)", (pathname, query, expected) => {
    expect(screenNameOf(pathname, params(query))).toBe(expected);
  });

  it.each([
    // listing > every layer over it
    ["/listing/5/photos", "", "listing"],
    ["/listing/5/actions", "step=detail", "listing"],
    // filters and the other sheets > map/draw > the tab below
    ["/filters", "from=map&draw=1", "filters"],
    ["/sort", "from=map", "sort"],
    ["/city", "from=map", "city"],
    // sheets without a name of their own report the tab below
    [`/radars/${RADAR}`, "", "subs"],
    ["/radars/found", "", "subs"],
    ["/settings/theme", "", "settings"],
  ])("%s?%s → %s (precedence of 03 §1.1)", (pathname, query, expected) => {
    expect(screenNameOf(pathname, params(query))).toBe(expected);
  });

  it("returns the route pattern of an address the legacy table does not name", () => {
    expect(screenNameOf("/welcome/language", params())).toBe("/welcome/language");
    expect(screenNameOf("/no-access", params("reason=full"))).toBe("/no-access");
    expect(screenNameOf("/filters/unknown", params())).toBe("/filters/[kind]");
  });
});
