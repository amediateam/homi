import { describe, expect, it } from "vitest";

import {
  isFoundTrigger,
  isListingNumber,
  isOwnerId,
  isQuickFilterKind,
  isRadarId,
  isRadarNewEntry,
  isRootTab,
  matchRoute,
  parentOf,
  RESERVED_PARAMS,
  routes,
  screenNameOf,
  SETTINGS_PAGES,
  SEARCH_KEYS,
  searchStateOf,
} from "@/lib/navigation/routes";

const RADAR = "01JD7K3QZ8V6R3M2N4P5Q6R7S8";
const OWNER = "01JF0000000000000000000004";
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
    [routes.radarNew(params("city=x&rooms_min=2"), "return"), "/radars/new?city=x&rooms_min=2&entry=return"],
    [routes.radarNew({ city: "x", types: ["flat", "house"] }, "feed"), "/radars/new?city=x&types=flat&types=house&entry=feed"],
    [routes.radarNew(undefined, "feed"), "/radars/new?entry=feed"],
    [routes.radarFound({ trigger: "pause" }), "/radars/found?trigger=pause"],
    [routes.radarFound({ trigger: "delete" }), "/radars/found?trigger=delete"],
    [routes.settings(), "/settings"],
    [routes.settingsPage("quiet-hours"), "/settings/quiet-hours"],
    [routes.welcomeLanguage(), "/welcome/language"],
    [routes.welcomeCity(), "/welcome/city"],
    [routes.noAccess(), "/no-access"],
    [routes.noAccess("invite"), "/no-access?reason=invite"],
    [routes.outside(), "/outside"],
    // The owner form (WP-81).
    [routes.ownerNew(), "/owner/new"],
    [routes.ownerForm(OWNER), `/owner/${OWNER}`],
    [routes.ownerForm(OWNER, { focus: "price" }), `/owner/${OWNER}?focus=price`],
    [routes.ownerPlace(OWNER), `/owner/${OWNER}/place`],
    [routes.ownerPlace(OWNER, { first: 1 }), `/owner/${OWNER}/place?first=1`],
    [routes.ownerPhone(OWNER), `/owner/${OWNER}/phone`],
    [routes.ownerMode(OWNER), `/owner/${OWNER}/mode`],
    [routes.ownerDone(OWNER), `/owner/${OWNER}/done`],
    [routes.ownerListings(), "/settings/owner"],
    [routes.ownerLimit({ where: "settings" }), "/owner/limit?where=settings"],
    [routes.ownerRequests(OWNER), `/settings/owner/${OWNER}/requests`],
    [routes.listingRequests(10000008), "/listing/10000008/requests"],
  ])("%s", (built, expected) => {
    expect(built).toBe(expected);
  });

  it("encodes values", () => {
    expect(routes.feed({ city: "a b&c" })).toBe("/?city=a+b%26c");
  });

  it("radarNew copies the query it is given: the caller's parameters are left as they were", () => {
    const query = params("city=x&deal=sale");
    expect(routes.radarNew(query, "return")).toBe("/radars/new?city=x&deal=sale&entry=return");
    expect(query.toString()).toBe("city=x&deal=sale");
  });

  it("radarNew sets one entry: the given one replaces an entry already in the query; none keeps the query's", () => {
    expect(routes.radarNew(params("entry=return&city=x"), "feed")).toBe("/radars/new?entry=feed&city=x");
    expect(routes.radarNew({ entry: "return", city: "x" }, "feed")).toBe("/radars/new?entry=feed&city=x");
    expect(routes.radarNew(params("city=x&entry=feed"))).toBe("/radars/new?city=x&entry=feed");
  });
});

