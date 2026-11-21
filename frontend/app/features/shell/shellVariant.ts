import { matchRoute } from "@/lib/navigation/routes";

/**
 * What the shell draws around an address (SCR-006): the top-bar variant, and with it the tab bar, the toggle and the
 * mini title. `none` draws no chrome: a listing loaded directly is the page itself, and the gates, the dev gallery and
 * unknown addresses have none. A listing or a sheet opened over a page keeps that page's chrome (`isLayerAddress`).
 */
export type ShellVariant = "search-list" | "map" | "map-drawing" | "saved" | "radars" | "settings" | "none";

/** The four tabs of the tab bar, in their order (`03` §1.1: search, favourites, radar, settings). */
export type ShellTab = "search" | "saved" | "radars" | "settings";

/**
 * The shell variant of a locale-less address on its own (WP-23, D-SH-1) — what a direct load draws. The search sheets
 * (`/filters…`, `/sort`, `/city`) take the variant of the view they belong to: the map when they came from it
 * (`from=map`), else the list. The map with the `draw=1` layer is drawing. Radar and settings screens below their tab
 * keep its variant. The owner form (WP-81) draws none on a direct load; its listings page belongs to settings.
 */
export function shellVariantOf(pathname: string, searchParams: Pick<URLSearchParams, "get">): ShellVariant {
  switch (matchRoute(pathname).route) {
    case "feed":
      return "search-list";
    case "filters":
    case "quickFilter":
    case "sort":
    case "city":
      return searchParams.get("from") === "map" ? "map" : "search-list";
    case "map":
      return searchParams.get("draw") === "1" ? "map-drawing" : "map";
    case "saved":
    case "history":
      return "saved";
    case "radars":
    case "radarNew":
    case "radarFound":
    case "radar":
      return "radars";
    case "settings":
    case "settingsPage":
    case "ownerListings":
      return "settings";
    case "listing":
    case "ownerNew":
    case "owner":
    case "gate":
    case "unknown":
      return "none";
  }
}

/**
 * The addresses that the `@sheet` and `@overlay` slots of `(main)` intercept (`25` §3.2): the search sheets, the
 * listing with its children, the radar sheets and the owner form with its steps (WP-81). A soft navigation opens them
 * as a layer over the page it came from, which stays mounted below with its chrome (`AppShell` keeps that page's
 * variant); a direct load renders them as the page, and `shellVariantOf` gives the variant then.
 */
export function isLayerAddress(pathname: string): boolean {
  switch (matchRoute(pathname).route) {
    case "filters":
    case "quickFilter":
    case "sort":
    case "city":
    case "listing":
    case "radarNew":
    case "radarFound":
    case "radar":
    case "ownerNew":
    case "owner":
      return true;
    default:
      return false;
  }
}

/** The tab a variant belongs to: the list and the map are both the search tab; `none` has no tab bar. */
export function activeTabOf(variant: ShellVariant): ShellTab | null {
  switch (variant) {
    case "search-list":
    case "map":
    case "map-drawing":
      return "search";
    case "saved":
    case "radars":
    case "settings":
      return variant;
    case "none":
      return null;
  }
}
