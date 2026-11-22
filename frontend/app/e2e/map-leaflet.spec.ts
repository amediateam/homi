import { expect, launchApp, type LaunchedApp, setScenario, stubMedia, test as base } from "@homi/testing/playwright";
import type { Page, Request } from "@playwright/test";

/**
 * The Leaflet view of the search map (WP-28 "Leaflet view", SCR-011 "Differences between engines", LB-APP-013,
 * LB-APP-020) against the API on stubs: the scenarios of `map.spec.ts` (WP-27) on the fallback engine, and what only
 * Leaflet has — the deferred basemap, the collapse-before-cluster rule and a forced GL failure. The stubs' default
 * search (Tashkent, long rent, apartments) answers `GET /listings/map` with 45 points: four addresses of eleven
 * listings each, which the fitted camera shows as four stacks, and one listing alone. Every test names the lines of
 * the spec's "Tests → End to end", "Behaviour to reproduce" and "Acceptance checklist" it covers.
 *
 * Headless Chromium passes the WebGL2 probe, so GL is the default engine (the spec expected the opposite; a recorded
 * correction): Leaflet is reached with `?map=leaflet` in the launch address (TMA-012), and the GL-failure cases start
 * on GL and break MapLibre's own WebGL2 context with an init script. Markers are the elements of `markerElements.ts`
 * inside Leaflet's `.leaflet-marker-icon.homi-icon` roots, so `locator.click()` is the tap. Leaflet keeps markers that
 * the camera leaves off the screen in the document and Playwright's `visible` does not look at the viewport, so a
 * pin is found by its number, not by a count of pins. The OpenStreetMap raster tiles are answered by the guard of
 * `@homi/testing/playwright` with a blank PNG; `stubMedia` answers the previews' photos. `?mapdebug` exposes the
 * Leaflet map as `window.homiMap` outside production (the e2e builds are `local` and `ci`): the camera, cluster and
 * locate cases read and move the camera through it.
 *
 * Answers the stubs cannot give (no points, a server error, labels with markup, listings a few metres apart) are page
 * routes on `/bff/listings/map`: registered after `launchApp` for a map opened from the feed, before it for a direct
 * launch on the map (a page route answers before the guard's context route either way). Header mode runs the core
 * path only: every map read is a browser read through `/bff`, the same in both modes once the session is ready, and
 * the full run shares one stub user's API limit (120 a minute, KI-32). The visible copy only: with `cacheComponents`
 * an earlier copy of a route can stay in the document hidden.
 *
 * The attribution is `MapScreen`'s `MapAttribution` on both engines, not Leaflet's control as the spec says; the case
 * checks what a user sees: «© OpenStreetMap» without Leaflet's prefix, opened through Telegram.
 *
 * Not automated (spec "Not automated", acceptance): two-finger pan and pinch, whole-step against fractional zoom, the
 * native permission sheet, the vector basemap with protomaps-leaflet and the in-map tile prefetch (no tile file or
 * template is hosted), the basemap made again on a theme, lite or language change, tile likeness, the Leaflet chunk
 * failing too (the chunk's name is a build hash) and its retry pill, real GPU rendering and a lite device.
 */

const test = base.extend<{ photos: readonly string[] }>({
  /** The stub photos answered so far: the card's previews show one each, and CI has no `cdn.homi.loc`. */
  photos: [async ({ page }, use) => use(await stubMedia(page)), { auto: true }],
});

interface Fake {
  emit(eventType: string): void;
}

type Mode = "cookie" | "header";

/** The launch query that picks Leaflet (TMA-012); `&mapdebug` adds `window.homiMap`. */
const LEAFLET = "?map=leaflet";
const LEAFLET_DEBUG = "?map=leaflet&mapdebug";

/** The default search's map answer of the stubs on the fitted screen: four addresses with eleven listings each. */
const STACKS = 4;
const STACK_SIZE = 11;

/** The Leaflet map's deepest zoom (`LEAFLET_MAX_ZOOM`) and the zoom a locate ends at (`LOCATE_ZOOM`). */
const MAX_ZOOM = 18;
const LOCATE_ZOOM = 15;

/** How long a new map waits for its first fit before the basemap is added (`BASEMAP_DELAY_MS`). */
const BASEMAP_DELAY_MS = 1200;

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const html = (page: Page) => page.locator("html");
const route = (page: Page, name: string) => visible(page, `[data-route="${name}"]`);
const view = (page: Page) => visible(page, '[data-map-view="leaflet"]');
const glView = (page: Page) => page.locator('[data-map-view="gl"]');
const stacks = (page: Page) => visible(page, '[data-marker="stack"]');
const spread = (page: Page) => visible(page, '[data-marker="spread"]');
const dots = (page: Page) => visible(page, '[data-marker="dot"]');
const clusters = (page: Page) => visible(page, '[data-marker="cluster"]');
const card = (page: Page) => visible(page, "[data-map-card]");
const header = (page: Page) => card(page).locator("[data-map-card-header]");
const slot = (page: Page, index: number) => card(page).locator(`[data-map-card-slot="${index}"]`);
const pill = (page: Page) => visible(page, "[data-map-status]");
const note = (page: Page) => visible(page, "[data-map-note]");
const locateButton = (page: Page) => visible(page, "[data-map-locate]");
const press = (page: Page, eventType: "backButtonClicked") =>
  page.evaluate((type) => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit(type), eventType);

/** The map's points: `GET /listings/map` through `/bff`. */
const isMapRead = (url: URL) => url.pathname === "/bff/listings/map";
/** Any preview of the card (`?preview=1`, which records no view). */
const isPreview = (url: URL) => /^\/bff\/listings\/\d+$/.test(url.pathname) && url.searchParams.get("preview") === "1";
/** The MapLibre worker, copied under `public/maplibre/<version>/`: asked for only when GL is warmed or shown. */
const isWorker = (url: URL) => /^\/maplibre\/[^/]+\/maplibre-gl-worker\.mjs$/.test(url.pathname);
/** A raster tile of the OSM fallback (`OSM_TILE_URL`), `{z}/{x}/{y}.png`. */
const OSM_TILE = /^https:\/\/tile\.openstreetmap\.org\/(\d+)\/(\d+)\/(\d+)\.png$/;

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

/** A gate a route handler waits on: `release()` lets the held requests go on. */
function gate(): { held: Promise<void>; release: () => void } {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { held, release };
}

/** Launches the app on the feed as the bot does, with `?map=leaflet`, and waits for the session and the first card. */
async function openFeed(page: Page, mode: Mode = "cookie", query = LEAFLET): Promise<LaunchedApp> {
  const app = await launchApp(page, { mode, path: `/${query}` });
  await expect(html(page)).toHaveAttribute("data-session", "ready");
  await expect(visible(page, "article[data-listing]").first()).toBeVisible();
  return app;
}

