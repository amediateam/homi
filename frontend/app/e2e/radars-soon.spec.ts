import { defaultFilters, filtersHash, fromSearchParams } from "@homi/search";
import { expect, launchApp, type LaunchedApp, setScenario, stubMedia, test as base } from "@homi/testing/playwright";
import type { Page, Request } from "@playwright/test";

/**
 * Radars switched off end to end (WP-30, DEC-51), in cookie and header mode, against an API whose env has
 * `RADAR_CREATION_ENABLED=false`: `radars_enabled` is HOMI's configuration, read from the cached reference data, which
 * never carries the stub scenario cookie (WP-22), so the switch is the API's env value and not a scenario. These tests
 * are tagged `@radars-off` and run only with `E2E_RADARS_OFF=1` (`frontend/playwright.config.ts`): CI's second
 * end-to-end step starts such an API and builds the app again against it, so the reference cache starts empty. Locally:
 * the key set to `false` in the backend's env file, `make dev-start`, then `E2E_RADARS_OFF=1 E2E_BASE_URL=…`.
 *
 * The cases of the spec's `radars-soon` bullet: the «Радар» tab shows «Радар скоро заработает» with its second line,
 * no button and no «+»; a direct load of `/radars/new` and of a fixture radar's sheet ends on `/radars` with no sheet;
 * the few-results note (scenario `few`) has no radar button; the filters footer has no «Включить радар»; applying
 * custom filters brings no follow nudge and no flow read within 3 s; with `homi-visits` seeded 7 h back there is no
 * return banner and no `GET /listings/new`, while the visit is still recorded; the feed has no radar card after its 8th
 * card. Every test also checks that the page sent no `/bff/radars` read and no Server Action at all (the radar writes
 * are Server Actions, and nothing else here sends one). The custom search `rooms 2–2` is the one no fixture radar of
 * WP-13 covers, so with radars on it would get the follow nudge, the return banner and the radar card. Every photo is
 * answered by `stubMedia`.
 */

/** Requests the switched-off state must never send: radar list reads and Server Actions. */
interface RadarTraffic {
  reads: string[];
  actions: string[];
}

/** A Server Action call: a POST to the page's address carrying the `Next-Action` header. */
const isServerAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;
/** A radar list read through the app server's pass-through, with or without `include=previews`. */
const isRadarRead = (request: Request) => /^\/bff\/radars(\/|$)/.test(new URL(request.url()).pathname);

const test = base.extend<{ photos: readonly string[]; radarTraffic: RadarTraffic }>({
  /** The stub photos answered so far: every test answers them itself, as CI has no `cdn.homi.loc`. */
  photos: [async ({ page }, use) => use(await stubMedia(page)), { auto: true }],
  /** Recorded from before the launch; the test fails at its end if any radar read or Server Action was sent. */
  radarTraffic: [
    async ({ page }, use) => {
      const traffic: RadarTraffic = { reads: [], actions: [] };
      page.on("request", (request) => {
        if (isRadarRead(request)) {
          traffic.reads.push(request.url());
        }
        if (isServerAction(request)) {
          traffic.actions.push(`${request.url()} ${request.postData() ?? ""}`);
        }
      });
      await use(traffic);
      expect(traffic.reads, "radar list reads while radars are switched off").toEqual([]);
      expect(traffic.actions, "any Server Action while radars are switched off (no flow here sends one but the radar writes)").toEqual([]);
    },
    { auto: true },
  ],
});

type Mode = "cookie" | "header";

/** A fixture radar of WP-13 (`radars/list.json`, active, instant). */
const FIXTURE_RADAR = "01JD0000000000000000000001";
/** A custom search that no fixture radar covers (33 listings on stubs, 8 of them new). */
const CUSTOM = "rooms_min=2&rooms_max=2";
const HOUR = 3_600_000;

/**
 * The visible copy only: with `cacheComponents` the router keeps earlier routes hidden in `<Activity>`
 * (`preserving-ui-state.md`), so the same element can be in the document twice.
 */
const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const html = (page: Page) => page.locator("html");
const cards = (page: Page) => visible(page, "article[data-listing]");
const chip = (page: Page, key: string) => visible(page, `[data-topbar="search-list"] [data-chip="${key}"]`);
/** The intercepted copy of a sheet address, inside its bottom sheet. */
const sheet = (page: Page, name: string) => visible(page, `[data-slot="bottom-sheet"] [data-route="${name}"][data-layer="sheet"]`);
/** Every nudge above the tab bar: the follow nudge, the return banner (and WP-31's home offer). */
const nudges = (page: Page) => page.locator("[data-nudge]");
/** The radar card of the search list (SCR-047), hidden copies included. */
const feedRadar = (page: Page) => page.locator('[data-slot="feed-radar"]');
/** The search keys of the current address. */
const searchOf = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams);

