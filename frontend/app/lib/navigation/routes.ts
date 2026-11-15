/**
 * The navigation vocabulary of the Mini App (WP-20, `25` §3.2): the single place where an address is spelled.
 * Builders return locale-less paths; `Link`, `useRouter` and `redirect` of `@/i18n/navigation` add the locale.
 * The pure helpers below are used by the Back logic of WP-21 and the screen names of WP-32.
 */

export type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[];
export type Query = URLSearchParams | Readonly<Record<string, QueryValue>>;

export const QUICK_FILTER_KINDS = ["rooms", "price", "owner"] as const;
export type QuickFilterKind = (typeof QUICK_FILTER_KINDS)[number];

export const SETTINGS_PAGES = ["theme", "graphics", "language", "currency", "quiet-hours", "digest", "hidden"] as const;
export type SettingsPage = (typeof SETTINGS_PAGES)[number];

/** Parameters that are never filter keys: where a sheet came from, the focused section, and the layer parameters. */
export const RESERVED_PARAMS = ["from", "focus", "pick", "draw", "pin", "step", "i"] as const;

/** Parameters that open a layer over the address they are on; Back removes them first. */
const LAYER_PARAMS = ["pick", "draw", "pin", "step"] as const;

/**
 * The 25 filter keys of the `/api/v1` filter model (`SearchFilters::KEYS`, WP-12) and `sort`: the search state a
 * sheet carries back. `@homi/search` (WP-22) owns their values and the address form.
 */
export const SEARCH_KEYS = [
  "city",
  "deal",
  "types",
  "districts",
  "rooms_min",
  "rooms_max",
  "price_min",
  "price_max",
  "zones",
  "near_metro",
  "below_median",
  "owner",
  "tenant",
  "pets",
  "pets_only",
  "furnished",
  "renovation",
  "floor_not_first",
  "floor_not_last",
  "area_min",
  "area_max",
  "market",
  "appliances",
  "posted_days",
  "polygon",
  "sort",
] as const;

function withQuery(path: string, query?: Query): string {
  if (!query) {
    return path;
  }
  const search = new URLSearchParams();
  const entries: Iterable<[string, QueryValue]> = query instanceof URLSearchParams ? query.entries() : Object.entries(query);
  for (const [key, value] of entries) {
    if (value === null || value === undefined) {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      search.append(key, String(item));
    }
  }
  const text = search.toString();
  return text ? `${path}?${text}` : path;
}

export const routes = {
  feed: (q?: Query) => withQuery("/", q),
  map: (q?: Query) => withQuery("/map", q),
  filters: (q?: Query) => withQuery("/filters", q),
  quickFilter: (kind: QuickFilterKind, q?: Query) => withQuery(`/filters/${kind}`, q),
  sort: (q?: Query) => withQuery("/sort", q),
  city: (q?: Query) => withQuery("/city", q),
  listing: (number: number) => `/listing/${number}`,
  listingPhotos: (number: number, index?: number) => withQuery(`/listing/${number}/photos`, { i: index }),
  listingLocation: (number: number) => `/listing/${number}/location`,
  listingMarket: (number: number) => `/listing/${number}/market`,
  listingActions: (number: number) => `/listing/${number}/actions`,
  saved: () => "/saved",
  history: () => "/saved/history",
  radars: () => "/radars",
  radarNew: (q?: Query) => withQuery("/radars/new", q),
  radar: (id: string) => `/radars/${id}`,
  radarEdit: (id: string) => `/radars/${id}/edit`,
  radarFound: (q: Query) => withQuery("/radars/found", q),
  settings: () => "/settings",
  settingsPage: (name: SettingsPage) => `/settings/${name}`,
  welcomeLanguage: () => "/welcome/language",
  welcomeCity: () => "/welcome/city",
  noAccess: (reason?: string) => withQuery("/no-access", { reason }),
  outside: () => "/outside",
} as const;

/** A listing number in an address: a positive integer without a sign or leading zero. */
export function isListingNumber(value: string): boolean {
  return /^[1-9]\d*$/.test(value) && Number(value) <= Number.MAX_SAFE_INTEGER;
}

/** A radar id: a ULID, 26 characters of Crockford base32 (the WP-13 contract). */
export function isRadarId(value: string): boolean {
  return /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i.test(value);
}

export function isQuickFilterKind(value: string): value is QuickFilterKind {
  return (QUICK_FILTER_KINDS as readonly string[]).includes(value);
}

export function isSettingsPage(value: string): value is SettingsPage {
  return (SETTINGS_PAGES as readonly string[]).includes(value);
}

