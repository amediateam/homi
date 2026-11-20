import { expect, launchApp, stubMedia, test as base, type LaunchedApp } from "@homi/testing/playwright";
import type { Page, Request, Route } from "@playwright/test";

/**
 * The search map of WP-27 (SCR-011 … SCR-013, `03` §1.8) against the API on stubs, whose default search (Tashkent,
 * long rent, apartments) answers `GET /listings/map` with points that the fitted camera shows as four stacks of
 * eleven listings each. Every test names the lines of the spec's "End to end" list (E1 … E7, in the spec's order) and
 * of the acceptance checklist it covers.
 *
 * Headless Chromium creates a WebGL2 context that passes the major-performance-caveat probe, so the engine rule of
 * WP-27 "Engine choice" picks GL without `?map=gl` (the spec expected software rendering to fail the probe; noted for
 * the PR). E7 launches with `?map=leaflet`, the override of TMA-012: the map opens on the Leaflet view of WP-28, which
 * replaced the unavailable state (`map-leaflet.spec.ts` covers that view). The OpenStreetMap raster tiles are answered
 * by the guard of `@homi/testing/playwright` with a blank PNG; `stubMedia` answers the previews' photos. Markers are
 * plain DOM elements in MapLibre's canvas container, and a tap reaches them through the map's own `click`, so
 * `locator.click()` is the tap. `?mapdebug` exposes the map as `window.homiMap` in every build but production (the e2e
 * builds are `local` and `ci`); the locate test reads the camera from it.
 *
 * The map's answers that the stubs cannot give (no points, a server error, a failed preview) are page routes
 * registered after `launchApp` and before the map opens from the feed's view toggle. Header mode runs the core path
 * only: every map read is a browser read through `/bff`, the same in both modes once the session is ready, and the
 * full run shares one stub user's API limit (120 a minute, KI-32). The visible copy only: with `cacheComponents` an
 * earlier copy of a route can stay in the document hidden.
 *
 * Not automated (spec "Not automated", acceptance): real GPU rendering, pinch, the native permission sheet, the
 * vector basemap (no file is hosted), palette likeness, a cluster at maximum zoom (the stubs have no listings that
 * close), the theme and language restyle, a forced GL failure, the `dev013BackClosesMapCard` branch (a test-build
 * flag), hiding a listing from the map's card, the polygon mask and the camera fit rules beyond "the stacks are on
 * the screen".
 */

const test = base.extend<{ photos: readonly string[] }>({
  /** The stub photos answered so far: the card's previews show one each, and CI has no `cdn.homi.loc`. */
  photos: [async ({ page }, use) => use(await stubMedia(page)), { auto: true }],
});

interface Fake {
  emit(eventType: string): void;
}

type Mode = "cookie" | "header";

/** The default search's map answer of the stubs on the fitted screen: four addresses with eleven listings each. */
const STACKS = 4;
const STACK_SIZE = 11;
/** The stub listing of a verified owner (`owner_verified`), one of the default search's points. */
const VERIFIED = 100014;

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const html = (page: Page) => page.locator("html");
const view = (page: Page) => visible(page, '[data-map-view="gl"]');
/** The Leaflet view of WP-28, which `?map=leaflet` opens. */
const leafletView = (page: Page) => visible(page, '[data-map-view="leaflet"]');
const stacks = (page: Page) => visible(page, '[data-marker="stack"]');
const spread = (page: Page) => visible(page, '[data-marker="spread"]');
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
/** The card's preview of `number` (`?preview=1`, which records no view). */
const isPreviewOf = (number: number) => (url: URL) => url.pathname === `/bff/listings/${number}` && url.searchParams.get("preview") === "1";
/** Any preview of the card. */
const isPreview = (url: URL) => /^\/bff\/listings\/\d+$/.test(url.pathname) && url.searchParams.get("preview") === "1";
/** The MapLibre worker, copied under `public/maplibre/<version>/` (`scripts/copy-maplibre-worker.mjs`). */
const isWorker = (url: URL) => /^\/maplibre\/[^/]+\/maplibre-gl-worker\.mjs$/.test(url.pathname);

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

/** Fails if the page asks for anything that `match`es within `ms`: a bounded window for "nothing more follows". */
const nothingAsked = (page: Page, match: (request: Request) => boolean, ms = 1_000) =>
  expect(page.waitForRequest(match, { timeout: ms })).rejects.toThrow(/Timeout/);

