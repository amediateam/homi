import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { activeTabOf, isLayerAddress, type ShellVariant, shellVariantOf } from "@/features/shell/shellVariant";
import { matchRoute, routes, SETTINGS_PAGES } from "@/lib/navigation/routes";

const RADAR = "01JD7K3QZ8V6R3M2N4P5Q6R7S8";
const params = (query = "") => new URLSearchParams(query);

/** Every route of `25` §3.2 (and its search-sheet and map layer cases) with the variant the shell draws. */
const ROUTES: [pathname: string, query: string, variant: ShellVariant][] = [
  [routes.feed(), "", "search-list"],
  [routes.feed(), "city=tashkent&deal=sale&sort=cheap", "search-list"],
  [routes.map(), "", "map"],
  [routes.map(), "city=tashkent&polygon=1,2", "map"],
  [routes.map(), "draw=1", "map-drawing"],
  [routes.map(), "city=tashkent&draw=1", "map-drawing"],
  [routes.map(), "draw=0", "map"],
  [routes.map(), "pin=5", "map"],
  [routes.filters(), "", "search-list"],
  [routes.filters(), "focus=pets", "search-list"],
  [routes.filters(), "from=map", "map"],
  [routes.filters(), "from=map&city=x", "map"],
  [routes.quickFilter("rooms"), "", "search-list"],
  [routes.quickFilter("price"), "from=map", "map"],
  [routes.quickFilter("owner"), "from=list", "search-list"],
  [routes.sort(), "", "search-list"],
  [routes.sort(), "from=map", "map"],
  [routes.city(), "", "search-list"],
  [routes.city(), "from=map", "map"],
  [routes.listing(42), "", "none"],
  [routes.listingPhotos(42), "i=2", "none"],
  [routes.listingLocation(42), "", "none"],
  [routes.listingMarket(42), "", "none"],
  [routes.listingActions(42), "step=detail", "none"],
  [routes.saved(), "", "saved"],
  [routes.history(), "", "saved"],
  [routes.radars(), "", "radars"],
  [routes.radarNew(), "city=x", "radars"],
  [routes.radar(RADAR), "", "radars"],
  [routes.radarEdit(RADAR), "", "radars"],
  [routes.radarFound({ radar: RADAR }).split("?")[0], `radar=${RADAR}`, "radars"],
  [routes.settings(), "", "settings"],
  ...SETTINGS_PAGES.map((page): [string, string, ShellVariant] => [routes.settingsPage(page), "", "settings"]),
  [routes.welcomeLanguage(), "", "none"],
  [routes.welcomeCity(), "", "none"],
  [routes.noAccess(), "reason=full", "none"],
  [routes.outside(), "", "none"],
  ["/dev/ui", "", "none"],
  ["/nothing/here", "", "none"],
  ["/listing/0", "", "none"],
  ["/filters/unknown", "", "none"],
];

describe("shellVariantOf (D-SH-1)", () => {
  it.each(ROUTES)("%s?%s → %s", (pathname, query, variant) => {
    expect(shellVariantOf(pathname, params(query))).toBe(variant);
  });

  it("ignores a trailing slash, as the route matcher does", () => {
    expect(shellVariantOf("/saved/history/", params())).toBe("saved");
    expect(shellVariantOf("/map/", params("draw=1"))).toBe("map-drawing");
  });

  it("covers every route kind of the matcher", () => {
    const kinds = new Set(ROUTES.map(([pathname]) => matchRoute(pathname).route));
    expect([...kinds].sort()).toEqual(
      [
        "city",
        "feed",
        "filters",
        "gate",
        "history",
        "listing",
        "map",
        "quickFilter",
        "radar",
        "radarFound",
        "radarNew",
        "radars",
        "saved",
        "settings",
        "settingsPage",
        "sort",
        "unknown",
      ].sort(),
    );
  });
});

describe("isLayerAddress", () => {
  it("is true for the addresses the @sheet and @overlay slots intercept", () => {
    for (const pathname of [
      routes.filters(),
      routes.quickFilter("price"),
      routes.sort(),
      routes.city(),
      routes.listing(42),
      routes.listingPhotos(42).split("?")[0],
      routes.listingLocation(42),
      routes.listingMarket(42),
      routes.listingActions(42),
      routes.radarNew(),
      routes.radarFound({ radar: RADAR }).split("?")[0],
      routes.radar(RADAR),
      routes.radarEdit(RADAR),
    ]) {
      expect(isLayerAddress(pathname), pathname).toBe(true);
    }
  });

  it("is false for the pages: the tabs, their screens, the gates and unknown addresses", () => {
    for (const pathname of [
      routes.feed(),
      routes.map(),
      routes.saved(),
      routes.history(),
      routes.radars(),
      routes.settings(),
      ...SETTINGS_PAGES.map((page) => routes.settingsPage(page)),
      routes.welcomeLanguage(),
      routes.welcomeCity(),
      routes.noAccess(),
      routes.outside(),
      "/dev/ui",
      "/nothing/here",
      "/listing/0",
    ]) {
      expect(isLayerAddress(pathname), pathname).toBe(false);
    }
  });

  it("covers every intercepting route of the file tree: a new one must be added here and above", () => {
    const root = join(import.meta.dirname, "../../app/[locale]/(main)");
    const intercepted = ["@sheet", "@overlay"].flatMap((slot) =>
      readdirSync(join(root, slot)).filter((name) => name.startsWith("(.)")).map((name) => name.slice(3)),
    );
    expect(intercepted.sort()).toEqual(["city", "filters", "listing", "radars", "sort"]);
  });
});

describe("activeTabOf", () => {
  it.each<[ShellVariant, ReturnType<typeof activeTabOf>]>([
    ["search-list", "search"],
    ["map", "search"],
    ["map-drawing", "search"],
    ["saved", "saved"],
    ["radars", "radars"],
    ["settings", "settings"],
    ["none", null],
  ])("%s → %s", (variant, tab) => {
    expect(activeTabOf(variant)).toBe(tab);
  });
});

describe("matchRoute (D-S-9)", () => {
  it("tells the gates, the listing and unknown addresses apart", () => {
    expect(matchRoute("/welcome/city").route).toBe("gate");
    expect(matchRoute("/no-access").route).toBe("gate");
    expect(matchRoute("/listing/42/photos")).toEqual({ route: "listing", number: "42", child: "photos" });
    expect(matchRoute("/filters/xyz")).toEqual({ route: "unknown", pattern: "/filters/[kind]" });
  });
});