/** The segments of a locale-less pathname: `/listing/5/` → `["listing", "5"]`. */
function segmentsOf(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

type Match =
  | { route: "feed" | "map" | "saved" | "history" | "radars" | "settings" }
  | { route: "filters" | "sort" | "city" }
  | { route: "quickFilter"; kind: QuickFilterKind }
  | { route: "listing"; number: string; child: "photos" | "location" | "market" | "actions" | null }
  | { route: "radarNew" | "radarFound" }
  | { route: "radar"; id: string; edit: boolean }
  | { route: "settingsPage" }
  | { route: "gate" }
  | { route: "unknown"; pattern: string };

const LISTING_CHILDREN = ["photos", "location", "market", "actions"] as const;

function match(pathname: string): Match {
  const s = segmentsOf(pathname);
  const path = `/${s.join("/")}`;
  switch (path) {
    case "/":
      return { route: "feed" };
    case "/map":
      return { route: "map" };
    case "/saved":
      return { route: "saved" };
    case "/saved/history":
      return { route: "history" };
    case "/radars":
      return { route: "radars" };
    case "/settings":
      return { route: "settings" };
    case "/filters":
    case "/sort":
    case "/city":
      return { route: s[0] as "filters" | "sort" | "city" };
    case "/radars/new":
      return { route: "radarNew" };
    case "/radars/found":
      return { route: "radarFound" };
    case "/welcome/language":
    case "/welcome/city":
    case "/no-access":
    case "/outside":
      return { route: "gate" };
  }
  if (s[0] === "filters" && s.length === 2) {
    return isQuickFilterKind(s[1]) ? { route: "quickFilter", kind: s[1] } : { route: "unknown", pattern: "/filters/[kind]" };
  }
  if (s[0] === "listing" && isListingNumber(s[1] ?? "")) {
    if (s.length === 2) {
      return { route: "listing", number: s[1], child: null };
    }
    const child = LISTING_CHILDREN.find((name) => name === s[2]);
    if (s.length === 3 && child) {
      return { route: "listing", number: s[1], child };
    }
  }
  if (s[0] === "radars" && isRadarId(s[1] ?? "") && (s.length === 2 || (s.length === 3 && s[2] === "edit"))) {
    return { route: "radar", id: s[1], edit: s.length === 3 };
  }
  if (s[0] === "settings" && s.length === 2 && isSettingsPage(s[1])) {
    return { route: "settingsPage" };
  }
  return { route: "unknown", pattern: path };
}

/** True for the six addresses of the tab bar and the list/map switch, which have no Back. */
export function isRootTab(pathname: string): boolean {
  return ["feed", "map", "saved", "history", "radars", "settings"].includes(match(pathname).route);
}

/** The parameters without the reserved ones. */
export function searchStateOf(searchParams: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  for (const [key, value] of searchParams) {
    if (!(RESERVED_PARAMS as readonly string[]).includes(key)) {
      out.append(key, value);
    }
  }
  return out;
}

function searchKeysOf(searchParams: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  for (const [key, value] of searchStateOf(searchParams)) {
    if ((SEARCH_KEYS as readonly string[]).includes(key.replace(/\[\]$/, ""))) {
      out.append(key, value);
    }
  }
  return out;
}

/**
 * Where Back goes from an address that has no history behind it (a direct load), or `null` (WP-20):
 * (1) a layer parameter is removed first (`step=detail` steps back to `step=report`);
 * (2) a search sheet returns to the map when it came from there, else to the feed, with the search state only;
 * (3) a pushed screen or its layer returns to its parent;
 * (4) root tabs, gates and unknown addresses have none.
 */
export function parentOf(pathname: string, searchParams: URLSearchParams): string | null {
  const path = `/${segmentsOf(pathname).join("/")}`;
  const layer = LAYER_PARAMS.find((name) => searchParams.has(name));
  if (layer) {
    const next = new URLSearchParams(searchParams);
    if (layer === "step" && next.get("step") === "detail") {
      next.set("step", "report");
    } else {
      next.delete(layer);
    }
    return withQuery(path, next);
  }

  const matched = match(pathname);
  switch (matched.route) {
    case "filters":
    case "sort":
    case "city":
    case "quickFilter":
      return withQuery(searchParams.get("from") === "map" ? "/map" : "/", searchKeysOf(searchParams));
    case "listing":
      return matched.child ? routes.listing(Number(matched.number)) : routes.feed();
    case "radarNew":
    case "radarFound":
      return routes.radars();
    case "radar":
      return matched.edit ? routes.radar(matched.id) : routes.radars();
    case "settingsPage":
      return routes.settings();
    default:
      return null;
  }
}

/**
 * The legacy analytics screen name of an address (`03` §3.3, precedence of §1.1: listing > radar/edit > radar/new >
 * filters > filters/<kind> > sort > city > map/draw > tab screen). A layer without a name of its own reports the tab
 * below it; an address the legacy table does not name returns its route pattern until WP-32 completes the table.
 */
export function screenNameOf(pathname: string, searchParams: URLSearchParams): string {
  const matched = match(pathname);
  switch (matched.route) {
    case "listing":
      return "listing";
    case "radar":
      return matched.edit ? "radar/edit" : "subs";
    case "radarNew":
      return "radar/new";
    case "filters":
    case "sort":
    case "city":
      return matched.route;
    case "quickFilter":
      return `filters/${matched.kind}`;
    case "map":
      return searchParams.get("draw") === "1" ? "map/draw" : "search/map";
    case "feed":
      return "search/list";
    case "saved":
      return "saved/favorites";
    case "history":
      return "saved/history";
    case "radars":
    case "radarFound":
      return "subs";
    case "settings":
    case "settingsPage":
      return "settings";
    case "gate":
      return `/${segmentsOf(pathname).join("/")}`;
    case "unknown":
      return matched.pattern;
  }
}