/** Collects the page's requests that `match` from now on. */
function recordRequests(page: Page, match: (request: Request) => boolean): Request[] {
  const seen: Request[] = [];
  page.on("request", (request) => {
    if (match(request)) {
      seen.push(request);
    }
  });
  return seen;
}

/** Launches the app as the bot does, in a session mode, and waits for the session. */
async function open(page: Page, mode: Mode, path = "/"): Promise<LaunchedApp> {
  const app = await launchApp(page, { mode, path });
  await expect(html(page)).toHaveAttribute("data-session", "ready");
  return app;
}

/** Nothing for `ms`: the follow nudge waits 1.8 s, the return banner 1.8 s plus its read, so 3 s covers both. */
const quietFor = (page: Page, ms: number) => page.waitForTimeout(ms);

/** The radar tab in the «soon» state: the icon, both texts, no button, no tile, no spinner, and no «+» above it. */
async function showsSoon(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/ru\/radars$/);
  const soon = visible(page, '[data-route="radars"] [data-radar-state="soon"]');
  await expect(soon).toBeVisible();
  await expect(soon.getByRole("heading", { level: 2 })).toHaveText("Радар скоро заработает");
  await expect(soon.locator("p")).toHaveText("Мы включим уведомления о новых объявлениях в ближайшее время.");
  await expect(soon.locator("button, a")).toHaveCount(0);
  await expect(soon.locator("[data-radar-animation]")).toHaveCount(0);
  await expect(visible(page, "[data-radar-tile]")).toHaveCount(0);
  await expect(visible(page, '[data-radar-state="loading"]')).toHaveCount(0);

  const bar = visible(page, '[data-topbar="radars"]');
  await expect(bar.getByRole("heading", { level: 1 })).toHaveText("Радар");
  await expect(bar.locator("a, button")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Новый радар" })).toHaveCount(0);
  // The tab itself stays in the tab bar (DEC-51).
  await expect(visible(page, '[data-tab="radars"]')).toHaveAttribute("aria-current", "page");
}

