import { expect, launchApp, stubMedia, test as base, type LaunchedApp } from "@homi/testing/playwright";
import type { Page, Request } from "@playwright/test";

/**
 * Drawing an area on the search map (WP-28 "Drawing layer", "Lasso"; SCR-012, BR-APP-061) against the API on stubs,
 * on both engines: GL, which headless Chromium gets by the engine rule (its WebGL2 context passes the probe; the spec
 * expected the opposite, a recorded correction), and Leaflet through the launch override `?map=leaflet` (TMA-012).
 * The spec's "End to end" list for `map-lasso.spec.ts` is E1 … E6 in its order: E1 the filters sheet's «Обвести на
 * карте» and Back, E2 the lasso button and a large loop (the area pill, the `polygon` read, the list keeping it), E3
 * a tiny stroke, E4 «Отмена», E5 the reload on `/map?draw=1`, E6 × on the pill. Every test names those lines and the
 * acceptance items it covers.
 *
 * Strokes are mouse strokes (`page.mouse`, pointer events of type `mouse`, as Telegram Desktop) over the lasso
 * overlay `[data-lasso]`, which a view mounts only once its map exists. The mask of an area is read from the map:
 * GL's `mask-fill` and `mask-line` layers through `window.homiMap` (`?mapdebug`, every build but production), and
 * Leaflet's mask polygon and outline as SVG paths of its overlay pane. The stubs filter the map by districts but not
 * by zones or a polygon, so a search with `zones=center` still draws the default four stacks, and its first read
 * carries `zones[]` for the polygon read to drop; a search with `districts=chilonzor` draws its own few points, so the
 * tests that start from districts wait for the answer, not for stacks. Launch parameters (`map`, `mapdebug`) can stay
 * in an address until a write, so addresses are compared by their search keys, never whole.
 *
 * Header mode runs the core path once, on GL: the engines read the same `/bff` in both modes, and the run shares one
 * stub user's API limit (120 a minute, KI-32). In cookie mode the feed's first page is fetched on the server, so the
 * list keeping the area is checked on the address; in header mode the feed's first browser read carries it too. The
 * visible copy only: with `cacheComponents` an earlier copy of a route can stay in the document hidden.
 *
 * Not automated (spec "Not automated", acceptance): two-finger pan and pinch while drawing, whole-step versus
 * fractional zoom, a lost pointer capture, GL failing while drawing (a forced GL failure), the 3 s expiry of a draw
 * request (unit-tested), the downward stroke that must not collapse the Mini App (TMA-015, WP-21), the follow nudge
 * of a new area (WP-30), and the spec's acceptance runs in uz, en and dark.
 */

const test = base.extend<{ photos: readonly string[] }>({
  /** The stub photos answered so far: a map card's preview shows one, and CI has no `cdn.homi.loc`. */
  photos: [async ({ page }, use) => use(await stubMedia(page)), { auto: true }],
});

interface Fake {
  webApp: { BackButton: { isVisible: boolean } };
  emit(eventType: string): void;
}

type Engine = "gl" | "leaflet";
type Mode = "cookie" | "header";
type Point = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };
type Vertex = [lat: number, lon: number];

/** The launch parameters that put the map on each engine: none for GL, the default here. */
const ENGINES: readonly { engine: Engine; launch: readonly string[] }[] = [
  { engine: "gl", launch: [] },
  { engine: "leaflet", launch: ["map=leaflet"] },
];

/** The default search's map answer of the stubs on the fitted screen: four addresses with eleven listings each. */
const STACKS = 4;
const STACK_SIZE = 11;

const HINT = "Обведите пальцем, где искать";
const TOO_SMALL = "Обведите покрупнее";
const MOVE = "Двумя пальцами — двигать карту";