/** Switches the feed to the map with the view toggle «Карта» and waits for the Leaflet view. */
async function toMap(page: Page): Promise<void> {
  await expect(visible(page, "[data-view-toggle]")).toHaveText("Карта");
  await visible(page, "[data-view-toggle]").click();
  await expect(page).toHaveURL(/\/ru\/map\?/);
  await expect(view(page)).toBeVisible();
}

/** Launches the app on the map directly; `query` carries `?map=leaflet` (and `&mapdebug`) unless a case wants GL. */
async function openMap(page: Page, query = LEAFLET, options: Parameters<typeof launchApp>[1] = {}): Promise<LaunchedApp> {
  const app = await launchApp(page, { ...options, path: `/ru/map${query}` });
  await expect(html(page)).toHaveAttribute("data-session", "ready");
  return app;
}

/** Waits until the stub answer is drawn on Leaflet: four stacks of eleven and no status pill. */
async function stacksDrawn(page: Page): Promise<void> {
  // The first map of a page loads the library and its plugins: slow on a loaded machine.
  await expect(view(page)).toHaveClass(/(^|\s)leaflet-container(\s|$)/, { timeout: 15_000 });
  await expect(stacks(page)).toHaveCount(STACKS, { timeout: 15_000 });
  await expect(visible(page, `[data-marker="stack"][data-count="${STACK_SIZE}"]`)).toHaveCount(STACKS);
  await expect(pill(page)).toHaveCount(0);
}

/** The listing numbers of the spread pins, in the stack's order (cheapest first), which is the card's track order. */
const spreadNumbers = (page: Page) => spread(page).evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("data-number"))));

/** The number of the active spread pin, or `null`. */
const activeSpread = (page: Page) =>
  page.evaluate(() => {
    const active = [...document.querySelectorAll('[data-marker="spread"].active')].filter((node) => node.checkVisibility());
    return active.length === 1 ? Number(active[0].getAttribute("data-number")) : active.length === 0 ? null : -1;
  });

/** Taps the stack nearest the top of the screen, so its spread pins stay clear of the card at the bottom. */
async function tapTopStack(page: Page): Promise<void> {
  const tops = await stacks(page).evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
  await stacks(page).nth(tops.indexOf(Math.min(...tops))).click();
}

/** The marker element's centre is what a tap there hits: not under the card, the top bar or another marker. */
const tappable = (page: Page, selector: string) =>
  visible(page, selector)
    .first()
    .evaluate((node) => {
      const box = node.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit !== null && node.contains(hit);
    });

/**
 * The index of a spread pin from `from` on that a tap would hit: its centre is not under the card, the top bar or
 * another pin of the spiral.
 */
const tappableSpreadIndex = (page: Page, from: number) =>
  spread(page).evaluateAll((nodes, first) => {
    for (let index = first; index < nodes.length; index += 1) {
      const box = nodes[index].getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      if (hit !== null && nodes[index].contains(hit)) {
        return index;
      }
    }
    return -1;
  }, from);

/**
 * A point of the Leaflet map that no marker, path, card or chrome covers: a tap there is a tap on the map background.
 * Leaflet's panes and tiles take no pointer events, so the hit is the map container or one of its panes.
 */
const backgroundPoint = (page: Page) =>
  page.evaluate(() => {
    const background = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      return hit !== null && hit.closest('[data-map-view="leaflet"]') !== null && hit.closest(".leaflet-marker-icon, .leaflet-interactive") === null;
    };
    for (let y = 160; y < 600; y += 20) {
      for (let x = 30; x < 360; x += 20) {
        // Keep clear of the edge of a marker: the neighbours on every side are background too.
        if (background(x, y) && [[x - 12, y], [x + 12, y], [x, y - 12], [x, y + 12]].every(([px, py]) => background(px, py))) {
          return { x, y };
        }
      }
    }
    return null;
  });

/** The stack card's track (its slots scroll sideways; each compact card has a photo strip of its own). */
const TRACK = "[data-map-card] [data-map-card-header] + [data-scroll-x]";

/**
 * Waits until the track rests on slot `index`: the snap that ends a swipe is an animation, and a slot's snap position
 * can sit a pixel off its multiple of the slot step (percentage widths), so the offset must hold still near it.
 */
const trackSettled = (page: Page, index: number) =>
  expect
    .poll(() =>
      visible(page, TRACK).evaluate(
        (track, at) =>
          new Promise<boolean>((resolve) => {
            const [first, second] = track.children;
            const step = (second as HTMLElement).offsetLeft - (first as HTMLElement).offsetLeft;
            const left = track.scrollLeft;
            setTimeout(() => resolve(track.scrollLeft === left && Math.abs(left - at * step) <= 2), 150);
          }),
        index,
      ),
    )
    .toBe(true);

