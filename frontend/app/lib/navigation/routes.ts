/**
 * The navigation vocabulary of the Mini App (WP-20, `25` §3.2): the single place where an address is spelled.
 * Builders return locale-less paths; `Link`, `useRouter` and `redirect` of `@/i18n/navigation` add the locale.
 * The pure helpers below are used by the Back logic of WP-21 and the screen names of WP-32.
 */

export type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[];
export type Query = URLSearchParams | Readonly<Record<string, QueryValue>>;

export const QUICK_FILTER_KINDS = ["rooms", "price", "owner"] as const;
export type QuickFilterKind = (typeof QUICK_FILTER_KINDS)[number];

export const SETTINGS_PAGES = ["theme", "graphics", "language", "currency", "quiet-hours", "digest", "cards", "hidden"] as const;
export type SettingsPage = (typeof SETTINGS_PAGES)[number];

/**
 * Where a new radar was asked for from a nudge (the return banner, the radar card in the feed; WP-30): the `entry` of
 * the new-radar sheet's address, which its create sends. Without one the sheet creates with `empty`.
 */
export const RADAR_NEW_ENTRIES = ["return", "feed"] as const;
export type RadarNewEntry = (typeof RADAR_NEW_ENTRIES)[number];

/** What opened the survey «Нашли жильё?» (SCR-031): a radar paused or deleted with `ask_found`. */
export const FOUND_TRIGGERS = ["pause", "delete"] as const;
export type FoundTrigger = (typeof FOUND_TRIGGERS)[number];

/**
 * Parameters that are never filter keys: where a sheet came from, the focused section, the layer parameters, the
 * entry of a new radar, the trigger of the survey and the owner form's first placing (`first`, WP-81; not a layer
 * parameter, so `parentOf` keeps it).
 */
export const RESERVED_PARAMS = ["from", "focus", "pick", "draw", "pin", "step", "i", "entry", "trigger", "first"] as const;

/** The steps of the owner form that have an address of their own below `/owner/<id>` (WP-81). */
export const OWNER_STEPS = ["place", "phone", "mode", "done"] as const;
export type OwnerStep = (typeof OWNER_STEPS)[number];

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

/** A query as parameters, in its order; `null` and `undefined` values are left out, an array repeats its key. */
function paramsOf(query?: Query): URLSearchParams {
  const search = new URLSearchParams();
  if (!query) {
    return search;
  }
  const entries: Iterable<[string, QueryValue]> = query instanceof URLSearchParams ? query.entries() : Object.entries(query);
  for (const [key, value] of entries) {
    if (value === null || value === undefined) {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      search.append(key, String(item));
    }
  }
  return search;
}

function withQuery(path: string, query?: Query): string {
  const text = paramsOf(query).toString();
  return text ? `${path}?${text}` : path;
}

/**
 * The new-radar address: `q` (the search state the sheet starts from) with `entry` set last. A copy, never a spread:
 * `{ ...new URLSearchParams() }` is `{}`.
 */