/** The wire form of an area: 3 to 40 `lat,lon` pairs with 5 decimals, not closed (WP-28 "Lasso", `serializePolygon`). */
const POLYGON = /^-?\d+\.\d{5},-?\d+\.\d{5}(;-?\d+\.\d{5},-?\d+\.\d{5}){2,39}$/;

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const html = (page: Page) => page.locator("html");
const route = (page: Page, name: string) => visible(page, `[data-route="${name}"]`);
const mapView = (page: Page, engine: Engine) => visible(page, `[data-map-view="${engine}"]`);
const stacks = (page: Page) => visible(page, '[data-marker="stack"]');
const card = (page: Page) => visible(page, "[data-map-card]");
const statusPill = (page: Page) => visible(page, "[data-map-status]");
const locateButton = (page: Page) => visible(page, "[data-map-locate]");
const toggle = (page: Page) => visible(page, "[data-view-toggle]");
const tab = (page: Page, key: "search" | "saved" | "radars" | "settings") => visible(page, `[data-tab="${key}"]`);
const mapBar = (page: Page) => visible(page, '[data-topbar="map"] [data-slot="map-bar"]');
const lassoButton = (page: Page) => mapBar(page).getByRole("button", { name: "Обвести на карте", exact: true });
const areaPill = (page: Page) => visible(page, '[data-topbar="map"] [data-slot="area-pill"]');
const drawBar = (page: Page) => visible(page, '[data-topbar="map-drawing"] [data-slot="draw-bar"]');
const drawHints = (page: Page) => drawBar(page).getByRole("status").locator("span");
const overlay = (page: Page) => visible(page, "[data-lasso]");
const outline = (page: Page) => visible(page, "[data-lasso-stroke]");
const filtersSheet = (page: Page) => visible(page, '[data-slot="bottom-sheet"] [data-route="filters"][data-layer="sheet"]');
const press = (page: Page, eventType: "backButtonClicked" | "settingsButtonClicked") =>
  page.evaluate((type) => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit(type), eventType);
const backVisible = (page: Page) =>
  page.evaluate(() => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.webApp.BackButton.isVisible);

const searchOf = (page: Page) => new URL(page.url()).searchParams;
const pathOf = (page: Page) => new URL(page.url()).pathname;
/** The search keys of the address: without the reserved `draw` and the launch parameters `map` and `mapdebug`. */
function filtersOf(page: Page): string {
  const params = new URLSearchParams(searchOf(page));
  for (const key of ["draw", "map", "mapdebug"]) {
    params.delete(key);
  }
  params.sort();
  return params.toString();
}

/** The map's points: `GET /listings/map` through `/bff`. */
const isMapRead = (url: URL) => url.pathname === "/bff/listings/map";
/** The feed's page one: `/bff/listings` without a cursor (a browser read in header mode only). */
const isPageOne = (url: URL) => url.pathname === "/bff/listings" && !url.searchParams.has("cursor");
const nextRequest = (page: Page, match: (url: URL) => boolean) => page.waitForRequest((request) => match(new URL(request.url())));

/** Collects the page's requests that `match` from now on. */
function recordRequests(page: Page, match: (url: URL) => boolean): Request[] {
  const seen: Request[] = [];
  page.on("request", (request) => {
    if (match(new URL(request.url()))) {
      seen.push(request);
    }
  });
  return seen;
}

/** Fails if the page asks for anything that `match`es within `ms`: a bounded window for "nothing more follows". */
const nothingAsked = (page: Page, match: (url: URL) => boolean, ms = 1_000) =>
  expect(page.waitForRequest((request) => match(new URL(request.url())), { timeout: ms })).rejects.toThrow(/Timeout/);

/** The haptics the page asked the fake Telegram for so far: light impacts, success and error notifications (TMA-025). */
async function haptics(app: LaunchedApp): Promise<{ light: number; success: number; error: number }> {
  const calls = await app.calls();
  const count = (member: string, value: string) => calls.filter((call) => call.member === member && call.args[0] === value).length;
  return {
    light: count("HapticFeedback.impactOccurred", "light"),
    success: count("HapticFeedback.notificationOccurred", "success"),
    error: count("HapticFeedback.notificationOccurred", "error"),
  };
}

/** `path` with the search `params` and the engine's launch parameters. */
function launchPath(path: string, engine: Engine, params: readonly string[] = []): string {
  const launch = ENGINES.find((entry) => entry.engine === engine)?.launch ?? [];
  const query = [...params, ...launch].join("&");
  return query === "" ? path : `${path}?${query}`;
}

