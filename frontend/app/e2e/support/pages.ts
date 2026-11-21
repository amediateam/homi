/**
 * Every address of the Mini App with what the passes over all addresses need (WP-33 `e2e/coverage/`): the screens it
 * shows (`docs/migration/data/screens.json`), the element that proves it rendered, where Back goes after a direct load
 * (`parentOf` of `lib/navigation/routes.ts`), and the stub scenario its state needs. Addresses are written without the
 * locale; the passes put the project's in front.
 */
export interface AppPage {
  path: string;
  screens: readonly string[];
  /** A locator of the address's own content; `[data-route="…"]` unless the screen has none. */
  shows: string;
  /** Where Back goes from a direct load; `null` for a root tab or a gate. */
  parent: string | null;
  scenario?: string;
  /** The listing layer's or a sheet's address over a base, or a screen of its own. */
  kind: "tab" | "page" | "sheet" | "overlay" | "gate";
}

const route = (name: string) => `[data-route="${name}"]`;

/** Stub ids (WP-13, WP-80): the feed's first listing, owner listings 10000001 (request mode) and 10000008 (the user's own). */
export const LISTING = 100001;
export const OWNER_LISTING = 10000001;
export const OWN_LISTING = 10000008;
export const RADAR = "01JD0000000000000000000001";
/** Owner listings of the stub: a complete draft, the active one, the rejected one. */
export const DRAFT = "01JF0000000000000000000004";
export const ACTIVE = "01JF0000000000000000000003";
export const REJECTED = "01JF0000000000000000000009";

