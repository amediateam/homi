import { expect, launchApp, stubMedia, test as base, type LaunchedApp } from "@homi/testing/playwright";
import type { CDPSession, Locator, Page, Request } from "@playwright/test";

/**
 * The listing's spot map of WP-28 (`03` SCR-021 and the mini map of SCR-018; spec "Spot map", "Behaviour to
 * reproduce → Spot map", "Tests → End to end → spot-map.spec.ts") against the API on stubs, over the listing `100001`
 * of the catalogue (Юнусабад · Мегапланет, `geo_radius_m` 500), on both engines: the session's engine draws the spot
 * map, so a launch without `?map=` is GL — headless Chromium passes the WebGL2 probe (the spec expected it to fall to
 * Leaflet; a recorded correction) — and `?map=leaflet` in the launch address is Leaflet. Every test names the lines of
 * the spec's tables (S = the state table, A = the action table) and of the acceptance checklist it covers.
 *
 * The mini map mounts when its box comes within 300 px of the listing layer's scroller: on the 844 px screen of the
 * project the box of `100001` already is (its top is 1 128 px down), so the mount test runs on a 640 px screen. The
 * listing `100007` of the catalogue has no coordinates. Every stub listing has the radius 500, so the Yandex zoom of
 * the other radii is checked in header mode, where the listing is a browser read through `/bff` that a page route
 * answers with another `geo_radius_m` (in cookie mode the listing over the feed is read on the server). A direct load
 * reads the listing through `/bff` in both modes (the first document has no cookie yet). The OpenStreetMap raster
 * tiles are answered by the guard of `@homi/testing/playwright` with a blank PNG; `stubMedia` answers the photos.
 * Header mode runs the core path only (open over the feed and directly, tap, Back, Back): the full run shares one stub
 * user's API limit (120 a minute, KI-32). The visible copy only: with `cacheComponents` an earlier copy of a route can
 * stay in the document hidden, and an earlier opening's screen stays hidden inside a listing layer.
 *
 * Not automated: the GL camera (the spot map does not expose `window.homiMap`, so a GL pan, the GL fit of spot and
 * user and the GL dot are not read; Leaflet's are read from its DOM), the locate failure text `map.locateFail` (the
 * fake answers a position or a refusal only; the component test covers it), the spinner while locating, the "both
 * engines failed" state, real GPU rendering, tile likeness, pinch, the native location sheet, the theme and language
 * restyle.
 */

const test = base.extend<{ photos: readonly string[] }>({
  /** The stub photos answered so far: every test answers them itself, as CI has no `cdn.homi.loc`. */
  photos: [async ({ page }, use) => use(await stubMedia(page)), { auto: true }],
});

interface Fake {
  webApp: { BackButton: { isVisible: boolean } };
  answers: { location: { latitude: number; longitude: number } | null };
  emit(eventType: string): void;
}

/** The engines of the spot map: the launch query that picks one, the class its map puts on the container. */
interface Engine {
  name: "gl" | "leaflet";
  query: string;
  /** The class the library adds to the map container. */
  map: string;
  /** A class an interactive map has on its container or inside it: dragging is on. */
  interactive: string;
  /** One element per map instance inside the container. */
  instance: string;
}

const ENGINES: readonly Engine[] = [
  { name: "gl", query: "", map: "maplibregl-map", interactive: ".maplibregl-interactive", instance: "canvas.maplibregl-canvas" },
  { name: "leaflet", query: "?map=leaflet", map: "leaflet-container", interactive: ".leaflet-grab", instance: ".leaflet-map-pane" },
];

/** The ordinary listing of the stub catalogue, first in the default feed. */
const LISTING = 100001;
const LOCATION = { lat: 41.36512, lon: 69.28431 };
const PLACE = "Юнусабад · Мегапланет";
/** The stub listing without `location` (and `geo_radius_m`); its district is Шайхантахур. */
const NO_COORDINATES = 100007;

const APPROX = "Место примерное: по кварталу, ориентиру или метро из объявления";
const DENIED = "Нет доступа к геопозиции. Разрешить можно в настройках Telegram.";
/** A position in the city 8.18 km from `LOCATION` (haversine): `listing.mapFromYou` with one decimal. */
const POSITION = { latitude: 41.2995, longitude: 69.2401, horizontal_accuracy: 30 };
const FROM_YOU = "≈ 8,2 км от вас — место примерное";
/** The position's digits in any request: a URL, a query or a body (TMA-035). */
const POSITION_TEXT = /41[.,]299|69[.,]240/;