/** Launches the app on the map directly and waits for the session and the engine's view. */
async function openMap(page: Page, engine: Engine, params: readonly string[] = [], mode: Mode = "cookie"): Promise<LaunchedApp> {
  const app = await launchApp(page, { mode, path: launchPath("/ru/map", engine, params) });
  await expect(html(page)).toHaveAttribute("data-session", "ready");
  // The first map of a page loads the library (and on GL starts its worker): slow on a loaded machine.
  await expect(mapView(page, engine)).toBeVisible({ timeout: 15_000 });
  return app;
}

/** Waits until the stub answer is drawn: four stacks of eleven and no status pill. */
async function stacksDrawn(page: Page): Promise<void> {
  await expect(stacks(page)).toHaveCount(STACKS, { timeout: 15_000 });
  await expect(visible(page, `[data-marker="stack"][data-count="${STACK_SIZE}"]`)).toHaveCount(STACKS);
  await expect(statusPill(page)).toHaveCount(0);
}

/** Taps the stack nearest the top of the screen, so its card opens at the bottom clear of it. */
async function tapTopStack(page: Page): Promise<void> {
  const tops = await stacks(page).evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
  await stacks(page).nth(tops.indexOf(Math.min(...tops))).click();
}

/**
 * The drawing state "Drawing, idle" of SCR-012: the `draw=1` layer, the drawing bar with `hint` and «Двумя пальцами —
 * двигать карту» and «Отмена» in place of the map bar, the BackButton, no view toggle and no locate button, the
 * engine's view under the lasso overlay.
 */
async function expectDrawing(page: Page, engine: Engine, hint = HINT): Promise<void> {
  await expect(page).toHaveURL(/[?&]draw=1(&|$)/);
  await expect(drawHints(page)).toHaveText([hint, MOVE]);
  await expect(drawBar(page).getByRole("button", { name: "Отмена", exact: true })).toBeVisible();
  await expect(mapBar(page)).toHaveCount(0);
  await expect(toggle(page)).toHaveCount(0);
  await expect(locateButton(page)).toHaveCount(0);
  await expect.poll(() => backVisible(page)).toBe(true);
  await expect(mapView(page, engine)).toBeVisible();
  await expect(overlay(page)).toBeVisible();
}

/** The plain map: `/map` without `draw`, the map bar and the toggle «Список» back, no drawing bar or overlay. */
async function expectPlainMap(page: Page, engine: Engine): Promise<void> {
  await expect.poll(() => pathOf(page)).toBe("/ru/map");
  await expect(page).not.toHaveURL(/[?&]draw=/);
  await expect(mapBar(page)).toBeVisible();
  await expect(drawBar(page)).toHaveCount(0);
  await expect(overlay(page)).toHaveCount(0);
  await expect(toggle(page)).toHaveText("Список");
  await expect(mapView(page, engine)).toBeVisible();
}

/** A loop around the overlay's middle: a circle of 0.3 of its shorter side in 48 steps, ending where it began. */
function loop(box: Box): Point[] {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const r = Math.min(box.width, box.height) * 0.3;
  return Array.from({ length: 49 }, (_, index) => {
    const t = (2 * Math.PI * index) / 48;
    return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) };
  });
}

/** A figure-eight lying on its side around the overlay's middle: the outline crosses itself once, in the middle. */
function figureEight(box: Box): Point[] {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const r = Math.min(box.width, box.height) * 0.3;
  return Array.from({ length: 65 }, (_, index) => {
    const t = (2 * Math.PI * index) / 64;
    return { x: cx + r * Math.sin(t), y: cy + r * Math.sin(t) * Math.cos(t) };
  });
}

/** Three points 8 to 10 px apart: a span of 14 px, under the 40 px a stroke needs on either axis. */
function tiny(box: Box): Point[] {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return [
    { x: cx, y: cy },
    { x: cx + 8, y: cy + 6 },
    { x: cx + 14, y: cy },
  ];
}

