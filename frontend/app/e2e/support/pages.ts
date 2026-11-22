/**
 * Every address of the Mini App with what the passes over all addresses need (WP-33 `e2e/coverage/`): the screens it
 * shows (`docs/migration/data/screens.json`), the element that proves the state it claims rendered, where Back goes
 * after a direct load (`parentOf` of `lib/navigation/routes.ts`), and the stub scenario its state needs. Addresses are
 * written without the locale; the passes put the project's in front.
 */
export interface AppPage {
  path: string;
  screens: readonly string[];
  /**
   * A locator of the state the entry claims: an element only that state renders, inside the address's
   * `[data-route="…"]` (the search map and the portalled place picker have their own roots). Never the route root
   * alone, which also wraps the loading and error states. The passes wait the default expect timeout, so a map's
   * markers and its `ready` status (up to 15 s) are left to the map specs.
   */
  shows: string;
  /** Where Back goes from a direct load; `null` for a root tab or a gate. */
  parent: string | null;
  scenario?: string;
  /** The listing layer's or a sheet's address over a base, or a screen of its own. */
  kind: "tab" | "page" | "sheet" | "overlay" | "gate";
}

const route = (name: string) => `[data-route="${name}"]`;

/** `parts` inside the route `name`, each part with the route as its own scope (a comma list needs one per branch). */
const inside = (name: string, ...parts: string[]) => parts.map((part) => `${route(name)} ${part}`).join(", ");

/** Stub ids (WP-13, WP-80): the feed's first listing, owner listings 10000001 (request mode) and 10000008 (the user's own). */
/**
 * How long a pass waits for an entry's element: it is the loaded state, and on a direct load in header mode the reads
 * start only after the client's sign-in (the default expect timeout of 5 s is too short for the slowest screens).
 */
export const SHOWS_TIMEOUT_MS = 15_000;

export const LISTING = 100001;
export const OWNER_LISTING = 10000001;
export const OWN_LISTING = 10000008;
export const RADAR = "01JD0000000000000000000001";
/** Owner listings of the stub: a complete draft, the active one, the rejected one. */
export const DRAFT = "01JF0000000000000000000004";
export const ACTIVE = "01JF0000000000000000000003";
export const REJECTED = "01JF0000000000000000000009";