describe("parameter checks", () => {
  it("accepts positive integers only as a listing number", () => {
    expect(["1", "5", "100016", "9007199254740991"].every(isListingNumber)).toBe(true);
    expect(["0", "-1", "01", "1.5", "abc", "", "9007199254740992", " 1"].some(isListingNumber)).toBe(false);
  });

  it("accepts a ULID only as an owner listing id", () => {
    expect(isOwnerId(OWNER)).toBe(true);
    expect(["new", "01JF000000000000000000000", "limit", `${OWNER}0`].some(isOwnerId)).toBe(false);
  });

  it("matches the owner form's addresses, a step only below an id and never a non-ULID", () => {
    expect(matchRoute("/owner/new")).toEqual({ route: "ownerNew" });
    expect(matchRoute(`/owner/${OWNER}`)).toEqual({ route: "owner", id: OWNER, step: null });
    for (const step of ["place", "phone", "mode", "done"] as const) {
      expect(matchRoute(`/owner/${OWNER}/${step}`)).toEqual({ route: "owner", id: OWNER, step });
    }
    expect(matchRoute("/settings/owner")).toEqual({ route: "ownerListings" });
    // WP-82: the limit sheet, «Отклики» under the list and over the user's own listing.
    expect(matchRoute("/owner/limit")).toEqual({ route: "ownerLimit" });
    expect(matchRoute(`/settings/owner/${OWNER}/requests`)).toEqual({ route: "ownerRequests", id: OWNER });
    expect(matchRoute("/listing/10000008/requests")).toEqual({ route: "listing", number: "10000008", child: "requests" });
    for (const pathname of ["/settings/owner/abc/requests", `/settings/owner/${OWNER}`, `/settings/owner/${OWNER}/requests/x`, "/owner/limit/x"]) {
      expect(matchRoute(pathname).route, pathname).toBe("unknown");
    }
    for (const pathname of ["/owner", `/owner/${OWNER}/other`, `/owner/${OWNER}/place/x`, "/owner/new/place"]) {
      expect(matchRoute(pathname).route, pathname).toBe("unknown");
    }
  });

  it("accepts a ULID only as a radar id", () => {
    expect(isRadarId(RADAR)).toBe(true);
    expect(isRadarId(RADAR.toLowerCase())).toBe(true);
    expect([RADAR.slice(1), `${RADAR}0`, "81JD7K3QZ8V6R3M2N4P5Q6R7S8", "01JD7K3QZ8V6R3M2N4P5Q6R7SU", "12"].some(isRadarId)).toBe(
      false,
    );
  });

  it("accepts the two entries of a new radar and the two triggers of the survey", () => {
    expect(["return", "feed"].every(isRadarNewEntry)).toBe(true);
    expect(["empty", "filters", "Return", "", null, undefined].some(isRadarNewEntry)).toBe(false);
    expect(["pause", "delete"].every(isFoundTrigger)).toBe(true);
    expect(["paused", "Delete", "", null, undefined].some(isFoundTrigger)).toBe(false);
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
    expect([...RESERVED_PARAMS]).toEqual(["from", "focus", "pick", "draw", "pin", "step", "i", "entry", "trigger", "first"]);
    expect(searchStateOf(params("city=x&from=map&focus=pets&i=2&sort=cheap&utm=1")).toString()).toBe(
      "city=x&sort=cheap&utm=1",
    );
    expect(searchStateOf(params("entry=return&city=x&trigger=pause&from=radar")).toString()).toBe("city=x");
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
    ["/radars/found", "trigger=pause", "/radars"],
    [`/radars/${RADAR}/edit`, "", `/radars/${RADAR}`],
    ["/settings/theme", "", "/settings"],
    ["/settings/graphics", "", "/settings"],
    ["/settings/language", "", "/settings"],
    ["/settings/currency", "", "/settings"],
    ["/settings/quiet-hours", "", "/settings"],
    ["/settings/digest", "", "/settings"],
    ["/settings/hidden", "", "/settings"],
    // The owner form (WP-81): a step returns to the questionnaire; the form, its done step and the first placing close.
    ["/owner/new", "", "/settings"],
    [`/owner/${OWNER}`, "", "/settings"],
    [`/owner/${OWNER}`, "focus=price", "/settings"],
    [`/owner/${OWNER}/done`, "", "/settings"],
    [`/owner/${OWNER}/place`, "first=1", "/settings"],
    [`/owner/${OWNER}/place`, "", `/owner/${OWNER}`],
    [`/owner/${OWNER}/phone`, "", `/owner/${OWNER}`],
    [`/owner/${OWNER}/mode`, "", `/owner/${OWNER}`],
    ["/settings/owner", "", "/settings"],
    ["/owner/limit", "where=mine", "/settings"],
    [`/settings/owner/${OWNER}/requests`, "", "/settings/owner"],
    ["/listing/10000008/requests", "", "/listing/10000008"],
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
    ["/listing/5/photos", "i=2", "listing/photos"],
    ["/listing/5/location", "", "listing/location"],
    ["/listing/5/market", "", "listing/market"],
    ["/listing/5/actions", "", "listing/actions"],
    ["/listing/5/actions", "step=report", "listing/report"],
    ["/listing/5/actions", "step=detail", "listing/report/detail"],
    [`/radars/${RADAR}`, "", "radar/sheet"],
    ["/radars/found", "", "radar/found"],
    ["/welcome/language", "", "welcome/language"],
    ["/welcome/city", "", "welcome/city"],
    ["/no-access", "reason=full", "no-access"],
    ["/outside", "", "outside"],
    ["/dev/ui", "", "dev/ui"],
    ["/nowhere/at/all", "", "not-found"],
    ["/filters/unknown", "", "not-found"],
    // The owner form (WP-81, fix of LB-APP-058): every address of the form, whatever lies below it.
    ["/owner/new", "", "owner/form"],
    [`/owner/${OWNER}`, "focus=price", "owner/form"],
    [`/owner/${OWNER}/place`, "first=1", "owner/form"],
    [`/owner/${OWNER}/phone`, "", "owner/form"],
    [`/owner/${OWNER}/mode`, "", "owner/form"],
    [`/owner/${OWNER}/done`, "", "owner/form"],
    ["/settings/owner", "", "owner/mine"],
    ["/owner/limit", "where=settings", "owner/limit"],
    [`/settings/owner/${OWNER}/requests`, "", "owner/requests"],
    ["/listing/10000008/requests", "", "owner/requests"],
  ])("%s?%s → %s (the new names, WP-32, LB-APP-037)", (pathname, query, expected) => {
    expect(screenNameOf(pathname, params(query))).toBe(expected);
  });

  it.each(SETTINGS_PAGES)("/settings/%s → settings/%s (every page of SETTINGS_PAGES, `cards` included)", (page) => {
    expect(screenNameOf(`/settings/${page}`, params())).toBe(`settings/${page}`);
  });

  it.each([
    // the top layer's address owns the name; the reserved parameters never change it
    ["/filters", "from=map&draw=1&pick=city&focus=pets", "filters"],
    ["/sort", "from=map", "sort"],
    ["/city", "from=map", "city"],
    ["/map", "pin=3&from=radar", "search/map"],
    ["/listing/5/photos", "i=4&from=radar", "listing/photos"],
    ["/", "step=report&draw=1", "search/list"],
  ])("%s?%s → %s (precedence of 03 §1.1; reserved parameters)", (pathname, query, expected) => {
    expect(screenNameOf(pathname, params(query))).toBe(expected);
  });
});