/** Draws `path` over the lasso overlay with the mouse's main button; long strokes check the outline midway. */
async function stroke(page: Page, path: (box: Box) => Point[]): Promise<void> {
  const box = await overlay(page).boundingBox();
  if (box === null) {
    throw new Error("the lasso overlay has no box");
  }
  const [first, ...rest] = path(box);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const [index, point] of rest.entries()) {
    await page.mouse.move(point.x, point.y, { steps: 2 });
    if (rest.length > 10 && index === Math.floor(rest.length / 2)) {
      // An outline follows the pointer while it is down (state "Stroke").
      await expect(outline(page)).toBeVisible();
    }
  }
  await page.mouse.up();
}

/** The vertices of an area in the wire form. */
function vertices(text: string | null): Vertex[] {
  expect(text ?? "").toMatch(POLYGON);
  return (text ?? "").split(";").map((pair) => pair.split(",").map(Number) as Vertex);
}

/**
 * True when every turn of the closed outline goes the same way. A turn whose cross product is within what the
 * rounding to 5 decimals can move (1e-5 per coordinate, scaled by the edges) counts as straight.
 */
function convex(outline: readonly Vertex[]): boolean {
  let sign = 0;
  for (const [index, a] of outline.entries()) {
    const b = outline[(index + 1) % outline.length];
    const c = outline[(index + 2) % outline.length];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const tolerance = 2e-5 * (Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1]));
    if (Math.abs(cross) <= tolerance) {
      continue;
    }
    if (sign === 0) {
      sign = Math.sign(cross);
    } else if (Math.sign(cross) !== sign) {
      return false;
    }
  }
  return sign !== 0;
}

/** Every vertex lies in Tashkent's box: the stroke was unprojected from the map of the default search. */
function expectInTashkent(outline: readonly Vertex[]): void {
  for (const [lat, lon] of outline) {
    expect(lat, "a vertex outside Tashkent").toBeGreaterThan(41.1);
    expect(lat, "a vertex outside Tashkent").toBeLessThan(41.5);
    expect(lon, "a vertex outside Tashkent").toBeGreaterThan(69.0);
    expect(lon, "a vertex outside Tashkent").toBeLessThan(69.6);
  }
}

/**
 * Whether the area's mask is on the map: GL's mask layers in the style of `window.homiMap` (`?mapdebug`), or Leaflet's
 * mask polygon and outline, two SVG paths of the visible view's overlay pane. `null` when GL exposes no map.
 */
const masked = (page: Page, engine: Engine) =>
  page.evaluate((kind) => {
    if (kind === "gl") {
      const map = (window as unknown as { homiMap?: { getStyle(): { layers: { id: string }[] } } }).homiMap;
      if (map === undefined) {
        return null;
      }
      const ids = map.getStyle().layers.map((layer) => layer.id);
      return ids.includes("mask-fill") && ids.includes("mask-line");
    }
    return [...document.querySelectorAll('[data-map-view="leaflet"]')]
      .filter((view) => view.checkVisibility())
      .some((view) => view.querySelectorAll(".leaflet-overlay-pane path").length >= 2);
  }, engine);

/** Waits for the area a finished stroke applies: `/map` without `draw`, its `polygon`, and the pill «Своя область». */
async function areaApplied(page: Page): Promise<string> {
  await expect.poll(() => searchOf(page).get("polygon") ?? "").toMatch(POLYGON);
  await expect(page).not.toHaveURL(/[?&]draw=/);
  expect(pathOf(page)).toBe("/ru/map");
  await expect(areaPill(page).getByRole("button", { name: "Своя область", exact: true })).toBeVisible();
  await expect(areaPill(page).getByRole("button", { name: "Убрать область", exact: true })).toBeVisible();
  await expect(overlay(page)).toHaveCount(0);
  await expect(drawBar(page)).toHaveCount(0);
  return searchOf(page).get("polygon") ?? "";
}