/** Answers a matched request with a JSON error of the app server's pass-through. */
const failWith = (handled: Route, status: number, code: string) =>
  handled.fulfill({ status, contentType: "application/json", body: JSON.stringify({ code }) });

/** A gate a route handler waits on: `release()` lets the held requests go on. */
function gate(): { held: Promise<void>; release: () => void } {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { held, release };
}

/** The next requests carry the stub scenario `scenario` (WP-22 forwards the cookie as `X-Stub-Scenario`). */
async function stubScenario(page: Page, scenario: string | null): Promise<void> {
  if (scenario === null) {
    await page.context().clearCookies({ name: "homi_stub_scenario" });
    return;
  }
  await page.context().addCookies([{ name: "homi_stub_scenario", value: scenario, url: test.info().project.use.baseURL }]);
}

/** Launches the app on the feed as the bot does and waits for the session and the first card. */
async function openFeed(page: Page, mode: Mode = "cookie", options: Parameters<typeof launchApp>[1] = {}): Promise<LaunchedApp> {
  const app = await launchApp(page, { ...options, mode, path: "/" });
  await expect(html(page)).toHaveAttribute("data-session", "ready");
  await expect(visible(page, "article[data-listing]").first()).toBeVisible();
  return app;
}

/** Switches the feed to the map with the view toggle «Карта» and waits for the GL view. */
async function toMap(page: Page): Promise<void> {
  await expect(visible(page, "[data-view-toggle]")).toHaveText("Карта");
  await visible(page, "[data-view-toggle]").click();
  await expect(page).toHaveURL(/\/ru\/map\?/);
  await expect(view(page)).toBeVisible();
}

/** Launches the app on the map directly (a launch query such as `?map=` or `?mapdebug` included). */
async function openMap(page: Page, query = "", options: Parameters<typeof launchApp>[1] = {}): Promise<LaunchedApp> {
  const app = await launchApp(page, { ...options, path: `/ru/map${query}` });
  await expect(html(page)).toHaveAttribute("data-session", "ready");
  return app;
}