export const PAGES: readonly AppPage[] = [
  { path: "/", screens: ["SCR-006", "SCR-007"], shows: route("feed"), parent: null, kind: "tab" },
  { path: "/", screens: ["SCR-009"], shows: '[data-empty="feed"], [data-slot="few-note"]', parent: null, kind: "tab", scenario: "empty" },
  { path: "/map", screens: ["SCR-011"], shows: "[data-map-screen]", parent: null, kind: "tab" },
  { path: "/saved", screens: ["SCR-024"], shows: route("saved"), parent: null, kind: "tab" },
  { path: "/saved/history", screens: ["SCR-025"], shows: route("saved/history"), parent: null, kind: "tab" },
  { path: "/radars", screens: ["SCR-026"], shows: route("radars"), parent: null, kind: "tab" },
  { path: "/radars", screens: ["SCR-027"], shows: route("radars"), parent: null, kind: "tab", scenario: "empty" },
  { path: "/settings", screens: ["SCR-032"], shows: route("settings"), parent: null, kind: "tab" },
  { path: "/settings/theme", screens: ["SCR-033"], shows: route("settings/theme"), parent: "/settings", kind: "page" },
  { path: "/settings/graphics", screens: ["SCR-034"], shows: route("settings/graphics"), parent: "/settings", kind: "page" },
  { path: "/settings/language", screens: ["SCR-035"], shows: route("settings/language"), parent: "/settings", kind: "page" },
  { path: "/settings/currency", screens: ["SCR-036"], shows: route("settings/currency"), parent: "/settings", kind: "page" },
  { path: "/settings/quiet-hours", screens: ["SCR-037"], shows: route("settings/quiet-hours"), parent: "/settings", kind: "page" },
  { path: "/settings/digest", screens: ["SCR-038"], shows: route("settings/digest"), parent: "/settings", kind: "page" },
  { path: "/settings/hidden", screens: ["SCR-039"], shows: route("settings/hidden"), parent: "/settings", kind: "page" },
  { path: "/settings/cards", screens: ["SCR-048"], shows: route("settings/cards"), parent: "/settings", kind: "page" },
  { path: "/settings/owner", screens: ["SCR-057"], shows: route("owner/mine"), parent: "/settings", kind: "page" },
  { path: `/settings/owner/${ACTIVE}/requests`, screens: ["SCR-058"], shows: route("owner/requests"), parent: "/settings/owner", kind: "page" },
  { path: "/filters", screens: ["SCR-014"], shows: route("filters"), parent: "/", kind: "sheet" },
  { path: "/filters/rooms", screens: ["SCR-015"], shows: route("filters/rooms"), parent: "/", kind: "sheet" },
  { path: "/filters/price", screens: ["SCR-015"], shows: route("filters/price"), parent: "/", kind: "sheet" },
  { path: "/filters/owner", screens: ["SCR-015"], shows: route("filters/owner"), parent: "/", kind: "sheet" },
  { path: "/sort", screens: ["SCR-016"], shows: route("sort"), parent: "/", kind: "sheet" },
  { path: "/city", screens: ["SCR-017"], shows: route("city"), parent: "/", kind: "sheet" },
  { path: `/listing/${LISTING}`, screens: ["SCR-018"], shows: route("listing"), parent: "/", kind: "overlay" },
  { path: "/listing/999404", screens: ["SCR-019"], shows: route("listing"), parent: "/", kind: "overlay" },
  { path: `/listing/${LISTING}/photos`, screens: ["SCR-020"], shows: route("listing/photos"), parent: `/listing/${LISTING}`, kind: "overlay" },
  { path: `/listing/${LISTING}/location`, screens: ["SCR-021"], shows: route("listing/location"), parent: `/listing/${LISTING}`, kind: "overlay" },
  { path: `/listing/${LISTING}/market`, screens: ["SCR-022"], shows: route("listing/market"), parent: `/listing/${LISTING}`, kind: "sheet" },
  { path: `/listing/${LISTING}/actions`, screens: ["SCR-023"], shows: route("listing/actions"), parent: `/listing/${LISTING}`, kind: "sheet" },
  { path: `/listing/${OWNER_LISTING}/contact`, screens: ["SCR-061"], shows: route("listing/contact"), parent: `/listing/${OWNER_LISTING}`, kind: "sheet" },
  { path: `/listing/${OWNER_LISTING}/owner`, screens: ["SCR-062"], shows: route("listing/owner"), parent: `/listing/${OWNER_LISTING}`, kind: "sheet" },
  { path: `/listing/${OWN_LISTING}`, screens: ["SCR-059"], shows: route("listing"), parent: "/", kind: "overlay" },
  { path: `/listing/${OWN_LISTING}/requests`, screens: ["SCR-058"], shows: route("owner/requests"), parent: `/listing/${OWN_LISTING}`, kind: "sheet" },
  { path: `/radars/${RADAR}`, screens: ["SCR-028"], shows: route("radar"), parent: "/radars", kind: "sheet" },
  { path: `/radars/${RADAR}/edit`, screens: ["SCR-029"], shows: route("radar/edit"), parent: `/radars/${RADAR}`, kind: "sheet" },
  { path: "/radars/new", screens: ["SCR-030"], shows: route("radars/new"), parent: "/radars", kind: "sheet" },
  { path: "/radars/found?trigger=pause", screens: ["SCR-031"], shows: route("radars/found"), parent: "/radars", kind: "sheet" },
  { path: `/owner/${DRAFT}`, screens: ["SCR-050", "SCR-052"], shows: route("owner"), parent: "/settings", kind: "overlay" },
  { path: `/owner/${DRAFT}/place`, screens: ["SCR-051"], shows: route("owner"), parent: `/owner/${DRAFT}`, kind: "overlay" },
  { path: `/owner/${DRAFT}/phone`, screens: ["SCR-053"], shows: route("owner"), parent: `/owner/${DRAFT}`, kind: "overlay" },
  { path: `/owner/${REJECTED}/phone`, screens: ["SCR-054"], shows: route("owner"), parent: `/owner/${REJECTED}`, kind: "overlay" },
  { path: `/owner/${DRAFT}/mode`, screens: ["SCR-055"], shows: route("owner"), parent: `/owner/${DRAFT}`, kind: "overlay" },
  { path: `/owner/${DRAFT}/done`, screens: ["SCR-056"], shows: route("owner"), parent: "/settings", kind: "overlay" },
  { path: "/owner/limit", screens: ["SCR-049"], shows: route("owner/limit"), parent: "/settings", kind: "sheet" },
  { path: "/welcome/language", screens: ["SCR-004"], shows: route("welcome/language"), parent: null, kind: "gate", scenario: "first_launch" },
  { path: "/welcome/city", screens: ["SCR-005"], shows: route("welcome/city"), parent: null, kind: "gate", scenario: "no_city" },
  { path: "/no-access?reason=private", screens: ["SCR-003"], shows: route("no-access"), parent: null, kind: "gate", scenario: "access_private" },
];

/** The screens these pages show, each once. */
export const PAGE_SCREENS: readonly string[] = [...new Set(PAGES.flatMap((page) => page.screens))].sort();

/** A page's name in a test title: its address, and its scenario when it needs one. */
export const pageName = (page: AppPage) => (page.scenario ? `${page.path} (${page.scenario})` : page.path);