function radarNewHref(q?: Query, entry?: RadarNewEntry): string {
  const params = paramsOf(q);
  if (entry) {
    params.set("entry", entry);
  }
  return withQuery("/radars/new", params);
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
  radarNew: (q?: Query, entry?: RadarNewEntry) => radarNewHref(q, entry),
  radar: (id: string) => `/radars/${id}`,
  radarEdit: (id: string) => `/radars/${id}/edit`,
  radarFound: (q: { trigger: FoundTrigger }) => withQuery("/radars/found", q),
  settings: () => "/settings",
  settingsPage: (name: SettingsPage) => `/settings/${name}`,
  ownerNew: () => "/owner/new",
  ownerForm: (id: string, q?: { focus?: string }) => withQuery(`/owner/${id}`, q),
  ownerPlace: (id: string, q?: { first?: 1 }) => withQuery(`/owner/${id}/place`, q),
  ownerPhone: (id: string) => `/owner/${id}/phone`,
  ownerMode: (id: string) => `/owner/${id}/mode`,
  ownerDone: (id: string) => `/owner/${id}/done`,
  ownerListings: (q?: Query) => withQuery("/settings/owner", q),
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

/** An owner listing id: a ULID, as a radar id (the WP-80 contract). */
export function isOwnerId(value: string): boolean {
  return isRadarId(value);
}

function isOwnerStep(value: string | undefined): value is OwnerStep {
  return (OWNER_STEPS as readonly string[]).includes(value ?? "");
}

export function isQuickFilterKind(value: string): value is QuickFilterKind {
  return (QUICK_FILTER_KINDS as readonly string[]).includes(value);
}

export function isSettingsPage(value: string): value is SettingsPage {
  return (SETTINGS_PAGES as readonly string[]).includes(value);
}

export function isRadarNewEntry(value: string | null | undefined): value is RadarNewEntry {
  return (RADAR_NEW_ENTRIES as readonly (string | null | undefined)[]).includes(value);
}

export function isFoundTrigger(value: string | null | undefined): value is FoundTrigger {
  return (FOUND_TRIGGERS as readonly (string | null | undefined)[]).includes(value);
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
  | { route: "ownerNew" | "ownerListings" }
  | { route: "owner"; id: string; step: OwnerStep | null }
  | { route: "gate"; gate: GateName }
  | { route: "unknown"; pattern: string };

/** The four gates (WP-23): `/welcome/language`, `/welcome/city`, `/no-access`, `/outside`. */
export type GateName = "language" | "city" | "noAccess" | "outside";

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
      return { route: "gate", gate: "language" };
    case "/welcome/city":
      return { route: "gate", gate: "city" };
    case "/no-access":
      return { route: "gate", gate: "noAccess" };
    case "/outside":
      return { route: "gate", gate: "outside" };
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
  if (path === "/settings/owner") {
    return { route: "ownerListings" };
  }
  if (path === "/owner/new") {
    return { route: "ownerNew" };
  }
  if (s[0] === "owner" && isOwnerId(s[1] ?? "") && (s.length === 2 || (s.length === 3 && isOwnerStep(s[2])))) {
    return { route: "owner", id: s[1], step: s.length === 3 ? (s[2] as OwnerStep) : null };
  }
  return { route: "unknown", pattern: path };
}

/** The route of a locale-less pathname: its kind and its parts (`gate` with the gate's name, `unknown` with its pattern). */
export type RouteMatch = Match;

/**
 * The one parser of the app's addresses (WP-23, D-S-9): the gate redirect and the shell variant read an address with
 * it, so they agree with Back and the screen names below on what the address is.
 */
export const matchRoute: (pathname: string) => RouteMatch = match;

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

/** The search state only: the filter keys and `sort` (`SEARCH_KEYS`), without reserved or foreign parameters. */
export function searchKeysOf(searchParams: URLSearchParams): URLSearchParams {
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
    case "ownerListings":
    case "ownerNew":
      return routes.settings();
    case "owner":
      // A step returns to the questionnaire; the questionnaire, the done step and the first placing close the form.
      return matched.step === "done" || matched.step === null || (matched.step === "place" && searchParams.has("first"))
        ? routes.settings()
        : routes.ownerForm(matched.id);
    default:
      return null;
  }
}

/**
 * The analytics screen name of an address (WP-32, fix of LB-APP-037; `03` §3.3, §1.1): the 16 legacy names unchanged,
 * and a name for every layer legacy never tracked, so every address reports one. The top layer's address decides, so
 * the legacy precedence (listing > radar/edit > radar/new > filters > filters/<kind> > sort > city > map/draw > tab)
 * follows from the address. Of the search parameters only `draw` and `step` count; `from`, `focus`, `pick`, `pin` and
 * `i` never change a name. The map's selection card has no address: it pushes `map/card` (`useScreenLayer`).
 */
export function screenNameOf(pathname: string, searchParams: URLSearchParams): string {
  const matched = match(pathname);
  switch (matched.route) {
    case "listing": {
      if (matched.child === "actions") {
        const step = searchParams.get("step");
        return step === "report" ? "listing/report" : step === "detail" ? "listing/report/detail" : "listing/actions";
      }
      return matched.child === null ? "listing" : `listing/${matched.child}`;
    }
    case "radar":
      return matched.edit ? "radar/edit" : "radar/sheet";
    case "radarNew":
      return "radar/new";
    case "radarFound":
      return "radar/found";
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
      return "subs";
    case "settings":
      return "settings";
    case "settingsPage":
      return `settings/${segmentsOf(pathname)[1]}`;
    case "ownerNew":
    case "owner":
      // Every address of the form, so a form opened from the owner panel reports the form (fix of LB-APP-058).
      return "owner/form";
    case "ownerListings":
      return "owner/mine";
    case "gate":
      return { language: "welcome/language", city: "welcome/city", noAccess: "no-access", outside: "outside" }[matched.gate];
    case "unknown":
      return segmentsOf(pathname).join("/") === "dev/ui" ? "dev/ui" : "not-found";
  }
}