/** Waits until the stub answer is drawn: four stacks of eleven and no status pill. */
async function stacksDrawn(page: Page): Promise<void> {
  // The first map of a page loads the library and starts its worker: slow on a loaded machine.
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

/** A point of the map's canvas that no marker, card or chrome covers: a tap there is a tap on the map background. */
const backgroundPoint = (page: Page) =>
  page.evaluate(() => {
    for (let y = 160; y < 600; y += 20) {
      for (let x = 30; x < 360; x += 20) {
        const hit = document.elementFromPoint(x, y);
        if (hit instanceof HTMLCanvasElement && hit.classList.contains("maplibregl-canvas")) {
          // Keep clear of the edge of a marker: the neighbours on every side are canvas too.
          const clear = [
            [x - 12, y],
            [x + 12, y],
            [x, y - 12],
            [x, y + 12],
          ].every(([px, py]) => document.elementFromPoint(px, py) === hit);
          if (clear) {
            return { x, y };
          }
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

type DebugMap = { getCenter(): { lat: number; lng: number }; getZoom(): number; getStyle(): { layers: { id: string }[] } };

/** The camera of `window.homiMap` (`?mapdebug`). */
const camera = (page: Page) =>
  page.evaluate(() => {
    const map = (window as unknown as { homiMap?: DebugMap }).homiMap;
    if (map === undefined) {
      return null;
    }
    const { lat, lng } = map.getCenter();
    return { lat, lon: lng, zoom: map.getZoom(), layers: map.getStyle().layers.map((layer) => layer.id) };
  });

for (const mode of ["cookie", "header"] as const) {
  test.describe(`map (${mode} mode)`, () => {
    /**
     * E1, E2; acceptance "The toggle opens the map", "Listings at one address form a stack …", "a tap opens the
     * listing and Back returns to the same card", "`tiles` empty: OSM raster with «© OpenStreetMap»".
     */
    test("the toggle opens the map with the stub's stacks and the demo marker; a card opens the listing over the map and Back returns to the same card", async ({ page }) => {
      await openFeed(page, mode);
      const reads = recordRequests(page, (request) => isMapRead(new URL(request.url())));
      await toMap(page);
      await stacksDrawn(page);
      expect(reads).toHaveLength(1);
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
    });
  });
}

test.describe("map (cookie mode)", () => {
  /**
   * E3 and the actions "Tap a stack", "Tap a spread pin", "Swipe the card track", "Tap the map background";
   * acceptance "tapping spreads it without overlaps", "A background tap … close the card", "A stack card shows
   * «{n} из {total}» and swipes; only neighbouring previews are requested".
   */
  test("a stack spreads around a dot; a swipe moves the header to «2 из 11» and the active pin; a background tap closes the card", async ({ page }) => {
    await openMap(page);
    await stacksDrawn(page);
    const previews = recordRequests(page, (request) => isPreview(new URL(request.url())));

    await tapTopStack(page);
    await expect(spread(page)).toHaveCount(STACK_SIZE);
    await expect(visible(page, '[data-marker="dot"]')).toHaveCount(1);
    // The spread stack leaves the stacks: the other three stay.
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
    // The spread-pin tap below waits for the swipe's snap to end: a tap during it is undone by the snap, which
    // settles back on «2 из 11» and reports that slot (seen while this spec was written).
    await trackSettled(page, 1);
    await expect.poll(() => activeSpread(page)).toBe(numbers[1]);
    await expect(slot(page, 2)).toHaveAttribute("data-status", "success");

    // A spread pin moves the track to its listing.
    const index = await tappableSpreadIndex(page, 3);
    expect(index, "no spread pin is clear of the card and the top bar").toBeGreaterThan(2);
    await spread(page).nth(index).click();
    await expect(header(page)).toHaveText(`${index + 1} из ${STACK_SIZE}`);
    await expect.poll(() => activeSpread(page)).toBe(numbers[index]);
    await expect(slot(page, index)).toHaveAttribute("data-status", "success");

    const point = await backgroundPoint(page);
    expect(point, "no free point of the map").not.toBeNull();
    await page.mouse.click(point?.x ?? 0, point?.y ?? 0);
    await expect(card(page)).toHaveCount(0);
    await expect(spread(page)).toHaveCount(0);
    await expect(visible(page, '[data-marker="dot"]')).toHaveCount(0);
    await expect(stacks(page)).toHaveCount(STACKS);
  });

  /**
   * States "Card, single"; the actions "Tap a pin" and "Tap × on the card"; acceptance "× close the card; the active
   * pin is raised above the others", "Locate: … hidden while a card is open".
   */
  test("a listing alone at its address is a pin: its card has no header and its × closes it", async ({ page }) => {
    await openFeed(page);
    // One listing of the stub answer moved to the middle of the others, so it stands alone.
    await page.route(
      (url) => isMapRead(url),
      async (handled) => {
        const response = await handled.fetch();
        const body = (await response.json()) as { data: { points: { number: number; lat: number; lon: number }[] } };
        const { points } = body.data;
        points[0].lat = points.reduce((sum, item) => sum + item.lat, 0) / points.length;
        points[0].lon = points.reduce((sum, item) => sum + item.lon, 0) / points.length;
        await handled.fulfill({ response, json: body });
      },
    );
    await toMap(page);
    const pin = visible(page, '[data-marker="pin"]');
    await expect(pin).toHaveCount(1);
    const number = Number(await pin.getAttribute("data-number"));

    await pin.click();
    await expect(card(page)).toBeVisible();
    await expect(header(page)).toHaveCount(0);
    await expect(slot(page, 0).locator(`article[data-listing="${number}"]`)).toBeVisible();
    await expect(pin).toHaveClass(/(^|\s)active(\s|$)/);
    await expect(locateButton(page)).toHaveCount(0);

    await card(page).locator("[data-map-card-close]").click();
    await expect(card(page)).toHaveCount(0);
    await expect(pin).not.toHaveClass(/(^|\s)active(\s|$)/);
    // Locate is hidden while a card is open (WP-27 "Actions", rules).
    await expect(locateButton(page)).toBeVisible();
  });

  test("the card of a verified owner shows the shield after the price, and no badge (since index-CBlEKxdL.js)", async ({ page }) => {
    await openFeed(page);
    // The stub 100014 is the verified owner; moved to the middle of the others, so it is a pin of its own.
    await page.route(
      (url) => isMapRead(url),
      async (handled) => {
        const response = await handled.fetch();
        const body = (await response.json()) as { data: { points: { number: number; lat: number; lon: number }[] } };
        const { points } = body.data;
        const verified = points.find((item) => item.number === VERIFIED)!;
        verified.lat = points.reduce((sum, item) => sum + item.lat, 0) / points.length;
        verified.lon = points.reduce((sum, item) => sum + item.lon, 0) / points.length;
        await handled.fulfill({ response, json: body });
      },
    );
    await toMap(page);

    await visible(page, `[data-marker="pin"][data-number="${VERIFIED}"]`).click();
    const listing = slot(page, 0).locator(`article[data-listing="${VERIFIED}"]`);
    await expect(listing).toBeVisible();
    const shield = listing.getByRole("img", { name: "Проверенный хозяин" });
    await expect(shield).toBeVisible();
    await expect(listing.locator("[data-price] > :last-child")).toHaveAttribute("data-verified", "");
    await expect(listing.locator("[data-badge]")).toHaveCount(0);
  });

  /**
   * E4; States "Points loading" (fix of LB-APP-044), "Error, offline", "Error, server" (fix of LB-APP-008); acceptance
   * "Loading pill, `map.empty`, server error with «Повторить» and offline error each appear in their case".
   */
  test("listings/map pending, offline and answered 500 shows the loading pill, «Нет связи» and «Не загрузилось» with «Повторить»; a retry draws the stacks", async ({ page }) => {
    await openFeed(page);
    const held = gate();
    let failure: "offline" | "server" = "offline";
    const failing = (url: URL) => isMapRead(url);
    await page.route(failing, async (handled) => {
      await held.held;
      await (failure === "offline" ? handled.abort("internetdisconnected") : failWith(handled, 500, "server_error"));
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

    await page.unroute(failing);
    const read = page.waitForRequest((request) => isMapRead(new URL(request.url())));
    await pill(page).getByRole("button", { name: "Повторить" }).click();
    await read;
    await stacksDrawn(page);
  });

  /** E4 (no points); States "Empty"; acceptance "`map.empty` … appear in their case". */
  test("an answer without points shows «Ничего не найдено в этой области»", async ({ page }) => {
    await openFeed(page);
    await page.route(
      (url) => isMapRead(url),
      (handled) => handled.fulfill({ json: { success: true, data: { points: [], total: 0 }, meta: { source: "stub" } } }),
    );
    await toMap(page);

    await expect(pill(page)).toHaveAttribute("data-map-status", "empty");
    await expect(pill(page)).toHaveText("Ничего не найдено в этой области");
    await expect(visible(page, "[data-marker]")).toHaveCount(0);
    await expect(note(page)).toHaveCount(0);
  });

  /** States "Note" (BR-APP-062); acceptance "«На карте {shown} из {total} · …» appears for 6 s …" (ru plural "one"). */
  test("an answer whose total counts a listing without a location shows «На карте … из …» for 6 s", async ({ page }) => {
    await openFeed(page);
    let shown = 0;
    // The stubs locate every listing: the answer's total counts one more, which only its district places.
    await page.route(
      (url) => isMapRead(url),
      async (handled) => {
        const response = await handled.fetch();
        const body = (await response.json()) as { data: { points: unknown[]; total: number } };
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

  /** States "Error, server" for `source_unavailable` (fix of LB-APP-008). */
  test("a source failure shows the error pill; «Повторить» after it recovers draws the stacks", async ({ page }) => {
    await openFeed(page);
    await stubScenario(page, "source_unavailable");
    await toMap(page);

    await expect(pill(page)).toHaveAttribute("data-map-status", "error");
    await expect(pill(page)).toHaveAttribute("data-error", "source_unavailable");
    await expect(pill(page)).toContainText("Не загрузилось");

    await stubScenario(page, null);
    await pill(page).getByRole("button", { name: "Повторить" }).click();
    await stacksDrawn(page);
  });

  /**
   * E5; States "Card slot failed" (fix of LB-APP-017); acceptance "A failed preview shows «Не загрузилось —
   * повторить» and recovers"; the action "Tap a spread pin".
   */
  test("a preview answered 500 shows «Не загрузилось — повторить» in its slot; the retry shows the card", async ({ page }) => {
    await openFeed(page);
    await toMap(page);
    await stacksDrawn(page);
    await tapTopStack(page);
    await expect(header(page)).toHaveText(`1 из ${STACK_SIZE}`);
    const numbers = await spreadNumbers(page);
    // A slot that has not been read yet: neither the first one nor its neighbour.
    const index = await tappableSpreadIndex(page, 3);
    expect(index, "no spread pin is clear of the card and the top bar").toBeGreaterThan(2);
    const failing = isPreviewOf(numbers[index]);
    await page.route(failing, (handled) => failWith(handled, 500, "server_error"));

    await spread(page).nth(index).click();
    await expect(header(page)).toHaveText(`${index + 1} из ${STACK_SIZE}`);
    await expect(slot(page, index)).toHaveAttribute("data-status", "error");
    await expect(slot(page, index).getByRole("button")).toHaveText("Не загрузилось — повторить");
    // The neighbours read their own previews.
    await expect(slot(page, index - 1)).toHaveAttribute("data-status", "success");

    await page.unroute(failing);
    const read = page.waitForRequest((request) => failing(new URL(request.url())));
    await slot(page, index).getByRole("button", { name: "Не загрузилось — повторить" }).click();
    await read;
    await expect(slot(page, index)).toHaveAttribute("data-status", "success");
    await expect(slot(page, index).locator(`article[data-listing="${numbers[index]}"]`)).toBeVisible();
  });

  /**
   * The action "Tap a cluster below maximum zoom"; acceptance "A cluster zooms in on tap". Zoomed out through
   * `window.homiMap`, the answer's listings form clusters that count them; a tap plays a light haptic and eases in
   * until they come apart. A cluster at maximum zoom needs listings closer than 48 px at zoom 17, which the stubs
   * do not have.
   */
  test("zoomed out, the listings form clusters that count them all; a tap on one eases in until it comes apart", async ({ page }) => {
    const answer = page.waitForResponse((response) => isMapRead(new URL(response.url())));
    const app = await openMap(page, "?mapdebug");
    await stacksDrawn(page);
    // Besides the four stacks the answer has listings that the robust fit leaves off the screen.
    const { data } = (await (await answer).json()) as { data: { points: unknown[] } };
    const clusters = visible(page, '[data-marker="cluster"]');
    await page.evaluate(() => (window as unknown as { homiMap: { jumpTo(options: { zoom: number }): void } }).homiMap.jumpTo({ zoom: 7 }));
    await expect(clusters.first()).toBeVisible();
    await expect(stacks(page)).toHaveCount(0);
    const counts = await clusters.evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("data-count"))));
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(data.points.length);
    const zoom = (await camera(page))?.zoom ?? 0;
    const light = async () => (await app.calls()).filter((call) => call.member === "HapticFeedback.impactOccurred" && call.args[0] === "light").length;
    const before = await light();

    await clusters.first().click();
    await expect.poll(async () => (await camera(page))?.zoom ?? 0).toBeGreaterThan(zoom);
    await expect.poll(() => visible(page, '[data-marker="stack"], [data-marker="cluster"]').count()).toBeGreaterThan(1);
    expect(await light()).toBe(before + 1);
    await expect(card(page)).toHaveCount(0);
  });

  /** E6 (denied); States "Locate denied"; acceptance "Locate: denied text … (5 s each)". */
  test("locate without access shows «Нет доступа к геопозиции…» in the note", async ({ page }) => {
    const app = await openMap(page, "", { answers: { location: null } });
    await stacksDrawn(page);

    await locateButton(page).click();
    await expect(note(page)).toHaveText("Нет доступа к геопозиции. Разрешить можно в настройках Telegram.");
    await expect(locateButton(page)).toHaveAttribute("aria-busy", "false");
    expect((await app.calls()).filter((call) => call.member === "LocationManager.getLocation")).toHaveLength(1);
    // The note goes after 5 s.
    await expect(note(page)).toHaveCount(0, { timeout: 7_000 });
  });

  /** E6 (success, no coordinates sent; TMA-035); acceptance "success with the dot and accuracy circle". */
  test("locate flies the camera to the position with the dot and the accuracy circle; no request carries the position", async ({ page }) => {
    const requests = recordRequests(page, () => true);
    await openMap(page, "?mapdebug", { answers: { location: { latitude: 41.3, longitude: 69.25, horizontal_accuracy: 30 } } });
    await stacksDrawn(page);
    const before = await camera(page);
    expect(before, "?mapdebug exposes window.homiMap outside production").not.toBeNull();
    expect(before?.layers).not.toContain("me-dot");

    await locateButton(page).click();
    // Until the fly has ended: zoom 15 on the Leaflet scale is 14 on MapLibre's, reached at the end of the flight
    // (the centre is within the tolerance a little earlier).
    await expect
      .poll(async () => {
        const after = await camera(page);
        return after !== null && Math.abs(after.lat - 41.3) < 1e-4 && Math.abs(after.lon - 69.25) < 1e-4 && after.zoom >= 14;
      })
      .toBe(true);
    const after = await camera(page);
    expect(after?.layers).toEqual(expect.arrayContaining(["me-accuracy", "me-dot"]));
    await expect(locateButton(page)).toHaveAttribute("aria-busy", "false");

    await page.waitForLoadState("networkidle");
    const position = /41\.3|69\.25/;
    for (const request of requests) {
      expect(request.url(), "a request URL carries the position").not.toMatch(position);
      expect(request.postData() ?? "", `the body of ${request.url()} carries the position`).not.toMatch(position);
    }
  });

  /**
   * E7 as WP-28 changed it ("`e2e/map.spec.ts` (the "unavailable" case becomes a Leaflet case)"); acceptance of WP-28
   * "Non-GL profile: the map opens on Leaflet; the "map unavailable" state no longer exists anywhere".
   */
  test("?map=leaflet opens the map on Leaflet with the stub's stacks; the unavailable state is gone", async ({ page }) => {
    await openMap(page, "?map=leaflet");
    // The first map of a page loads the library: slow on a loaded machine.
    await expect(leafletView(page)).toBeVisible({ timeout: 15_000 });
    await stacksDrawn(page);
    await expect(view(page)).toHaveCount(0);
    await expect(page.locator("[data-map-unavailable]")).toHaveCount(0);
    await expect(page.getByText("Карта на этом устройстве пока недоступна")).toHaveCount(0);
  });

  /** Acceptance "`?map=gl`, `?map=leaflet`, `?map=auto` persist and clear the choice across launches" (TMA-012). */
  test("the ?map= choice persists across launches; ?map=auto clears it", async ({ page, context }) => {
    await openMap(page, "?map=leaflet");
    await expect(leafletView(page)).toBeVisible({ timeout: 15_000 });
    await expect(view(page)).toHaveCount(0);

    // The next launch in the same Telegram (the same storage) without the parameter keeps the choice.
    const second = await context.newPage();
    await openMap(second);
    await expect(leafletView(second)).toBeVisible({ timeout: 15_000 });
    await expect(view(second)).toHaveCount(0);

    const third = await context.newPage();
    await openMap(third, "?map=auto");
    await expect(view(third)).toBeVisible();
    await expect(leafletView(third)).toHaveCount(0);
    await expect(stacks(third)).toHaveCount(STACKS);
  });

  /** Acceptance "`tiles` empty: OSM raster with «© OpenStreetMap»; the links open outside the app" (TMA-028). */
  test("the attribution «© OpenStreetMap» opens the copyright page through Telegram", async ({ page, context }) => {
    const app = await openMap(page);
    await stacksDrawn(page);
    const attribution = visible(page, "[data-map-attribution]");
    await expect(attribution).toHaveAttribute("data-map-attribution", "osm");
    const address = page.url();

    await attribution.getByRole("link", { name: "© OpenStreetMap" }).click();
    await expect
      .poll(async () => (await app.calls()).filter((call) => call.member === "openLink").map((call) => call.args[0]))
      .toEqual(["https://www.openstreetmap.org/copyright"]);
    expect(page.url()).toBe(address);
    expect(context.pages()).toHaveLength(1);
  });

  /**
   * Warm-up and tile prefetch (LB-APP-018, KV-FE-062); acceptance "After 2.5 s on the list the map opens without a
   * chunk request": the worker of the library is started by the warm-up before the toggle is touched.
   */
  test("2.5 s on the list warms the map up: the worker is asked for before the toggle is touched", async ({ page }) => {
    const workers = recordRequests(page, (request) => isWorker(new URL(request.url())));
    await openFeed(page);
    await page.waitForRequest((request) => isWorker(new URL(request.url())), { timeout: 8_000 });
    expect(workers).toHaveLength(1);

    await toMap(page);
    await stacksDrawn(page);
    expect(workers).toHaveLength(1);
  });

  /** Acceptance "with Save-Data nothing was preloaded" (WP-27 "Warm-up and tile prefetch"). */
  test("with Save-Data the list warms nothing; the map loads its code when it opens", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "connection", { configurable: true, get: () => ({ saveData: true, effectiveType: "4g" }) });
    });
    const workers = recordRequests(page, (request) => isWorker(new URL(request.url())));
    await openFeed(page);
    await nothingAsked(page, (request) => isWorker(new URL(request.url())), 4_000);
    expect(workers).toEqual([]);

    await toMap(page);
    await stacksDrawn(page);
    expect(workers).toHaveLength(1);
  });
});