/** «Яндекс Карты» for a spot: `ll` and `pt` are `lon,lat` with 6 decimals (A «Яндекс Карты»). */
const yandexUrl = ({ lat, lon }: { lat: number; lon: number }, zoom: number) =>
  `https://yandex.uz/maps/?ll=${lon.toFixed(6)},${lat.toFixed(6)}&z=${zoom}&pt=${lon.toFixed(6)},${lat.toFixed(6)},pm2rdm`;
/** «Google Карты» for a spot: `query` is `lat,lon` with 6 decimals (A «Google Карты»). */
const googleUrl = ({ lat, lon }: { lat: number; lon: number }) => `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`;

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const html = (page: Page) => page.locator("html");
const route = (page: Page, name: string) => visible(page, `[data-route="${name}"]`);
const cards = (page: Page) => visible(page, "article[data-listing]");
const card = (page: Page, number: number) => visible(page, `article[data-listing="${number}"]`);
/**
 * The listing layer of `number` (each layer carries its own number, also a hidden one). After a direct load and a
 * depth-0 close of its child, an overlay copy stands over the standalone copy, so two can be visible.
 */
const layer = (page: Page, number: number) => visible(page, `[data-route="listing"][data-listing-number="${number}"]`);
/** The standalone copy of a directly loaded listing page. */
const standalone = (page: Page, number: number) => visible(page, `[data-route="listing"][data-listing-number="${number}"]:not([data-layer])`);
/** Inside a layer an earlier opening's screen stays hidden (`<Activity>`): the visible part of `selector` only. */
const inLayer = (page: Page, number: number, selector: string) => visible(page, `[data-route="listing"][data-listing-number="${number}"] ${selector}`);
const loaded = (page: Page, number: number) => expect(inLayer(page, number, "[data-listing-state]").first()).toHaveAttribute("data-listing-state", "loaded");
/** The mini map's button of the listing `number`. */
const mini = (page: Page, number: number) => inLayer(page, number, "[data-spot-map]");
/** The fullscreen spot map: the dialog inside the route `listing/location`. */
const fullscreen = (page: Page) => visible(page, '[data-route="listing/location"] [data-spot-fullscreen]');
/** The map container inside a spot map (mini or fullscreen). */
const mapView = (host: Locator) => host.locator("[data-spot-map-view]");
const press = (page: Page, eventType: "backButtonClicked") =>
  page.evaluate((type) => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit(type), eventType);
const backVisible = (page: Page) =>
  page.evaluate(() => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.webApp.BackButton.isVisible);

/** The listing's details read through `/bff` (not the card's `?preview=1`). */
const isDetailsRead = (url: URL) => /^\/bff\/listings\/\d+$/.test(url.pathname) && !url.searchParams.has("preview");

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

/** Light impacts the page asked the fake Telegram for so far (TMA-025). */
async function impacts(app: LaunchedApp): Promise<number> {
  return (await app.calls()).filter((call) => call.member === "HapticFeedback.impactOccurred" && call.args[0] === "light").length;
}

/** The addresses the page handed to `tg.openLink` so far (TMA-028). */
async function links(app: LaunchedApp): Promise<unknown[]> {
  return (await app.calls()).filter((call) => call.member === "openLink").map((call) => call.args[0]);
}

/** Launches the app as the bot does at `path` (the engine's query appended) and waits for the session. */
async function open(page: Page, engine: Engine, path: string, options: Parameters<typeof launchApp>[1] = {}): Promise<LaunchedApp> {
  const app = await launchApp(page, { ...options, path: `${path}${engine.query}` });
  await expect(html(page)).toHaveAttribute("data-session", "ready");
  return app;
}

/** Launches on the feed and opens the listing `number` over it from its card. */
async function openOverFeed(page: Page, engine: Engine, number = LISTING, options: Parameters<typeof launchApp>[1] = {}): Promise<LaunchedApp> {
  const app = await open(page, engine, "/ru", options);
  await expect(cards(page).first()).toBeVisible();
  await card(page, number).locator("a").first().click();
  await expect(page).toHaveURL(new RegExp(`/ru/listing/${number}$`));
  await expect(visible(page, `[data-route="listing"][data-layer="overlay"][data-listing-number="${number}"]`)).toBeVisible();
  await loaded(page, number);
  return app;
}