export const PAGES: readonly AppPage[] = [
  { path: "/", screens: ["SCR-006", "SCR-007"], shows: inside("feed", '[data-feed="feed"] [data-card]'), parent: null, kind: "tab" },
  { path: "/", screens: ["SCR-009"], shows: inside("feed", '[data-empty="feed"]', '[data-slot="few-note"]'), parent: null, kind: "tab", scenario: "empty" },
  // The engine's view, not its loading state or a failed view; the points come later (`map.spec`).
  { path: "/map", screens: ["SCR-011"], shows: "[data-map-screen] [data-map-view]", parent: null, kind: "tab" },
  { path: "/saved", screens: ["SCR-024"], shows: inside("saved", '[data-feed="favorites"] [data-card]'), parent: null, kind: "tab" },
  { path: "/saved/history", screens: ["SCR-025"], shows: inside("saved/history", '[data-feed="history"] [data-card]'), parent: null, kind: "tab" },
  { path: "/radars", screens: ["SCR-026"], shows: inside("radars", "[data-radar-tile]"), parent: null, kind: "tab" },
  { path: "/radars", screens: ["SCR-027"], shows: inside("radars", '[data-radar-state="empty"]'), parent: null, kind: "tab", scenario: "empty" },
  { path: "/settings", screens: ["SCR-032"], shows: inside("settings", '[data-settings-row="theme"]'), parent: null, kind: "tab" },
  { path: "/settings/theme", screens: ["SCR-033"], shows: inside("settings/theme", '[data-slot="choice-list"]'), parent: "/settings", kind: "page" },
  { path: "/settings/graphics", screens: ["SCR-034"], shows: inside("settings/graphics", '[data-slot="choice-list"]'), parent: "/settings", kind: "page" },
  { path: "/settings/language", screens: ["SCR-035"], shows: inside("settings/language", '[data-slot="choice-list"]'), parent: "/settings", kind: "page" },
  { path: "/settings/currency", screens: ["SCR-036"], shows: inside("settings/currency", '[data-slot="choice-list"]'), parent: "/settings", kind: "page" },
  { path: "/settings/quiet-hours", screens: ["SCR-037"], shows: inside("settings/quiet-hours", '[data-slot="choice-list"]'), parent: "/settings", kind: "page" },
  { path: "/settings/digest", screens: ["SCR-038"], shows: inside("settings/digest", '[data-slot="choice-list"]'), parent: "/settings", kind: "page" },
  { path: "/settings/hidden", screens: ["SCR-039"], shows: inside("settings/hidden", "[data-hidden-listing]"), parent: "/settings", kind: "page" },
  { path: "/settings/cards", screens: ["SCR-048"], shows: inside("settings/cards", "[data-card-style-option]"), parent: "/settings", kind: "page" },
  { path: "/settings/owner", screens: ["SCR-057"], shows: inside("owner/mine", "[data-owner-card]"), parent: "/settings", kind: "page" },
  { path: `/settings/owner/${ACTIVE}/requests`, screens: ["SCR-058"], shows: inside("owner/requests", "[data-request]"), parent: "/settings/owner", kind: "page" },
  { path: "/filters", screens: ["SCR-014"], shows: inside("filters", '[data-section="deal"]'), parent: "/", kind: "sheet" },
  { path: "/filters/rooms", screens: ["SCR-015"], shows: inside("filters/rooms", "[data-rooms]"), parent: "/", kind: "sheet" },
  { path: "/filters/price", screens: ["SCR-015"], shows: inside("filters/price", '[data-section="price"]'), parent: "/", kind: "sheet" },
  { path: "/filters/owner", screens: ["SCR-015"], shows: inside("filters/owner", '[data-slot="segmented-control"]'), parent: "/", kind: "sheet" },
  { path: "/sort", screens: ["SCR-016"], shows: inside("sort", "[data-sort]"), parent: "/", kind: "sheet" },
  { path: "/city", screens: ["SCR-017"], shows: inside("city", "[data-city]"), parent: "/", kind: "sheet" },
  { path: `/listing/${LISTING}`, screens: ["SCR-018"], shows: inside("listing", '[data-listing-state="loaded"]'), parent: "/", kind: "overlay" },
  { path: "/listing/999404", screens: ["SCR-019"], shows: inside("listing", '[data-listing-state="not_found"]'), parent: "/", kind: "overlay" },
  { path: `/listing/${LISTING}/photos`, screens: ["SCR-020"], shows: inside("listing/photos", "[data-viewer-slide]"), parent: `/listing/${LISTING}`, kind: "overlay" },
  // The card needs the listing's location, not the map library (its `ready` status is `spot-map.spec`'s).
  { path: `/listing/${LISTING}/location`, screens: ["SCR-021"], shows: inside("listing/location", "[data-spot-card]"), parent: `/listing/${LISTING}`, kind: "overlay" },
  { path: `/listing/${LISTING}/market`, screens: ["SCR-022"], shows: inside("listing/market", '[data-market-paragraph="sample"]'), parent: `/listing/${LISTING}`, kind: "sheet" },
  { path: `/listing/${LISTING}/actions`, screens: ["SCR-023"], shows: `${route("listing/actions")}[data-step="menu"] [data-action-row]`, parent: `/listing/${LISTING}`, kind: "sheet" },
  { path: `/listing/${OWNER_LISTING}/contact`, screens: ["SCR-061"], shows: inside("listing/contact", "[data-who]"), parent: `/listing/${OWNER_LISTING}`, kind: "sheet" },
  { path: `/listing/${OWNER_LISTING}/owner`, screens: ["SCR-062"], shows: inside("listing/owner", "[data-owner-point]"), parent: `/listing/${OWNER_LISTING}`, kind: "sheet" },
  // The panel read (`data-owner-panel=""`), not its `loading` or `error` variant.
  { path: `/listing/${OWN_LISTING}`, screens: ["SCR-059"], shows: inside("listing", '[data-listing-state="loaded"] [data-owner-panel=""]'), parent: "/", kind: "overlay" },
  { path: `/listing/${OWN_LISTING}/requests`, screens: ["SCR-058"], shows: inside("owner/requests", "[data-request]"), parent: `/listing/${OWN_LISTING}`, kind: "sheet" },
  { path: `/radars/${RADAR}`, screens: ["SCR-028"], shows: inside("radar", "[data-radar-settings]"), parent: "/radars", kind: "sheet" },
  { path: `/radars/${RADAR}/edit`, screens: ["SCR-029"], shows: inside("radar/edit", '[data-section="deal"]'), parent: `/radars/${RADAR}`, kind: "sheet" },
  { path: "/radars/new", screens: ["SCR-030"], shows: inside("radars/new", '[data-section="deal"]'), parent: "/radars", kind: "sheet" },
  { path: "/radars/found?trigger=pause", screens: ["SCR-031"], shows: `${route("radars/found")}[data-step="ask"] [data-found]`, parent: "/radars", kind: "sheet" },
  { path: `/owner/${DRAFT}`, screens: ["SCR-050", "SCR-052"], shows: inside("owner", "[data-owner-questionnaire]"), parent: "/settings", kind: "overlay" },
  // The picker is portalled to `body`, outside the form's route; its map container, not the failed map.
  { path: `/owner/${DRAFT}/place`, screens: ["SCR-051"], shows: "[data-owner-picker]", parent: `/owner/${DRAFT}`, kind: "overlay" },
  { path: `/owner/${DRAFT}/phone`, screens: ["SCR-053"], shows: inside("owner", '[data-owner-step="phone"]'), parent: `/owner/${DRAFT}`, kind: "overlay" },
  // The phone step of a rejected listing is `RejectionState`, a step frame of its own (`data-owner-step="rejected"`).
  { path: `/owner/${REJECTED}/phone`, screens: ["SCR-054"], shows: inside("owner", '[data-owner-step="rejected"] [data-reject-reason="denied"]'), parent: `/owner/${REJECTED}`, kind: "overlay" },
  { path: `/owner/${DRAFT}/mode`, screens: ["SCR-055"], shows: inside("owner", '[data-owner-step="mode"]'), parent: `/owner/${DRAFT}`, kind: "overlay" },
  { path: `/owner/${DRAFT}/done`, screens: ["SCR-056"], shows: inside("owner", '[data-owner-step="done"]'), parent: "/settings", kind: "overlay" },
  { path: "/owner/limit", screens: ["SCR-049"], shows: inside("owner/limit", '[data-action="ok"]'), parent: "/settings", kind: "sheet" },
  { path: "/welcome/language", screens: ["SCR-004"], shows: inside("welcome/language", "[data-locale]"), parent: null, kind: "gate", scenario: "first_launch" },
  { path: "/welcome/city", screens: ["SCR-005"], shows: inside("welcome/city", "[data-city]"), parent: null, kind: "gate", scenario: "no_city" },
  { path: "/no-access?reason=private", screens: ["SCR-003"], shows: inside("no-access", '[data-screen="no-access"][data-reason="private"]'), parent: null, kind: "gate", scenario: "access_private" },
];

/** The screens these pages show, each once. */
export const PAGE_SCREENS: readonly string[] = [...new Set(PAGES.flatMap((page) => page.screens))].sort();

/** A page's name in a test title: its address, and its scenario when it needs one. */
export const pageName = (page: AppPage) => (page.scenario ? `${page.path} (${page.scenario})` : page.path);