for (const { engine } of ENGINES) {
  test.describe(`map lasso on ${engine} (cookie mode)`, { annotation: [{ type: "screen", description: "SCR-012" }] }, () => {
    /**
     * E1; the action "«Обвести на карте» in the filters sheet"; acceptance "«Обвести на карте» in the filters sheet
     * closes the sheet and starts drawing on the map; the BackButton is visible; Back cancels drawing and the map
     * stays", "Telegram Back … end[s] drawing without changing filters".
     */
    test("«Обвести на карте» in the filters sheet opens the map drawing with districts and zones cleared; Back cancels drawing and the map stays", async ({ page }) => {
      await launchApp(page, { path: launchPath("/", engine, ["districts=chilonzor", "zones=center"]) });
      await expect(html(page)).toHaveAttribute("data-session", "ready");
      await expect(route(page, "feed")).toBeVisible();
      expect(searchOf(page).getAll("districts")).toEqual(["chilonzor"]);
      expect(searchOf(page).getAll("zones")).toEqual(["center"]);

      await visible(page, '[data-topbar="search-list"] [data-chip="filters"]').click();
      await expect(filtersSheet(page)).toBeVisible();
      const reads = recordRequests(page, isMapRead);
      await filtersSheet(page).getByRole("button", { name: "Обвести на карте", exact: true }).click();

      await expect(filtersSheet(page)).toHaveCount(0);
      await expectDrawing(page, engine);
      expect(pathOf(page)).toBe("/ru/map");
      expect(searchOf(page).getAll("districts")).toEqual([]);
      expect(searchOf(page).getAll("zones")).toEqual([]);
      const drawn = filtersOf(page);
      // The map searches without them too.
      await expect.poll(() => reads.length).toBeGreaterThan(0);
      const read = new URL(reads[0].url());
      expect(read.searchParams.getAll("districts[]")).toEqual([]);
      expect(read.searchParams.getAll("zones[]")).toEqual([]);

      await press(page, "backButtonClicked");
      await expectPlainMap(page, engine);
      expect(filtersOf(page)).toBe(drawn);
      // One Back: the map took the feed's place, so nothing is left to go back to.
      await expect.poll(() => backVisible(page)).toBe(false);
      await stacksDrawn(page);
    });

    /**
     * E2, E6; the states "Drawing, idle", "Stroke", "Area set" and the actions "Tap the lasso button", "Finger down",
     * "Valid stroke", "Tab press", "× on the area pill"; acceptance "Lasso button starts drawing: hints …, «Отмена»,
     * BackButton visible, view toggle and locate hidden, open card closed", "A large loop becomes «Своя область»: mask
     * on the map, pill in the top bar, feed and map limited to it, districts and zones cleared", "… a tab press … each
     * end drawing without changing filters", "× on the area pill removes the area; tapping the pill starts a new
     * drawing".
     */
    test("the lasso button closes the card and draws; a large loop becomes «Своя область» with its mask and read, and the list keeps it; the pill draws anew, a tab press ends it; × removes the area", async ({ page }) => {
      test.slow();
      const first = nextRequest(page, isMapRead);
      const app = await openMap(page, engine, ["zones=center", "mapdebug"]);
      await stacksDrawn(page);
      expect(new URL((await first).url()).searchParams.getAll("zones[]")).toEqual(["center"]);
      await expect(locateButton(page)).toBeVisible();
      expect(await masked(page, engine)).toBe(false);
      await tapTopStack(page);
      await expect(card(page)).toBeVisible();
      const start = await haptics(app);

      await lassoButton(page).click();
      await expectDrawing(page, engine);
      await expect(card(page)).toHaveCount(0);
      await expect.poll(async () => (await haptics(app)).light).toBe(start.light + 1);
      // Nothing of the spread stack is left that the mask check below could take for the area.
      expect(await masked(page, engine)).toBe(false);

      const read = nextRequest(page, isMapRead);
      await stroke(page, loop);
      const area = await areaApplied(page);
      const outlined = vertices(area);
      expectInTashkent(outlined);
      expect(searchOf(page).getAll("zones")).toEqual([]);
      expect(searchOf(page).getAll("districts")).toEqual([]);
      // The next read of the map searches inside the area, without districts or zones.
      const asked = new URL((await read).url());
      expect(asked.searchParams.get("polygon")).toBe(area);
      expect(asked.searchParams.getAll("districts[]")).toEqual([]);
      expect(asked.searchParams.getAll("zones[]")).toEqual([]);
      await expect.poll(() => masked(page, engine)).toBe(true);
      // A light haptic at the stroke's start, the success haptic at its end.
      await expect.poll(() => haptics(app)).toEqual({ light: start.light + 2, success: start.success + 1, error: start.error });
      await expect(toggle(page)).toHaveText("Список");
      await expect.poll(() => backVisible(page)).toBe(false);

      // The list searches inside the same area.
      await toggle(page).click();
      await expect.poll(() => pathOf(page)).toBe("/ru");
      expect(searchOf(page).get("polygon")).toBe(area);
      await expect(route(page, "feed")).toBeVisible();

      await toggle(page).click();
      await expect.poll(() => pathOf(page)).toBe("/ru/map");
      expect(searchOf(page).get("polygon")).toBe(area);
      await expect.poll(() => masked(page, engine)).toBe(true);

      // A tap on the pill starts a new drawing; the mask of the area stays meanwhile.
      await areaPill(page).getByRole("button", { name: "Своя область", exact: true }).click();
      await expectDrawing(page, engine);
      expect(searchOf(page).get("polygon")).toBe(area);
      await expect.poll(() => masked(page, engine)).toBe(true);

      // A tab press ends drawing with the route change; the search tab brings the map back as it was.
      await tab(page, "saved").click();
      await expect(route(page, "saved")).toBeVisible();
      await expect(drawBar(page)).toHaveCount(0);
      await tab(page, "search").click();
      await expectPlainMap(page, engine);
      expect(searchOf(page).get("polygon")).toBe(area);
      await expect(areaPill(page)).toBeVisible();

      const light = (await haptics(app)).light;
      const cleared = nextRequest(page, isMapRead);
      await areaPill(page).getByRole("button", { name: "Убрать область", exact: true }).click();
      await expect(areaPill(page)).toHaveCount(0);
      await expect(page).not.toHaveURL(/[?&]polygon=/);
      expect(new URL((await cleared).url()).searchParams.has("polygon")).toBe(false);
      await expect.poll(() => masked(page, engine)).toBe(false);
      await expect.poll(async () => (await haptics(app)).light).toBe(light + 1);
      await expect(lassoButton(page)).toBeVisible();
    });

    /**
     * E3, E4; the states "Too small" and "Area set", the actions "«Отмена»" and "Valid stroke" (districts and zones
     * empty, BR-APP-008); acceptance "A tiny stroke shows «Обведите покрупнее» with an error haptic and drawing
     * continues", "«Отмена» … end[s] drawing without changing filters", "A self-crossing outline still produces an
     * area"; the rule "Self-intersection: the outline is replaced by its convex hull".
     */
    test("a tiny stroke shows «Обведите покрупнее» and drawing goes on; «Отмена» leaves the filters as they were; a figure-eight still becomes an area without districts or zones", async ({ page }) => {
      // The stubs filter the map by districts, so this search draws its own few points (or none): no stacks to wait for.
      const first = page.waitForResponse((response) => isMapRead(new URL(response.url())));
      const app = await openMap(page, engine, ["districts=chilonzor", "zones=center", "mapdebug"]);
      const searched = new URL((await first).url());
      expect(searched.searchParams.getAll("districts[]")).toEqual(["chilonzor"]);
      expect(searched.searchParams.getAll("zones[]")).toEqual(["center"]);
      await expect(visible(page, '[data-map-status="loading"]')).toHaveCount(0);
      const before = filtersOf(page);
      await lassoButton(page).click();
      await expectDrawing(page, engine);
      const start = await haptics(app);

      await stroke(page, tiny);
      await expect(drawHints(page)).toHaveText([TOO_SMALL, MOVE]);
      await expect.poll(async () => (await haptics(app)).error).toBe(start.error + 1);
      await expect(outline(page)).toHaveCount(0);
      await expectDrawing(page, engine, TOO_SMALL);
      expect(searchOf(page).has("polygon")).toBe(false);
      await nothingAsked(page, isMapRead);

      const light = (await haptics(app)).light;
      await drawBar(page).getByRole("button", { name: "Отмена", exact: true }).click();
      await expectPlainMap(page, engine);
      expect(filtersOf(page)).toBe(before);
      expect(searchOf(page).getAll("districts")).toEqual(["chilonzor"]);
      await expect(areaPill(page)).toHaveCount(0);
      await expect.poll(async () => (await haptics(app)).light).toBe(light + 1);
      expect((await haptics(app)).success).toBe(start.success);

      // A new drawing starts from the hint again.
      await lassoButton(page).click();
      await expectDrawing(page, engine);
      const read = nextRequest(page, isMapRead);
      await stroke(page, figureEight);
      const area = await areaApplied(page);
      const outlined = vertices(area);
      expectInTashkent(outlined);
      expect(convex(outlined), `the self-crossing outline is not replaced by its convex hull: ${area}`).toBe(true);
      // The area replaces the districts and the zones (BR-APP-008), in the address and in the next read.
      expect(searchOf(page).getAll("districts")).toEqual([]);
      expect(searchOf(page).getAll("zones")).toEqual([]);
      const asked = new URL((await read).url());
      expect(asked.searchParams.get("polygon")).toBe(area);
      expect(asked.searchParams.getAll("districts[]")).toEqual([]);
      expect(asked.searchParams.getAll("zones[]")).toEqual([]);
      await expect.poll(() => masked(page, engine)).toBe(true);
      await expect.poll(async () => (await haptics(app)).success).toBe(start.success + 1);
    });

    /**
     * E5; the actions "Reload while drawing", "Telegram Back while drawing", "Tab press, SettingsButton"; acceptance
     * "Reloading while drawing keeps drawing mode; Back then leaves it and stays on the map", "… the SettingsButton
     * each end drawing without changing filters".
     */
    test("a reload on /map?draw=1 keeps drawing with the BackButton; Back leaves for /map and the map stays; the SettingsButton ends drawing", async ({ page }) => {
      await openMap(page, engine);
      await stacksDrawn(page);
      await lassoButton(page).click();
      await expectDrawing(page, engine);
      const drawn = filtersOf(page);

      await page.reload();
      await expect(html(page)).toHaveAttribute("data-session", "ready");
      await expect(mapView(page, engine)).toBeVisible({ timeout: 15_000 });
      await expectDrawing(page, engine);
      expect(filtersOf(page)).toBe(drawn);

      await press(page, "backButtonClicked");
      await expectPlainMap(page, engine);
      expect(filtersOf(page)).toBe(drawn);
      await expect.poll(() => backVisible(page)).toBe(false);
      await stacksDrawn(page);

      await lassoButton(page).click();
      await expectDrawing(page, engine);
      await press(page, "settingsButtonClicked");
      await expect(route(page, "settings")).toBeVisible();
      await expect(drawBar(page)).toHaveCount(0);
      await tab(page, "search").click();
      await expectPlainMap(page, engine);
      expect(filtersOf(page)).toBe(drawn);
    });
  });
}