for (const mode of ["cookie", "header"] as const) {
  test.describe(`radars switched off (${mode} mode) @radars-off`, () => {
    test("the «Радар» tab shows «Радар скоро заработает» with its second line, no button and no «+»; a reload too", { annotation: [{ type: "screen", description: "SCR-026" }] }, async ({ page }) => {
      await open(page, mode);
      await expect(cards(page).first()).toBeVisible();

      await visible(page, '[data-tab="radars"]').click();
      await showsSoon(page);

      // A direct load: the server part reads the cached reference data and renders the same state.
      await page.reload();
      await expect(html(page)).toHaveAttribute("data-session", "ready");
      await showsSoon(page);
    });

    for (const [name, path] of [
      ["the new-radar sheet", "/radars/new"],
      ["a fixture radar's sheet", `/radars/${FIXTURE_RADAR}`],
    ] as const) {
      test(`a direct load of ${name} (${path}) ends on /radars with no sheet`, { annotation: [{ type: "screen", description: "SCR-026" }] }, async ({ page }) => {
        await open(page, mode, path);

        await showsSoon(page);
        await expect(visible(page, '[data-slot="bottom-sheet"]')).toHaveCount(0);
        await expect(page.getByRole("dialog")).toHaveCount(0);
      });
    }

    test("a short feed (scenario few) shows the few-results note without «Включить радар по этому поиску»", { annotation: [{ type: "screen", description: "SCR-009" }] }, async ({ page }) => {
      // `few` is not a reserved scenario, so the sign-in still works with it; cookie mode's server render needs it.
      await setScenario(page, "few");
      await open(page, mode);

      const note = visible(page, '[data-slot="few-note"]');
      await expect(note).toBeVisible();
      await expect(cards(page)).toHaveCount(5);
      // The note's actions rendered (another city is offered), only the radar button is missing.
      await expect(note.locator('[data-few="city"]')).toBeVisible();
      await expect(note.locator('[data-few="radar"]')).toHaveCount(0);
      await expect(note.getByText("Включить радар по этому поиску")).toHaveCount(0);
      await expect(feedRadar(page)).toHaveCount(0);
      await setScenario(page, null);
    });

    test("the filters footer has no «Включить радар»; applying custom filters shows no nudge and reads no flow within 3 s", { annotation: [{ type: "screen", description: "SCR-014" }] }, async ({ page }) => {
      await open(page, mode);
      await expect(cards(page).first()).toBeVisible();

      await chip(page, "filters").click();
      const filters = sheet(page, "filters");
      await expect(filters).toBeVisible();
      const footer = visible(page, '[data-slot="bottom-sheet"] [data-slot="filters-footer"]');
      await expect(footer.locator('[data-action="apply"]')).toBeVisible();
      await expect(footer.locator('[data-action="subscribe"]')).toHaveCount(0);
      await expect(footer.locator('[data-state="radar-on"]')).toHaveCount(0);
      await expect(footer.getByText("Включить радар")).toHaveCount(0);

      // The sheet's own forecast reads the flow of the draft; the apply waits for that read, so a later one is not it.
      const draftFlow = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === "/bff/listings/flow" && url.searchParams.get("rooms_min") === "2" && url.searchParams.get("rooms_max") === "2";
      });
      await filters.locator('[data-section="rooms"]').getByRole("button", { name: "2", exact: true }).click();
      await draftFlow;
      await expect(footer.locator('[data-action="subscribe"]')).toHaveCount(0);
      await footer.locator('[data-action="apply"]').click();

      await expect.poll(() => ({ pathname: new URL(page.url()).pathname, search: searchOf(page) })).toEqual({
        pathname: "/ru",
        search: { city: "tashkent", rooms_min: "2", rooms_max: "2" },
      });
      await expect(visible(page, "[data-layer]")).toHaveCount(0);
      const flows = recordRequests(page, (request) => new URL(request.url()).pathname === "/bff/listings/flow");
      await expect(cards(page).first()).toBeVisible();

      // With radars on, the follow nudge reads the flow of these filters after 1.8 s and shows its card.
      await quietFor(page, 3_000);
      await expect(nudges(page)).toHaveCount(0);
      expect(flows.map((request) => request.url())).toEqual([]);
    });

    test("with homi-visits seeded 7 h back, no return banner and no /bff/listings/new; the visit is still recorded", async ({ page }) => {
      const custom = filtersHash(fromSearchParams(new URLSearchParams(`city=tashkent&${CUSTOM}`)).filters);
      const plain = filtersHash(defaultFilters("rent_long", "tashkent"));
      const seeded = Date.now() - 7 * HOUR;
      await page.addInitScript(
        ({ visits }) => {
          window.localStorage.setItem("homi-visits", JSON.stringify(visits));
        },
        { visits: { [custom]: seeded, [plain]: seeded } },
      );
      const newReads = recordRequests(page, (request) => new URL(request.url()).pathname === "/bff/listings/new");

      await open(page, mode, `/?city=tashkent&${CUSTOM}`);
      await expect(cards(page).first()).toBeVisible();
      // The visit of this search is recorded under the seeded hash (so the seed was the app's own key) …
      await expect
        .poll(async () => JSON.parse((await page.evaluate(() => window.localStorage.getItem("homi-visits"))) ?? "{}") as Record<string, number>)
        .toEqual({ [custom]: expect.any(Number), [plain]: seeded });
      const stored = JSON.parse((await page.evaluate(() => window.localStorage.getItem("homi-visits"))) ?? "{}") as Record<string, number>;
      expect(stored[custom]).toBeGreaterThan(seeded + 6 * HOUR);

      // … but the return check never runs: no wait, no read, nothing rendered.
      await quietFor(page, 3_000);
      await expect(nudges(page)).toHaveCount(0);
      expect(newReads.map((request) => request.url())).toEqual([]);
    });

    test("the feed has no radar card after its 8th card, on the default search and on a custom one", async ({ page }) => {
      await open(page, mode);
      await expect(cards(page)).toHaveCount(20);
      await cards(page).nth(9).scrollIntoViewIfNeeded();
      await expect(feedRadar(page)).toHaveCount(0);

      // The custom search: with radars on, no fixture radar covers it and the card would follow its 8th card.
      await chip(page, "rooms").click();
      const rooms = sheet(page, "filters/rooms");
      await expect(rooms).toBeVisible();
      await rooms.getByRole("button", { name: "2", exact: true }).click();
      await visible(page, '[data-slot="bottom-sheet"] [data-action="apply"]').click();
      await expect.poll(() => searchOf(page)).toEqual({ city: "tashkent", rooms_min: "2", rooms_max: "2" });
      await expect(visible(page, "[data-layer]")).toHaveCount(0);
      await expect(cards(page)).toHaveCount(20);
      await cards(page).nth(9).scrollIntoViewIfNeeded();
      await expect(feedRadar(page)).toHaveCount(0);
      // Past the follow nudge's wait as well: still no card and no nudge.
      await quietFor(page, 2_500);
      await expect(feedRadar(page)).toHaveCount(0);
      await expect(nudges(page)).toHaveCount(0);
    });
  });
}