/** Two animation frames: an intersection observer has seen the last scroll by then. */
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

/**
 * Scrolls the listing layer (the scroller of the mini map) so that the top of the mini map's box is `gap` px below the
 * bottom of the scroller's visible box.
 */
async function scrollMiniBelow(page: Page, number: number, gap: number): Promise<void> {
  await mini(page, number).evaluate((box, below) => {
    const scroller = box.closest('[data-slot="route-overlay"]');
    if (!(scroller instanceof HTMLElement)) {
      throw new Error("the mini map is not inside the listing layer");
    }
    const top = box.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTop += top - (scroller.clientHeight + below);
  }, gap);
  await nextFrames(page);
}

/** The scroll offset of the listing layer that holds the mini map. */
const layerScroll = (page: Page, number: number) => mini(page, number).evaluate((box) => box.closest('[data-slot="route-overlay"]')?.scrollTop ?? -1);

/**
 * Brings the mini map into view and waits for its map (the first map of a page loads the library: 15 s). A listing
 * opened again from the feed can still show the box of its earlier opening for a moment, which is then removed: the
 * scroll is retried until it lands on the box that stays.
 */
async function miniReady(page: Page, engine: Engine, number = LISTING): Promise<void> {
  await expect(async () => {
    await mini(page, number).scrollIntoViewIfNeeded({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await expect(mini(page, number)).toHaveAttribute("data-spot-status", "ready", { timeout: 15_000 });
  await expect(mapView(mini(page, number))).toHaveClass(new RegExp(`(^|\\s)${engine.map}(\\s|$)`));
}

/** Waits until the fullscreen map has its map on the session's engine, exactly one instance of it. */
async function fullscreenReady(page: Page, engine: Engine): Promise<void> {
  await expect(fullscreen(page)).toHaveAttribute("data-spot-status", "ready", { timeout: 15_000 });
  await expect(mapView(fullscreen(page))).toHaveClass(new RegExp(`(^|\\s)${engine.map}(\\s|$)`));
  await expect(mapView(fullscreen(page)).locator(engine.instance)).toHaveCount(1);
}

/** Every map instance of the spot maps in the document, the hidden copies of routes included. */
const maps = (page: Page, engine: Engine) => page.locator(`[data-spot-map-view] ${engine.instance}`);

/** Whether the map in `view` pans: the library's drag class on the container or inside it. */
const pans = (view: Locator, engine: Engine) =>
  view.evaluate((element, selector) => element.matches(selector) || element.querySelector(selector) !== null, engine.interactive);

/** Fails if `status` of `host` leaves `idle` within `ms`: a bounded window for "nothing mounts". */
const staysIdle = (page: Page, host: Locator, ms = 1_000) =>
  expect(
    host.evaluate(
      (element, wait) =>
        new Promise<void>((resolve, reject) => {
          const observer = new MutationObserver(() => {
            if (element.getAttribute("data-spot-status") !== "idle") {
              observer.disconnect();
              reject(new Error(`the mini map became ${element.getAttribute("data-spot-status")}`));
            }
          });
          observer.observe(element, { attributes: true, attributeFilter: ["data-spot-status"] });
          setTimeout(() => {
            observer.disconnect();
            resolve();
          }, wait);
        }),
      ms,
    ),
  ).resolves.toBeUndefined();

/** The transform of Leaflet's map pane in `view`: a pan moves it. */
const paneTransform = (view: Locator) => view.locator(".leaflet-map-pane").evaluate((pane) => (pane as HTMLElement).style.transform);

/** The boxes of the vector paths Leaflet drew in `view` (the spot's circle, the user's dot). */
const leafletPaths = (view: Locator) =>
  view.locator(".leaflet-overlay-pane path").evaluateAll((paths) => paths.map((path) => path.getBoundingClientRect().toJSON() as DOMRect));

/** A one-finger touch drag through the CDP, as a finger on a phone. */
async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12): Promise<void> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let step = 1; step <= steps; step += 1) {
    const point = { x: from.x + ((to.x - from.x) * step) / steps, y: from.y + ((to.y - from.y) * step) / steps };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** Back on the feed: its address (the engine's launch query may stay), the feed visible, no listing layer left. */
async function onFeed(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/ru(\?|$)/);
  await expect(route(page, "feed")).toBeVisible();
  await expect(visible(page, '[data-route="listing"]')).toHaveCount(0);
}

/** The listing `number` without the fullscreen map over it. */
async function onListing(page: Page, number: number): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`/ru/listing/${number}(\\?|$)`));
  await expect(route(page, "listing/location")).toHaveCount(0);
  await loaded(page, number);
}