/** A one-finger horizontal swipe on `selector`'s element through the CDP, as a finger on a phone. */
async function swipeLeft(page: Page, selector: string): Promise<void> {
  const box = await visible(page, selector).boundingBox();
  if (box === null) {
    throw new Error(`${selector} has no box`);
  }
  const y = box.y + box.height / 2;
  const from = { x: box.x + box.width * 0.8, y };
  const to = { x: box.x + box.width * 0.2, y };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  const steps = 12;
  for (let step = 1; step <= steps; step += 1) {
    const point = { x: from.x + ((to.x - from.x) * step) / steps, y };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** The part of Leaflet's `L.Map` the cases use through `window.homiMap` (`?mapdebug`). */
type DebugMap = {
  getCenter(): { lat: number; lng: number };
  getZoom(): number;
  setZoom(zoom: number, options?: { animate?: boolean }): void;
  setView(center: [number, number], zoom: number, options?: { animate?: boolean }): void;
  panBy(offset: [number, number], options?: { animate?: boolean }): void;
};

/** The camera of `window.homiMap`, on Leaflet's own zoom scale (the app's scale: no conversion). */
const camera = (page: Page) =>
  page.evaluate(() => {
    const map = (window as unknown as { homiMap?: DebugMap }).homiMap;
    if (map === undefined) {
      return null;
    }
    const { lat, lng } = map.getCenter();
    return { lat, lon: lng, zoom: map.getZoom() };
  });

/** Moves the camera of `window.homiMap` without an animation. */
const zoomTo = (page: Page, zoom: number) =>
  page.evaluate((to) => (window as unknown as { homiMap: DebugMap }).homiMap.setZoom(to, { animate: false }), zoom);

/**
 * Makes MapLibre's own canvas (`maplibregl-canvas`) refuse a WebGL context, so its constructor throws
 * `GPUInitializationError`; the engine probe's canvases have no class and still get one, so the rule picks GL. The
 * refusals are counted in the page.
 */
async function refuseGlContext(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const refused = { count: 0 };
    Object.assign(window, { __homiGlRefused: refused });
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if ((type === "webgl2" || type === "webgl") && this.classList.contains("maplibregl-canvas")) {
        refused.count += 1;
        return null;
      }
      return (getContext as (this: HTMLCanvasElement, ...args: unknown[]) => RenderingContext | null).call(this, type, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
}

/** How many times MapLibre's canvas was refused a context (`refuseGlContext`). */
const glRefused = (page: Page) => page.evaluate(() => (window as unknown as { __homiGlRefused: { count: number } }).__homiGlRefused.count);

/** A point of `GET /listings/map` (`MapPointResource`), as the stubs answer it. */
type MapPoint = { number: number; lat: number; lon: number; label: string; tone: string | null; priced: boolean; usd: number | null };
type MapAnswer = { success: true; data: { points: MapPoint[]; total: number }; meta: { source: string } };

/** The light haptics played so far (`HapticFeedback.impactOccurred("light")`). */
const lightHaptics = async (app: LaunchedApp) =>
  (await app.calls()).filter((call) => call.member === "HapticFeedback.impactOccurred" && call.args[0] === "light").length;

/** Marks the map's screen: a route Next renders fresh has no mark, a route it kept (`<Activity>`) still has it. */
const markMapScreen = (page: Page) => page.locator("[data-map-screen]").evaluate((node) => node.setAttribute("data-e2e-left", ""));

/**
 * Leaves the map for good and comes back to the same search (WP-37): the list, then the saved, radar and settings
 * tabs — four routes after the map, so Next drops the map's route (it keeps up to three, `preserving-ui-state.md`) —
 * then the search tab, which returns to the list, and the toggle.
 */
async function leaveMapForGood(page: Page): Promise<void> {
  await visible(page, "[data-view-toggle]").click();
  await expect(visible(page, "article[data-listing]").first()).toBeVisible();
  await throughTabs(page);
  await toMap(page);
}

/** From the list through the saved, radar and settings tabs and back to the list with the search tab. */
async function throughTabs(page: Page): Promise<void> {
  for (const tab of ["saved", "radars", "settings"]) {
    await visible(page, `[data-tab="${tab}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/ru/${tab}(?:[/?]|$)`));
  }
  await visible(page, '[data-tab="search"]').click();
  await expect(visible(page, "article[data-listing]").first()).toBeVisible();
}

/** Applies «2» in the quick rooms sheet of the list: a changed search (`filters.spec.ts`). */
async function applyTwoRooms(page: Page): Promise<void> {
  await visible(page, '[data-topbar="search-list"] [data-chip="rooms"]').click();
  const rooms = visible(page, '[data-slot="bottom-sheet"] [data-route="filters/rooms"][data-layer="sheet"]');
  await expect(rooms).toBeVisible();
  await rooms.getByRole("button", { name: "2", exact: true }).click();
  await visible(page, '[data-slot="bottom-sheet"] [data-action="apply"]').click();
  await expect(page).toHaveURL(/rooms_min=2/);
  await expect(visible(page, "[data-layer]")).toHaveCount(0);
}

for (const mode of ["cookie", "header"] as const) {
  test.describe(`map on Leaflet (${mode} mode)`, () => {
    /** WP-37 E2E on Leaflet; acceptance "A cut answer says «На карте — N самых свежих. Остальные — в списке»". */
    test("a cut answer (stub scenario map_cut) says «На карте — N самых свежих. Остальные — в списке» for 6 s", async ({ page }) => {
      await setScenario(page, "map_cut");
      await openFeed(page, mode);
      const read = page.waitForResponse((response) => isMapRead(new URL(response.url())));
      await toMap(page);
      const body = (await (await read).json()) as { data: { points: unknown[]; with_point: number } };
      const shown = body.data.points.length;
      expect(shown, "the stub cuts the answer to half of the located listings").toBeLessThan(body.data.with_point);

      await expect(note(page)).toHaveText(`На карте — ${shown} самых свежих. Остальные — в списке`);
      await expect(note(page)).toHaveCount(1);
      await expect(note(page)).toHaveCount(0, { timeout: 8_000 });
    });

    /** WP-37 E2E on Leaflet; acceptance "Leaving the map and returning with the same search keeps the camera on both engines". */
    test("the map's route dropped and the same search back: the camera is where it was left and no fit follows; a changed search fits", async ({ page }) => {
      await openFeed(page, mode, LEAFLET_DEBUG);
      await toMap(page);
      await stacksDrawn(page);
      const fitted = (await camera(page))!;
      expect(fitted, "?mapdebug exposes window.homiMap outside production").not.toBeNull();
      const left = { lat: fitted.lat + 0.004, lon: fitted.lon - 0.006, zoom: fitted.zoom - 1 };
      await page.evaluate(
        (to) => (window as unknown as { homiMap: DebugMap }).homiMap.setView([to.lat, to.lon], to.zoom, { animate: false }),
        left,
      );
      await expect.poll(async () => (await camera(page))?.zoom).toBe(left.zoom);
      await markMapScreen(page);

      const read = page.waitForResponse((response) => isMapRead(new URL(response.url())));
      await leaveMapForGood(page);
      await expect(page.locator("[data-map-screen][data-e2e-left]"), "Next re-rendered the map's route fresh").toHaveCount(0);
      await read;
      // The camera left is off the fit: only some stacks are in sight, and no pill is left.
      await expect(view(page).locator("[data-marker]").first()).toBeVisible({ timeout: 15_000 });
      await expect(pill(page)).toHaveCount(0);
      // Longer than a fit's flight: a fit after the answer would have moved the camera by now.
      await page.waitForTimeout(800);
      const back = (await camera(page))!;
      expect(back.lat).toBeCloseTo(left.lat, 5);
      expect(back.lon).toBeCloseTo(left.lon, 5);
      expect(back.zoom).toBe(left.zoom);
      // The basemap is on (that a restore puts it on without the 1.2 s wait is the unit test's, with fake timers).
      await expect(view(page).locator(".leaflet-tile-pane img").first()).toBeAttached({ timeout: BASEMAP_DELAY_MS });

      // The changed search on a fresh map: the memory holds the first search's camera, which the second does not take.
      await markMapScreen(page);
      await visible(page, "[data-view-toggle]").click();
      await expect(visible(page, "article[data-listing]").first()).toBeVisible();
      await applyTwoRooms(page);
      await throughTabs(page);
      await toMap(page);
      await expect(page.locator("[data-map-screen][data-e2e-left]"), "Next re-rendered the map's route fresh").toHaveCount(0);
      await expect
        .poll(async () => {
          const now = (await camera(page))!;
          return Math.abs(now.zoom - left.zoom) + Math.abs(now.lat - left.lat) + Math.abs(now.lon - left.lon);
        })
        .toBeGreaterThan(1e-4);
    });

    /**
     * Tests "the scenarios of `map.spec.ts` (pins, stack, card) on Leaflet"; acceptance "Non-GL profile: the map opens on
     * Leaflet; the "map unavailable" state no longer exists anywhere", "Leaflet shows the same pins, tones, stacks,
     * clusters, card … as GL", "Drawing, the Leaflet map … work on a listing opened over the feed"; WP-27 E1, E2 on
     * Leaflet: the toggle, the stack card, the listing over the map and Back to the same card.
     */
    test("?map=leaflet: the toggle opens the Leaflet map with the stub's stacks and no GL code; a card opens the listing over the map and Back returns to the same card", async ({ page }) => {
      const workers = recordRequests(page, (request) => isWorker(new URL(request.url())));
      await openFeed(page, mode);
      const reads = recordRequests(page, (request) => isMapRead(new URL(request.url())));
      await toMap(page);
      await stacksDrawn(page);
      expect(reads).toHaveLength(1);
      await expect(glView(page)).toHaveCount(0);
      await expect(page.locator("[data-map-unavailable]")).toHaveCount(0);
      await expect(page.getByText("Карта на этом устройстве пока недоступна")).toHaveCount(0);
      await expect(page.locator("[data-demo-marker]")).toBeVisible();
      await expect(visible(page, "[data-map-attribution]")).toHaveText("© OpenStreetMap");

      await tapTopStack(page);
      await expect(header(page)).toHaveText(`1 из ${STACK_SIZE}`);
      const numbers = await spreadNumbers(page);
      expect(numbers).toHaveLength(STACK_SIZE);
      // The second slot, so that the card Back must find is not the one a new tap would open.
      await swipeLeft(page, TRACK);
      await expect(header(page)).toHaveText(`2 из ${STACK_SIZE}`);
      await trackSettled(page, 1);
      await expect(slot(page, 1)).toHaveAttribute("data-status", "success");
      // The card shows the listing its preview names (a merged duplicate answers with another number).
      const listing = Number(await slot(page, 1).locator("article[data-listing]").getAttribute("data-listing"));
      const map = page.url();

      await slot(page, 1).locator("article a").first().click();
      await expect(page).toHaveURL(new RegExp(`/ru/listing/${listing}$`));
      await expect(visible(page, '[data-route="listing"][data-layer="overlay"]')).toBeVisible();

      await press(page, "backButtonClicked");
      await expect(page).toHaveURL(map);
      await expect(visible(page, '[data-route="listing"]')).toHaveCount(0);
      await expect(view(page)).toBeVisible();
      await expect(header(page)).toHaveText(`2 из ${STACK_SIZE}`);
      await trackSettled(page, 1);
      await expect(slot(page, 1).locator(`article[data-listing="${listing}"]`)).toBeVisible();
      expect(await spreadNumbers(page)).toEqual(numbers);
      expect(await activeSpread(page)).toBe(numbers[1]);
      expect(reads).toHaveLength(1);
      // Leaflet by the launch rule: neither the warm-up on the list nor the map asked for MapLibre's worker.
      expect(workers).toEqual([]);
      await expect(glView(page)).toHaveCount(0);
    });
  });
}

test.describe("map on Leaflet (cookie mode)", () => {
  /**
   * WP-27 E3 on Leaflet and the actions "Tap a stack", "Tap a spread pin", "Swipe the card track", "Tap the map
   * background"; WP-28 "Stacks spread on tap with `spreadStackLabels`"; acceptance "Leaflet shows the same … stacks …
   * card … as GL".
   */
  test("a stack spreads around a dot without overlaps; the header and the active pin follow a swipe and a spread-pin tap; a background tap closes the card", async ({ page }) => {
    await openMap(page);
    await stacksDrawn(page);
    const previews = recordRequests(page, (request) => isPreview(new URL(request.url())));

    await tapTopStack(page);
    await expect(spread(page)).toHaveCount(STACK_SIZE);
    await expect(dots(page)).toHaveCount(1);
    // The spread stack leaves the clusters: the other three stay.
    await expect(stacks(page)).toHaveCount(STACKS - 1);
    await expect(header(page)).toHaveText(`1 из ${STACK_SIZE}`);
    const numbers = await spreadNumbers(page);
    expect(await activeSpread(page)).toBe(numbers[0]);
    // The spiral lays the labels out without overlaps.
    const boxes = await spread(page).evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON() as DOMRect));
    for (const [index, a] of boxes.entries()) {
      for (const b of boxes.slice(index + 1)) {
        expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, "two spread labels overlap").toBe(true);
      }
    }
    // Only the shown slot and its neighbour read their previews.
    await expect(slot(page, 1)).toHaveAttribute("data-status", "success");
    expect(previews.map((request) => Number(new URL(request.url()).pathname.split("/").at(-1))).toSorted()).toEqual(numbers.slice(0, 2).toSorted());

    await swipeLeft(page, TRACK);
    await expect(header(page)).toHaveText(`2 из ${STACK_SIZE}`);
    // A tap during the swipe's snap is undone by the snap (map.spec): wait for it to end.
    await trackSettled(page, 1);
    await expect.poll(() => activeSpread(page)).toBe(numbers[1]);
    await expect(slot(page, 2)).toHaveAttribute("data-status", "success");

    // A spread pin moves the track to its listing; the stack stays spread.
    const index = await tappableSpreadIndex(page, 3);
    expect(index, "no spread pin is clear of the card and the top bar").toBeGreaterThan(2);
    await spread(page).nth(index).click();
    await expect(header(page)).toHaveText(`${index + 1} из ${STACK_SIZE}`);
    await expect.poll(() => activeSpread(page)).toBe(numbers[index]);
    await expect(slot(page, index)).toHaveAttribute("data-status", "success");
    await expect(spread(page)).toHaveCount(STACK_SIZE);

    const point = await backgroundPoint(page);
    expect(point, "no free point of the map").not.toBeNull();
    await page.mouse.click(point?.x ?? 0, point?.y ?? 0);
    await expect(card(page)).toHaveCount(0);
    await expect(spread(page)).toHaveCount(0);
    await expect(dots(page)).toHaveCount(0);
    await expect(stacks(page)).toHaveCount(STACKS);
  });

  /**
   * WP-27 States "Card, single" and the actions "Tap a pin", "Tap × on the card" on Leaflet; acceptance "Leaflet shows
   * the same pins … card … as GL", "Locate: … hidden while a card is open".
   */
  test("a listing alone at its address is a pin: its card has no header and its × closes it", async ({ page }) => {
    await openFeed(page);
    let number = 0;
    // One listing of the stub answer moved to the middle of the others, so it stands alone in view.
    await page.route(
      (url) => isMapRead(url),
      async (handled) => {
        const response = await handled.fetch();
        const body = (await response.json()) as MapAnswer;
        const { points } = body.data;
        points[0].lat = points.reduce((sum, item) => sum + item.lat, 0) / points.length;
        points[0].lon = points.reduce((sum, item) => sum + item.lon, 0) / points.length;
        number = points[0].number;
        await handled.fulfill({ response, json: body });
      },
    );
    await toMap(page);
    await expect.poll(() => number).toBeGreaterThan(0);
    const pin = visible(page, `[data-marker="pin"][data-number="${number}"]`);
    await expect(pin).toHaveCount(1, { timeout: 15_000 });

    await pin.click();
    await expect(card(page)).toBeVisible();
    await expect(header(page)).toHaveCount(0);
    await expect(slot(page, 0).locator(`article[data-listing="${number}"]`)).toBeVisible();
    await expect(pin).toHaveClass(/(^|\s)active(\s|$)/);
    await expect(locateButton(page)).toHaveCount(0);

    await card(page).locator("[data-map-card-close]").click();
    await expect(card(page)).toHaveCount(0);
    await expect(pin).not.toHaveClass(/(^|\s)active(\s|$)/);
    await expect(locateButton(page)).toBeVisible();
  });

  /**
   * WP-27 E4 and States "Points loading", "Error, offline", "Error, server" on Leaflet; acceptance "Leaflet shows the
   * same … loading, empty and error pills as GL".
   */
  test("listings/map pending, offline and answered 500 shows the loading pill, «Нет связи» and «Не загрузилось» with «Повторить»; a retry draws the stacks", async ({ page }) => {
    await openFeed(page);
    const held = gate();
    let failure: "offline" | "server" = "offline";
    const failing = (url: URL) => isMapRead(url);
    await page.route(failing, async (handled) => {
      await held.held;
      await (failure === "offline"
        ? handled.abort("internetdisconnected")
        : handled.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "server_error" }) }));
    });
    await toMap(page);

    await expect(pill(page)).toHaveAttribute("data-map-status", "loading");
    await expect(pill(page).getByLabel("Загружаем объявления…")).toBeVisible();
    held.release();
    await expect(pill(page)).toHaveAttribute("data-map-status", "error");
    await expect(pill(page)).toHaveAttribute("data-error", "offline");
    await expect(pill(page)).toContainText("Нет связи");
    await expect(pill(page).getByRole("button")).toHaveText("Повторить");

    failure = "server";
    await pill(page).getByRole("button", { name: "Повторить" }).click();
    await expect(pill(page)).toHaveAttribute("data-error", "server");
    await expect(pill(page)).toContainText("Не загрузилось");
    await expect(pill(page).getByRole("button")).toHaveText("Повторить");
    await expect(visible(page, "[data-marker]")).toHaveCount(0);
    await expect(view(page)).toBeVisible();

    await page.unroute(failing);
    const read = page.waitForRequest((request) => isMapRead(new URL(request.url())));
    await pill(page).getByRole("button", { name: "Повторить" }).click();
    await read;
    await stacksDrawn(page);
  });

  /** WP-27 E4 (no points) and States "Empty" on Leaflet; acceptance "Leaflet shows the same … empty … pills as GL". */
  test("an answer without points shows «Ничего не найдено в этой области»", async ({ page }) => {
    await openFeed(page);
    await page.route(
      (url) => isMapRead(url),
      (handled) => handled.fulfill({ json: { success: true, data: { points: [], total: 0 }, meta: { source: "stub" } } }),
    );
    await toMap(page);

    await expect(pill(page)).toHaveAttribute("data-map-status", "empty");
    await expect(pill(page)).toHaveText("Ничего не найдено в этой области");
    await expect(view(page)).toHaveClass(/(^|\s)leaflet-container(\s|$)/, { timeout: 15_000 });
    await expect(visible(page, "[data-marker]")).toHaveCount(0);
    await expect(note(page)).toHaveCount(0);
  });

  /** WP-27 States "Note" (BR-APP-062) on Leaflet; acceptance "Leaflet shows the same … «На карте {shown} из {total} · …» note … as GL". */
  test("an answer whose total counts a listing without a location shows «На карте … из …» for 6 s", async ({ page }) => {
    await openFeed(page);
    let shown = 0;
    // The stubs locate every listing: the answer's total counts one more, which only its district places.
    await page.route(
      (url) => isMapRead(url),
      async (handled) => {
        const response = await handled.fetch();
        const body = (await response.json()) as MapAnswer;
        shown = body.data.points.length;
        body.data.total = shown + 1;
        await handled.fulfill({ response, json: body });
      },
    );
    await toMap(page);
    await stacksDrawn(page);

    await expect(note(page)).toHaveText(`На карте ${shown} из ${shown + 1} · у 1 объявления известен только район`);
    await expect(note(page)).toHaveCount(0, { timeout: 8_000 });
  });

  /**
   * WP-27 "Tap a cluster below maximum zoom" on Leaflet: markercluster with `maxClusterRadius` 48 (WP-28 "Listings
   * layer"); acceptance "Leaflet shows the same … clusters … as GL". A cluster counts listings, not groups: zoomed out
   * through `window.homiMap`, the clusters count all 45 points; a tap plays a light haptic and zooms in until they
   * come apart.
   */
  test("zoomed out, the listings form clusters that count them all; a tap on one zooms in until it comes apart", async ({ page }) => {
    const answer = page.waitForResponse((response) => isMapRead(new URL(response.url())));
    const app = await openMap(page, LEAFLET_DEBUG);
    await stacksDrawn(page);
    const { data } = (await (await answer).json()) as MapAnswer;

    await zoomTo(page, 7);
    await expect(clusters(page).first()).toBeVisible();
    await expect(stacks(page)).toHaveCount(0);
    const counts = await clusters(page).evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("data-count"))));
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(data.points.length);
    const zoom = (await camera(page))?.zoom ?? 0;
    const before = await lightHaptics(app);

    await clusters(page).first().click();
    await expect.poll(async () => (await camera(page))?.zoom ?? 0).toBeGreaterThan(zoom);
    await expect.poll(() => visible(page, '[data-marker="stack"], [data-marker="cluster"], [data-marker="pin"]').count()).toBeGreaterThan(1);
    expect(await lightHaptics(app)).toBe(before + 1);
    await expect(card(page)).toHaveCount(0);
  });

  /**
   * WP-27 SCR-011 "a cluster: the number of listings in a circle of 32, 38 or 44 px", the dot at the centre of a spread
   * stack (10 px); acceptance "Leaflet shows the same … stacks, clusters … as GL for the same search".
   */
  test("a cluster is a circle of 32, 38 or 44 px and a spread stack's dot a 10 px circle, as on GL", async ({ page }) => {
    await openMap(page, LEAFLET_DEBUG);
    await stacksDrawn(page);
    const boxOf = (selector: string) =>
      visible(page, selector).evaluateAll((nodes) =>
        nodes.map((node) => {
          const { width, height } = node.getBoundingClientRect();
          return { count: Number(node.getAttribute("data-count")), width, height };
        }),
      );

    await tapTopStack(page);
    await expect(dots(page)).toHaveCount(1);
    expect(await boxOf('[data-marker="dot"]')).toEqual([{ count: 0, width: 10, height: 10 }]);

    await zoomTo(page, 7);
    await expect(clusters(page).first()).toBeVisible();
    for (const { count, width, height } of await boxOf('[data-marker="cluster"]')) {
      const size = count < 10 ? 32 : count < 50 ? 38 : 44;
      expect({ count, width, height }).toEqual({ count, width: size, height: size });
    }
  });

  /**
   * Tests "a max-zoom cluster tap with a spread stack collapses the stack first" (fix of LB-APP-013); acceptance
   * "Tapping a max-zoom cluster while a stack is spread collapses the stack and opens the cluster's card"; the engine
   * difference "Spread stack on zoom: collapses when the zoom starts". The answer is five stub listings: three at one
   * address (a stack) and two others 10 m apart 78 m north of it, which markercluster joins at the maximum zoom 18.
   */
  test("at maximum zoom, a cluster tap while a stack is spread collapses the stack and opens the cluster's card; a zoom collapses a spread stack", async ({ page }) => {
    const stack = { lat: 41.3, lon: 69.28 };
    const near = [
      { lat: 41.3007, lon: 69.28 },
      { lat: 41.30078, lon: 69.28006 },
    ];
    let answered: MapPoint[] = [];
    await page.route(
      (url) => isMapRead(url),
      async (handled) => {
        const response = await handled.fetch();
        const body = (await response.json()) as MapAnswer;
        // Five distinct listings of the stubs, so their previews answer.
        const points = body.data.points.filter((point, index, all) => all.findIndex((other) => other.number === point.number) === index).slice(0, 5);
        answered = points.map((point, index) => ({ ...point, ...(index < 3 ? stack : near[index - 3]) }));
        body.data = { points: answered, total: answered.length };
        await handled.fulfill({ response, json: body });
      },
    );
    await openMap(page, LEAFLET_DEBUG);
    await expect(view(page)).toHaveClass(/(^|\s)leaflet-container(\s|$)/, { timeout: 15_000 });
    await expect(visible(page, "[data-marker]").first()).toBeVisible({ timeout: 15_000 });
    const clusterNumbers = answered.slice(3).map((point) => point.number);

    // Zoom 18 with the stack in the middle of the screen and the pair above it, both clear of the bars and the card.
    await page.evaluate(
      ({ at, zoom }) => {
        const map = (window as unknown as { homiMap: DebugMap }).homiMap;
        map.setView([at.lat, at.lon], zoom, { animate: false });
        map.panBy([0, 60], { animate: false });
      },
      { at: stack, zoom: MAX_ZOOM },
    );
    const stackMarker = visible(page, '[data-marker="stack"][data-count="3"]');
    const cluster = visible(page, '[data-marker="cluster"][data-count="2"]');
    await expect(stackMarker).toBeVisible();
    await expect(cluster).toBeVisible();
    expect((await camera(page))?.zoom).toBe(MAX_ZOOM);

    await stackMarker.click();
    await expect(spread(page)).toHaveCount(3);
    await expect(dots(page)).toHaveCount(1);
    await expect(header(page)).toHaveText("1 из 3");
    expect(await tappable(page, '[data-marker="cluster"][data-count="2"]'), "the cluster is under a spread pin or the card").toBe(true);

    await cluster.click();
    await expect(spread(page)).toHaveCount(0);
    await expect(dots(page)).toHaveCount(0);
    await expect(stackMarker).toBeVisible();
    await expect(header(page)).toHaveText("1 из 2");
    await expect(slot(page, 0)).toHaveAttribute("data-status", "success");
    expect(clusterNumbers).toContain(Number(await slot(page, 0).locator("article[data-listing]").getAttribute("data-listing")));
    // At the maximum zoom the cluster selects: the camera did not move.
    expect((await camera(page))?.zoom).toBe(MAX_ZOOM);

    // Leaflet collapses a spread stack when a zoom starts (GL keeps it).
    await stackMarker.click();
    await expect(spread(page)).toHaveCount(3);
    await expect(header(page)).toHaveText("1 из 3");
    await zoomTo(page, MAX_ZOOM - 1);
    await expect(spread(page)).toHaveCount(0);
    await expect(dots(page)).toHaveCount(0);
  });

  /**
   * Acceptance "A label with markup is shown as text on Leaflet pins, stacks and clusters" (LB-APP-020): the icons are
   * DOM nodes filled with `textContent`. A cluster shows only its count, never a label, so it carries no server text.
   */
  test("labels with markup are shown as text on a pin, a stack and its spread pins; clusters show only their count", async ({ page }) => {
    const bold = "<b data-injected>$1</b>";
    const image = '<img src="x" data-injected onerror="window.__homiInjected = true">';
    let lone = 0;
    await page.route(
      (url) => isMapRead(url),
      async (handled) => {
        const response = await handled.fetch();
        const body = (await response.json()) as MapAnswer;
        const { points } = body.data;
        const [first] = points;
        // The first listing alone in the middle of the others with a bold label, the stack of the last one with images.
        first.lat = points.reduce((sum, item) => sum + item.lat, 0) / points.length;
        first.lon = points.reduce((sum, item) => sum + item.lon, 0) / points.length;
        first.label = bold;
        lone = first.number;
        const sizes = new Map<string, number>();
        for (const point of points.slice(1)) {
          sizes.set(`${point.lat},${point.lon}`, (sizes.get(`${point.lat},${point.lon}`) ?? 0) + 1);
        }
        const [address] = [...sizes].toSorted((a, b) => b[1] - a[1])[0];
        for (const point of points.slice(1)) {
          if (`${point.lat},${point.lon}` === address) {
            point.label = image;
          }
        }
        await handled.fulfill({ response, json: body });
      },
    );
    await openMap(page, LEAFLET_DEBUG);
    await expect.poll(() => lone).toBeGreaterThan(0);

    const pin = visible(page, `[data-marker="pin"][data-number="${lone}"]`);
    await expect(pin).toHaveCount(1, { timeout: 15_000 });
    await expect(pin).toHaveText(bold);
    expect(await pin.evaluate((node) => node.childElementCount)).toBe(0);

    const marked = stacks(page).filter({ hasText: image });
    await expect(marked).toHaveCount(1);
    expect(await marked.locator("span").first().evaluate((node) => [node.textContent, node.childElementCount])).toEqual([image, 0]);
    await marked.click();
    await expect(spread(page).first()).toBeVisible();
    await expect(spread(page)).toHaveCount(STACK_SIZE);
    for (const content of await spread(page).evaluateAll((nodes) => nodes.map((node) => [node.textContent, node.childElementCount]))) {
      expect(content).toEqual([image, 0]);
    }

    await zoomTo(page, 7);
    await expect(clusters(page).first()).toBeVisible();
    for (const content of await clusters(page).evaluateAll((nodes) => nodes.map((node) => [node.textContent, node.getAttribute("data-count"), node.childElementCount]))) {
      expect(content).toEqual([content[1], content[1], 0]);
    }
    await expect(page.locator("[data-injected]")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __homiInjected?: boolean }).__homiInjected)).toBeUndefined();
  });

  /** WP-27 E6 (denied) and States "Locate denied" on Leaflet; acceptance "Leaflet shows the same … locate behaviour". */
  test("locate without access shows «Нет доступа к геопозиции…» in the note", async ({ page }) => {
    const app = await openMap(page, LEAFLET, { answers: { location: null } });
    await stacksDrawn(page);

    await locateButton(page).click();
    await expect(note(page)).toHaveText("Нет доступа к геопозиции. Разрешить можно в настройках Telegram.");
    await expect(locateButton(page)).toHaveAttribute("aria-busy", "false");
    expect((await app.calls()).filter((call) => call.member === "LocationManager.getLocation")).toHaveLength(1);
    await expect(view(page).locator(".leaflet-overlay-pane path")).toHaveCount(0);
    // The note goes after 5 s.
    await expect(note(page)).toHaveCount(0, { timeout: 7_000 });
  });

  /**
   * WP-27 E6 (success, no coordinates sent; TMA-035) on Leaflet; WP-28 "Locate: a circle marker of radius 7 and an
   * accuracy circle under 2 km"; acceptance "Leaflet shows the same … locate behaviour as GL".
   */
  test("locate flies to the position with a dot of radius 7 and a 30 m accuracy circle; no request carries the position", async ({ page }) => {
    const requests = recordRequests(page, () => true);
    await openMap(page, LEAFLET_DEBUG, { answers: { location: { latitude: 41.3, longitude: 69.25, horizontal_accuracy: 30 } } });
    await stacksDrawn(page);
    expect(await camera(page), "?mapdebug exposes window.homiMap outside production").not.toBeNull();
    const paths = view(page).locator(".leaflet-overlay-pane path");
    await expect(paths).toHaveCount(0);

    await locateButton(page).click();
    // Until the flight has ended at zoom 15 (Leaflet's scale is the app's).
    await expect
      .poll(async () => {
        const after = await camera(page);
        return after !== null && Math.abs(after.lat - 41.3) < 1e-4 && Math.abs(after.lon - 69.25) < 1e-4 && after.zoom >= LOCATE_ZOOM;
      })
      .toBe(true);
    await expect(paths).toHaveCount(2);
    const drawn = await page.evaluate(() => {
      const L = (window as unknown as { L: { Circle: new () => unknown; CircleMarker: new () => unknown } }).L;
      const map = (window as unknown as { homiMap: { eachLayer(visit: (layer: unknown) => void): void } }).homiMap;
      const found: { kind: string; lat: number; lon: number; radius: number }[] = [];
      map.eachLayer((layer) => {
        if (layer instanceof L.CircleMarker) {
          const shape = layer as unknown as { getLatLng(): { lat: number; lng: number }; getRadius(): number };
          const { lat, lng } = shape.getLatLng();
          found.push({ kind: layer instanceof L.Circle ? "accuracy" : "dot", lat, lon: lng, radius: shape.getRadius() });
        }
      });
      return found.toSorted((a, b) => a.kind.localeCompare(b.kind));
    });
    expect(drawn).toEqual([
      { kind: "accuracy", lat: 41.3, lon: 69.25, radius: 30 },
      { kind: "dot", lat: 41.3, lon: 69.25, radius: 7 },
    ]);
    await expect(locateButton(page)).toHaveAttribute("aria-busy", "false");

    await page.waitForLoadState("networkidle");
    const position = /41\.3|69\.25/;
    for (const request of requests) {
      expect(request.url(), "a request URL carries the position").not.toMatch(position);
      expect(request.postData() ?? "", `the body of ${request.url()} carries the position`).not.toMatch(position);
    }
  });

  /**
   * WP-28 "Basemap": `tiles` empty → the OSM raster, tile images requested with an origin referrer, added after the
   * first fit; "Map: attribution … «© OpenStreetMap» … link clicks are routed to `tg.openLink`" (TMA-028); acceptance
   * "Leaflet basemap appears after the first fit …; «© OpenStreetMap» is in the control and opens outside the app".
   * The answer is the stubs' shape in Samarkand, so the start view (Tashkent) and the fitted view share no tile: every
   * tile asked for is one of the fitted view. The map opens from the feed, with the session ready, and the answer is
   * given at once without the network, so it comes well inside the 1.2 s that would add the basemap without a fit.
   * The attribution is `MapScreen`'s `MapAttribution` on both engines (the spec says Leaflet's control): one
   * «© OpenStreetMap», without Leaflet's prefix.
   */
  test("the raster basemap is added after the first fit: only the fitted view's tiles, with the origin as referrer; «© OpenStreetMap» opens through Telegram", async ({ page, context }) => {
    const tiles = recordRequests(page, (request) => OSM_TILE.test(request.url()));
    // Four addresses with eleven listings each and one listing alone, as the stubs answer, far from Tashkent.
    const addresses = [
      [39.71512, 66.99431],
      [39.70012, 66.99431],
      [39.63501, 66.92402],
      [39.65552, 66.98803],
    ];
    const points: MapPoint[] = [
      ...addresses.flatMap(([lat, lon], address) =>
        Array.from({ length: STACK_SIZE }, (_, index): MapPoint => {
          const usd = 400 + 100 * address + 5 * index;
          return { number: 900_000 + 100 * address + index, lat, lon, label: `$${usd}`, tone: null, priced: true, usd };
        }),
      ),
      { number: 900_500, lat: 39.57351, lon: 66.92904, label: "$300", tone: null, priced: true, usd: 300 },
    ];
    const app = await openFeed(page, "cookie", LEAFLET_DEBUG);
    await page.route(
      (url) => isMapRead(url),
      (handled) => handled.fulfill({ json: { success: true, data: { points, total: points.length }, meta: { source: "stub" } } }),
    );
    await toMap(page);
    await stacksDrawn(page);
    await expect(view(page).locator("img.leaflet-tile-loaded").first()).toBeAttached();
    await expect.poll(() => tiles.length).toBeGreaterThan(0);

    const { zoom } = (await camera(page)) ?? { zoom: 0 };
    const west = Math.min(...points.map((point) => point.lon));
    const east = Math.max(...points.map((point) => point.lon));
    const south = Math.min(...points.map((point) => point.lat));
    const north = Math.max(...points.map((point) => point.lat));
    const origin = `${new URL(test.info().project.use.baseURL ?? "http://localhost:3001").origin}/`;
    for (const request of tiles) {
      const [, z, x, y] = (OSM_TILE.exec(request.url()) ?? []).map(Number);
      // The tile's centre in degrees (Web Mercator).
      const lon = ((x + 0.5) / 2 ** z) * 360 - 180;
      const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / 2 ** z))) * 180) / Math.PI;
      expect(z, `${request.url()} is not of the fitted zoom`).toBe(zoom);
      expect(lon > west - 0.5 && lon < east + 0.5 && lat > south - 0.5 && lat < north + 0.5, `${request.url()} is not of the fitted view`).toBe(true);
      expect(await request.headerValue("referer")).toBe(origin);
      expect((await request.response())?.status()).toBe(200);
    }

    const attribution = visible(page, "[data-map-attribution]");
    await expect(attribution).toHaveAttribute("data-map-attribution", "osm");
    await expect(attribution).toHaveText("© OpenStreetMap");
    // One attribution, without Leaflet's «Leaflet» prefix.
    await expect(page.getByText("© OpenStreetMap")).toHaveCount(1);
    await expect(page.getByText("Leaflet", { exact: false })).toHaveCount(0);
    const address = page.url();
    await attribution.getByRole("link", { name: "© OpenStreetMap" }).click();
    await expect
      .poll(async () => (await app.calls()).filter((call) => call.member === "openLink").map((call) => call.args[0]))
      .toEqual(["https://www.openstreetmap.org/copyright"]);
    expect(page.url()).toBe(address);
    expect(context.pages()).toHaveLength(1);
  });

  /**
   * WP-28 "Basemap": "added after the first fit or after 1.2 s, whichever comes first; before that the palette's land
   * colour"; acceptance "Leaflet basemap appears after the first fit or within 1.2 s". With the answer held there is
   * no fit: the first tile image is added 1.2 s after the map was made, not before. Both moments are taken in the
   * page by a mutation observer (the map's container class, the first tile image). The map opens from the feed, so
   * the session and reference data (whose `tiles` picks the raster) are ready before the map is made.
   */
  test("with the answer held, the basemap is added 1.2 s after the map was made", async ({ page }) => {
    await page.addInitScript(() => {
      const marks: { created?: number; tile?: number } = {};
      Object.assign(window, { __homiBasemapMarks: marks });
      new MutationObserver((records) => {
        for (const record of records) {
          const { target } = record;
          if (marks.created === undefined && target instanceof Element && target.matches('[data-map-view="leaflet"].leaflet-container')) {
            marks.created = performance.now();
          }
          for (const node of record.addedNodes) {
            if (marks.tile === undefined && node instanceof HTMLImageElement && node.classList.contains("leaflet-tile")) {
              marks.tile = performance.now();
            }
          }
        }
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    });
    await openFeed(page);
    const held = gate();
    await page.route(
      (url) => isMapRead(url),
      async (handled) => {
        await held.held;
        await handled.fallback();
      },
    );
    await toMap(page);
    await expect(pill(page)).toHaveAttribute("data-map-status", "loading");
    const marks = () => page.evaluate(() => (window as unknown as { __homiBasemapMarks: { created?: number; tile?: number } }).__homiBasemapMarks);
    await expect.poll(async () => (await marks()).tile, { timeout: 15_000 }).toBeDefined();
    const { created, tile } = await marks();
    expect(created, "the Leaflet map was made").toBeDefined();
    const waited = (tile ?? 0) - (created ?? 0);
    expect(waited, "the basemap came before its 1.2 s").toBeGreaterThanOrEqual(BASEMAP_DELAY_MS - 50);
    expect(waited, "the basemap came long after its 1.2 s").toBeLessThan(BASEMAP_DELAY_MS + 1_800);
    // Still no answer: the basemap did not wait for a fit.
    await expect(pill(page)).toHaveAttribute("data-map-status", "loading");

    held.release();
    await stacksDrawn(page);
  });

  /**
   * WP-28 "The Leaflet view mounts when … the GL view calls `onFail` (then `markGlFailed` of WP-27 runs once)";
   * acceptance "A forced GL failure switches to Leaflet at once and for the rest of the session". An init script makes
   * MapLibre's canvas refuse a WebGL2 context (the engine probe's own canvases still get one, so the rule picks GL):
   * the constructor throws `GPUInitializationError`, the view reports `webgl`, and the screen mounts Leaflet. The
   * session is the page: after a round trip through the list the map opens on Leaflet without trying GL again.
   */
  test("a GL view that cannot get its WebGL2 context switches to Leaflet at once, and the map stays on Leaflet for the session", async ({ page }) => {
    await refuseGlContext(page);
    await openMap(page, "");
    await stacksDrawn(page);
    expect(await glRefused(page), "the rule picked GL and MapLibre asked for its context once").toBe(1);
    await expect(glView(page)).toHaveCount(0);
    await expect(page.locator("[data-map-unavailable]")).toHaveCount(0);

    // The list and back: the same session opens the map on Leaflet without a second GL attempt.
    await expect(visible(page, "[data-view-toggle]")).toHaveText("Список");
    await visible(page, "[data-view-toggle]").click();
    await expect(page).toHaveURL(/\/ru(\?|$)/);
    await expect(route(page, "feed")).toBeVisible();
    await expect(visible(page, "article[data-listing]").first()).toBeVisible();
    await toMap(page);
    await stacksDrawn(page);
    await expect(glView(page)).toHaveCount(0);
    expect(await glRefused(page)).toBe(1);
  });

  /**
   * WP-28 "Drawing (SCR-012)": "GL fails while drawing | Leaflet mounts, drawing is cancelled, filters kept", and
   * "A fallback during drawing closes the `draw` layer; filters are kept". A launch on `/map?draw=1` (as a reload while
   * drawing) is drawing from the first render; MapLibre then fails to get its context, and at depth 0 the layer closes
   * by a replace to the same address without `draw`.
   */
  test("GL failing while drawing mounts Leaflet and ends drawing; the address keeps its filters without draw", async ({ page }) => {
    await refuseGlContext(page);
    await openMap(page, "?rooms_min=2&draw=1");
    await expect(view(page)).toHaveClass(/(^|\s)leaflet-container(\s|$)/, { timeout: 15_000 });
    await expect.poll(() => new URL(page.url()).searchParams.has("draw")).toBe(false);
    expect(new URL(page.url()).pathname).toBe("/ru/map");
    expect(new URL(page.url()).searchParams.get("rooms_min")).toBe("2");
    expect(await glRefused(page)).toBe(1);
    await expect(glView(page)).toHaveCount(0);
    await expect(visible(page, "[data-lasso]")).toHaveCount(0);
    await expect(page.getByText("Обведите пальцем, где искать")).toHaveCount(0);
    await expect(visible(page, "[data-view-toggle]")).toHaveText("Список");
  });
});