test.describe("map lasso on gl (header mode)", { annotation: [{ type: "screen", description: "SCR-012" }] }, () => {
  /** E2 in header mode: the core path, with the feed's first page read in the browser. */
  test("a large loop becomes «Своя область»; the map read and the feed's first page carry the polygon", async ({ page }) => {
    const first = nextRequest(page, isMapRead);
    await openMap(page, "gl", ["zones=center"], "header");
    await stacksDrawn(page);
    expect(new URL((await first).url()).searchParams.getAll("zones[]")).toEqual(["center"]);

    await lassoButton(page).click();
    await expectDrawing(page, "gl");
    const read = nextRequest(page, isMapRead);
    await stroke(page, loop);
    const area = await areaApplied(page);
    expectInTashkent(vertices(area));
    const asked = new URL((await read).url());
    expect(asked.searchParams.get("polygon")).toBe(area);
    expect(asked.searchParams.getAll("zones[]")).toEqual([]);

    const pageOne = nextRequest(page, isPageOne);
    await toggle(page).click();
    await expect.poll(() => pathOf(page)).toBe("/ru");
    expect(searchOf(page).get("polygon")).toBe(area);
    const feed = new URL((await pageOne).url());
    expect(feed.searchParams.get("polygon")).toBe(area);
    expect(feed.searchParams.getAll("districts[]")).toEqual([]);
    expect(feed.searchParams.getAll("zones[]")).toEqual([]);
    await expect(route(page, "feed")).toBeVisible();
  });
});