for (const engine of ENGINES) {
  test.describe(`spot map on ${engine.name} (cookie mode)`, () => {
    test.describe("on a 640 px screen", () => {
      test.use({ viewport: { width: 390, height: 640 } });

      /**
       * S "Mini map waiting", "Mini map"; A "Tap the mini map", "Close button or Telegram Back", «Яндекс Карты»,
       * «Google Карты»; S "Fullscreen, idle"; e2e "mini map mounts on scroll; tap → fullscreen; Back closes it before
       * the listing"; acceptance "Listing with coordinates: the mini map appears when scrolled near, shows the
       * circle, does not pan", "Tap on the mini map opens the fullscreen map; Back closes it, then the listing",
       * "«Яндекс Карты» and «Google Карты» open the right place outside the app; Yandex zoom follows the radius"
       * (500 m → 16; the other radii in header mode), "the spot map works on a listing opened over the feed".
       */
      test("the mini map mounts only within 300 px of the screen; its tap opens the fullscreen map, whose card opens Yandex and Google; Back closes it, then the listing", async ({ page, context }) => {
        const app = await openOverFeed(page, engine);
        const box = mini(page, LISTING);
        // Waiting: the box in the map's background, no map in it and no spinner.
        await expect(box).toHaveAttribute("data-spot-status", "idle");
        await expect(box).toHaveAttribute("aria-label", "Открыть карту");
        await expect(mapView(box)).not.toHaveClass(new RegExp(engine.map));
        await expect(mapView(box).locator("*")).toHaveCount(0);
        await expect(box.locator('[data-slot="spinner"]')).toHaveCount(0);
        await expect(inLayer(page, LISTING, '[data-section="location"]').getByText(APPROX)).toBeVisible();

        // 400 px below the screen: still waiting.
        await scrollMiniBelow(page, LISTING, 400);
        await staysIdle(page, box);
        await expect(mapView(box).locator("*")).toHaveCount(0);
        // 200 px below the screen, not yet in view: the map mounts.
        await scrollMiniBelow(page, LISTING, 200);
        expect(await box.evaluate((element) => element.getBoundingClientRect().top)).toBeGreaterThan(640);
        await expect(box).toHaveAttribute("data-spot-status", "ready", { timeout: 15_000 });
        await expect(mapView(box)).toHaveClass(new RegExp(`(^|\\s)${engine.map}(\\s|$)`));
        await expect(mapView(box).locator(engine.instance)).toHaveCount(1);
        expect(await pans(mapView(box), engine), "the mini map ignores pan and zoom").toBe(false);
        await box.scrollIntoViewIfNeeded();
        await expect(inLayer(page, LISTING, "[data-map-attribution]")).toHaveText("© OpenStreetMap");
        const scrolled = await layerScroll(page, LISTING);

        const light = await impacts(app);
        await box.click();
        await expect(page).toHaveURL(new RegExp(`/ru/listing/${LISTING}/location$`));
        expect(await impacts(app)).toBe(light + 1);
        await fullscreenReady(page, engine);
        expect(await pans(mapView(fullscreen(page)), engine), "the fullscreen map pans").toBe(true);
        await expect(page.getByRole("dialog", { name: "Расположение" })).toBeVisible();
        await expect(fullscreen(page).getByRole("button", { name: "Закрыть" })).toBeVisible();
        await expect(fullscreen(page).getByRole("button", { name: "Где я" })).toBeVisible();
        await expect(fullscreen(page).locator("[data-spot-place]")).toHaveText(PLACE);
        await expect(fullscreen(page).locator("[data-spot-line]")).toHaveText(APPROX);
        await expect(fullscreen(page).locator("[data-map-attribution]")).toHaveText("© OpenStreetMap");
        // The listing stays underneath.
        await expect(layer(page, LISTING)).toBeVisible();
        await expect.poll(() => backVisible(page)).toBe(true);

        const address = page.url();
        await fullscreen(page).getByRole("button", { name: "Яндекс Карты" }).click();
        await expect.poll(() => links(app)).toEqual([yandexUrl(LOCATION, 16)]);
        await fullscreen(page).getByRole("button", { name: "Google Карты" }).click();
        await expect.poll(() => links(app)).toEqual([yandexUrl(LOCATION, 16), googleUrl(LOCATION)]);
        expect(await impacts(app)).toBe(light + 3);
        expect(page.url()).toBe(address);
        expect(context.pages()).toHaveLength(1);

        await press(page, "backButtonClicked");
        await onListing(page, LISTING);
        await expect(visible(page, `[data-route="listing"][data-layer="overlay"][data-listing-number="${LISTING}"]`)).toBeVisible();
        await expect(mini(page, LISTING)).toHaveAttribute("data-spot-status", "ready");
        expect(await layerScroll(page, LISTING)).toBe(scrolled);

        await press(page, "backButtonClicked");
        await onFeed(page);
      });
    });

    /**
     * e2e "direct load of `/listing/<n>/location` shows the fullscreen map over the listing page", "locate with a fake
     * position → the distance line; no request carries coordinates"; S "Located"; A "Close button or Telegram Back"
     * (depth 0); acceptance "Locate on the fullscreen map: … success with the dot, both points in view and «≈ {km} км
     * от вас — место примерное»", "the spot map works … on a direct load". The dot and the fit are read on Leaflet only.
     */
    test("a direct load shows the fullscreen map over the listing page; «Где я» finds the user 8,2 km away and sends nothing; Back closes the map, then the listing", async ({ page }) => {
      const requests = recordRequests(page, () => true);
      const app = await open(page, engine, `/ru/listing/${LISTING}/location`, { answers: { location: POSITION } });
      await fullscreenReady(page, engine);
      await expect(fullscreen(page).locator("[data-spot-place]")).toHaveText(PLACE);
      // The listing page under it: the standalone copy, read and shown.
      await expect(standalone(page, LISTING)).toBeVisible();
      await expect(layer(page, LISTING)).toHaveCount(1);
      await loaded(page, LISTING);
      await expect(inLayer(page, LISTING, "[data-listing-title]")).toHaveText("2-комн. квартира, 54 м²");
      const view = mapView(fullscreen(page));
      const before = engine.name === "leaflet" ? await leafletPaths(view) : [];
      if (engine.name === "leaflet") {
        expect(before, "the circle alone").toHaveLength(1);
      }

      await fullscreen(page).getByRole("button", { name: "Где я" }).click();
      await expect(fullscreen(page).locator("[data-spot-line]")).toHaveText(FROM_YOU);
      await expect(fullscreen(page).locator("[data-map-locate]")).toHaveAttribute("aria-busy", "false");
      const calls = await app.calls();
      expect(calls.filter((call) => call.member === "LocationManager.getLocation")).toHaveLength(1);
      expect(calls.filter((call) => call.member === "HapticFeedback.notificationOccurred" && call.args[0] === "success")).toHaveLength(1);
      if (engine.name === "leaflet") {
        // The dot joins the circle and, once the fit has flown, both are on the screen.
        await expect.poll(async () => (await leafletPaths(view)).length).toBe(2);
        await expect
          .poll(async () => (await leafletPaths(view)).every((box) => box.left >= 0 && box.top >= 0 && box.right <= 390 && box.bottom <= 844))
          .toBe(true);
      }

      await press(page, "backButtonClicked");
      await onListing(page, LISTING);
      await expect(standalone(page, LISTING)).toBeVisible();
      await press(page, "backButtonClicked");
      await onFeed(page);

      await page.waitForLoadState("networkidle");
      for (const request of requests) {
        expect(request.url(), "a request URL carries the position").not.toMatch(POSITION_TEXT);
        expect(request.postData() ?? "", `the body of ${request.url()} carries the position`).not.toMatch(POSITION_TEXT);
      }
    });

    /**
     * A "Swipe on the fullscreen map": "pans the map; there is no swipe-to-close and the listing's swipe-back does not
     * fire". A mouse drag pans; a rightward finger swipe that would close the listing layer (past a third of the width)
     * does nothing but pan. The pan is read on Leaflet (its map pane moves); GL's camera is not exposed.
     */
    test("a mouse drag and a rightward finger swipe on the fullscreen map never close it or the listing", async ({ page }) => {
      await openOverFeed(page, engine);
      await miniReady(page, engine);
      await mini(page, LISTING).click();
      await expect(page).toHaveURL(new RegExp(`/ru/listing/${LISTING}/location$`));
      await fullscreenReady(page, engine);
      const view = mapView(fullscreen(page));
      const start = engine.name === "leaflet" ? await paneTransform(view) : null;

      await page.mouse.move(195, 360);
      await page.mouse.down();
      await page.mouse.move(255, 300, { steps: 8 });
      await page.mouse.move(315, 260, { steps: 8 });
      await page.mouse.up();
      await expect(page).toHaveURL(new RegExp(`/ru/listing/${LISTING}/location$`));
      await expect(fullscreen(page)).toBeVisible();
      if (engine.name === "leaflet") {
        await expect.poll(() => paneTransform(view)).not.toBe(start);
      }

      const moved = engine.name === "leaflet" ? await paneTransform(view) : null;
      await touchDrag(page, { x: 40, y: 400 }, { x: 340, y: 410 });
      // The listing's swipe back would slide out and close within its settle time (180 ms): a bounded window.
      await expect(page.waitForURL((url) => !url.pathname.endsWith("/location"), { timeout: 1_000 })).rejects.toThrow(/Timeout/);
      await expect(fullscreen(page)).toBeVisible();
      await expect(layer(page, LISTING)).toBeVisible();
      if (engine.name === "leaflet") {
        await expect.poll(() => paneTransform(view)).not.toBe(moved);
      }

      await press(page, "backButtonClicked");
      await onListing(page, LISTING);
    });

    /**
     * A "Open and close the same listing repeatedly": "exactly one map instance per mount; no «Map container is
     * already initialized» (LB-APP-001)"; e2e "ten open/close cycles without a console error"; acceptance "Opening and
     * closing listings repeatedly never logs «Map container is already initialized»". On Leaflet a second map in a
     * container throws inside the engine's create and the map is left `failed`, so every cycle waits for `ready`.
     */
    test("ten openings of the fullscreen map (× and Back) and two of the listing each make one map, without a console error", async ({ page }) => {
      test.setTimeout(120_000);
      const messages: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error" || /already initialized/i.test(message.text())) {
          messages.push(`${message.type()}: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));
      await openOverFeed(page, engine);
      await miniReady(page, engine);

      for (let cycle = 0; cycle < 10; cycle += 1) {
        await mini(page, LISTING).click();
        await expect(page).toHaveURL(new RegExp(`/ru/listing/${LISTING}/location$`));
        await fullscreenReady(page, engine);
        await expect(visible(page, "[data-spot-fullscreen]")).toHaveCount(1);
        // In the whole document, hidden copies included: the mini map's and this one (a hidden route holds none).
        await expect(maps(page, engine)).toHaveCount(2);
        if (cycle % 2 === 0) {
          await fullscreen(page).getByRole("button", { name: "Закрыть" }).click();
        } else {
          await press(page, "backButtonClicked");
        }
        await onListing(page, LISTING);
        await expect(mini(page, LISTING)).toHaveAttribute("data-spot-status", "ready");
        await expect(mapView(mini(page, LISTING)).locator(engine.instance)).toHaveCount(1);
        await expect(maps(page, engine)).toHaveCount(1);
      }

      for (let opening = 0; opening < 2; opening += 1) {
        await press(page, "backButtonClicked");
        await onFeed(page);
        await card(page, LISTING).locator("a").first().click();
        await expect(page).toHaveURL(new RegExp(`/ru/listing/${LISTING}$`));
        await loaded(page, LISTING);
        await miniReady(page, engine);
        await expect(mapView(mini(page, LISTING)).locator(engine.instance)).toHaveCount(1);
        await expect(maps(page, engine)).toHaveCount(1);
      }
      await mini(page, LISTING).click();
      await fullscreenReady(page, engine);

      expect(messages).toEqual([]);
    });

    /**
     * S "Mini map" ("static map with the circle"), "Fullscreen, idle" ("interactive map"): each map fills its box, so
     * the circle drawn at the map's centre is in the middle of the box. Measured: the container is the box's size, and
     * on GL so is MapLibre's canvas.
     */
    test("the mini map and the fullscreen map fill their boxes", async ({ page }) => {
      const size = (target: Locator) => target.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }));
      await open(page, engine, `/ru/listing/${LISTING}`);
      await loaded(page, LISTING);
      await miniReady(page, engine);
      const box = await size(mini(page, LISTING));
      expect(box.height).toBeGreaterThan(100);
      expect(await size(mapView(mini(page, LISTING))), "the mini map's container").toEqual(box);
      if (engine.name === "gl") {
        expect(await size(mapView(mini(page, LISTING)).locator("canvas.maplibregl-canvas")), "the mini map's canvas").toEqual(box);
      }

      await mini(page, LISTING).click();
      await fullscreenReady(page, engine);
      const screen = await size(fullscreen(page));
      expect(screen.height).toBeGreaterThan(600);
      expect(await size(mapView(fullscreen(page))), "the fullscreen map's container").toEqual(screen);
      if (engine.name === "gl") {
        expect(await size(mapView(fullscreen(page)).locator("canvas.maplibregl-canvas")), "the fullscreen map's canvas").toEqual(screen);
      }
    });
  });
}

test.describe("spot map (cookie mode)", () => {
  /** S "Locate denied"; acceptance "Locate on the fullscreen map: denied text". Engine-independent: GL, the default. */
  test("«Где я» without access shows «Нет доступа к геопозиции…» on the card", async ({ page }) => {
    const app = await open(page, ENGINES[0], `/ru/listing/${LISTING}/location`, { answers: { location: null } });
    await fullscreenReady(page, ENGINES[0]);
    await expect(fullscreen(page).locator("[data-spot-line]")).toHaveText(APPROX);

    await fullscreen(page).getByRole("button", { name: "Где я" }).click();
    await expect(fullscreen(page).locator("[data-spot-line]")).toHaveText(DENIED);
    await expect(fullscreen(page).locator("[data-map-locate]")).toHaveAttribute("aria-busy", "false");
    expect((await app.calls()).filter((call) => call.member === "LocationManager.getLocation")).toHaveLength(1);
    await expect(fullscreen(page)).toBeVisible();
  });

  /**
   * S "No coordinates": "no mini map and no hint; `/location` returns to the listing"; acceptance "Listing without
   * coordinates: no mini map, no hint". A direct load of its `/location` and a push of it from the listing both land
   * on the listing.
   */
  test("a listing without coordinates has no mini map and no hint; its /location returns to the listing", async ({ page }) => {
    await open(page, ENGINES[0], `/ru/listing/${NO_COORDINATES}/location`);
    await onListing(page, NO_COORDINATES);
    // Every visible copy of the listing (the standalone page, and the overlay copy the depth-0 close adds over it).
    const section = inLayer(page, NO_COORDINATES, '[data-section="location"]');
    await expect(section.first()).toBeVisible();
    await expect(inLayer(page, NO_COORDINATES, '[data-section="location"] [data-location-place]').first()).toHaveText("Шайхантахур");
    await expect(inLayer(page, NO_COORDINATES, "[data-spot-map]")).toHaveCount(0);
    await expect(page.getByText(APPROX).filter({ visible: true })).toHaveCount(0);
    await expect(visible(page, "[data-spot-fullscreen]")).toHaveCount(0);

    // The push lands and leaves at once: the Navigation API's events record both addresses.
    await page.evaluate(() => {
      const seen: string[] = [];
      Object.assign(window, { __navigations: seen });
      (window as unknown as { navigation: EventTarget }).navigation.addEventListener("navigate", (event) => {
        seen.push(new URL((event as unknown as { destination: { url: string } }).destination.url).pathname);
      });
    });
    await page.evaluate(
      (href) => (window as unknown as { next: { router: { push(target: string): void } } }).next.router.push(href),
      `/ru/listing/${NO_COORDINATES}/location`,
    );
    const navigations = () => page.evaluate(() => (window as unknown as { __navigations: string[] }).__navigations);
    await expect
      .poll(async () => {
        const seen = await navigations();
        return { location: seen.includes(`/ru/listing/${NO_COORDINATES}/location`), last: seen.at(-1) };
      })
      .toEqual({ location: true, last: `/ru/listing/${NO_COORDINATES}` });
    await onListing(page, NO_COORDINATES);
    await expect(visible(page, "[data-spot-fullscreen]")).toHaveCount(0);
  });
});

test.describe("spot map (header mode)", () => {
  /**
   * The core path in header mode, where every listing read is a browser read through `/bff`: a direct load of
   * `/location`, then four listings opened over the feed whose reads are answered with the radii 250, 1 500, 1 501
   * and 0 m. A "«Яндекс Карты»" (zoom 17 / 15 / 13, and 16 for the default 500 m of a zero radius); e2e "direct load
   * … shows the fullscreen map over the listing page", "tap → fullscreen; Back closes it before the listing";
   * acceptance "Yandex zoom follows the radius", "Tap on the mini map opens the fullscreen map; Back closes it, then
   * the listing".
   */
  test("a direct load and four listings over the feed open the fullscreen map; «Яндекс Карты» zooms by the radius; Back closes the map, then the listing", async ({ page }) => {
    test.setTimeout(120_000);
    const engine = ENGINES[0];
    const radii = new Map([
      [LISTING, { radius: 250, zoom: 17 }],
      [100013, { radius: 1500, zoom: 15 }],
      [100012, { radius: 1501, zoom: 13 }],
      [100014, { radius: 0, zoom: 16 }],
    ]);
    const spots = new Map<number, { lat: number; lon: number }>();
    const reads = recordRequests(page, (request) => isDetailsRead(new URL(request.url())));
    // Registered before the launch: the direct load reads the listing during it.
    await page.route(
      (url) => isDetailsRead(url) && radii.has(Number(url.pathname.split("/").at(-1))),
      async (handled) => {
        const number = Number(new URL(handled.request().url()).pathname.split("/").at(-1));
        const response = await handled.fetch();
        const body = (await response.json()) as { data: { geo_radius_m: number | null; location: { lat: number; lon: number } } };
        body.data.geo_radius_m = radii.get(number)?.radius ?? null;
        spots.set(number, body.data.location);
        await handled.fulfill({ response, json: body });
      },
    );
    const app = await open(page, engine, `/ru/listing/${LISTING}/location`, { mode: "header" });
    await fullscreenReady(page, engine);
    await expect(standalone(page, LISTING)).toBeVisible();
    await loaded(page, LISTING);
    await fullscreen(page).getByRole("button", { name: "Яндекс Карты" }).click();
    await expect.poll(() => links(app)).toEqual([yandexUrl(LOCATION, 17)]);
    await press(page, "backButtonClicked");
    await onListing(page, LISTING);
    await press(page, "backButtonClicked");
    await onFeed(page);
    expect(reads.filter((request) => new URL(request.url()).pathname === `/bff/listings/${LISTING}`)).toHaveLength(1);

    const expected = [yandexUrl(LOCATION, 17)];
    for (const [number, { zoom }] of [...radii].slice(1)) {
      await card(page, number).locator("a").first().click();
      await expect(page).toHaveURL(new RegExp(`/ru/listing/${number}$`));
      await loaded(page, number);
      await miniReady(page, engine, number);
      await mini(page, number).click();
      await expect(page).toHaveURL(new RegExp(`/ru/listing/${number}/location$`));
      await fullscreenReady(page, engine);
      await expect(layer(page, number)).toBeVisible();

      await fullscreen(page).getByRole("button", { name: "Яндекс Карты" }).click();
      const spot = spots.get(number);
      expect(spot, `the read of ${number} went through /bff`).toBeDefined();
      expected.push(yandexUrl(spot ?? LOCATION, zoom));
      await expect.poll(() => links(app)).toEqual(expected);

      await press(page, "backButtonClicked");
      await onListing(page, number);
      await press(page, "backButtonClicked");
      await onFeed(page);
    }
    expect(reads.map((request) => Number(new URL(request.url()).pathname.split("/").at(-1))).toSorted()).toEqual([...radii.keys()].toSorted());
  });
});
