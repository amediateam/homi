import { expect as baseExpect, launchApp, type LaunchedApp, projectSessionMode, shownText, stubMedia, test as base, withScenario } from "@homi/testing/playwright";
import type { Locator, Page, Request, Response } from "@playwright/test";

import { RADAR } from "../support/pages";

/**
 * Journey 3 of WP-33 (`e2e/journeys/`): from a search to a radar and back out of it, against the API on stubs with
 * radars switched on. The feed's filters sheet takes rooms and a price preset, «Показать N» applies them, the view
 * toggle carries the same search to the map, the lasso adds «Своя область», the filters sheet opened from the map
 * turns a radar on for that search, and the «Радар» tab takes over: the radar sheet, «Изменить условия», Back, a
 * save, Back to the tab, a pause answered `ask_found` and the survey's «Ещё ищу».
 *
 * What the journey proves on top of the feature specs (`filters`, `map-lasso`, `radar-subscribe`, `radars`,
 * `radar-forms`): the feed, the map and the filters sheet work on one search. The address, the live count's query,
 * the map's read, the router's render of the feed and, in header mode, the feed's first page read in the browser carry
 * the same keys. The render shows only that the router asked for the address; in cookie mode the feed's first page is
 * read on the server, out of the test's sight, and `tests/feed/FeedServer.test.ts` proves that read sends the
 * address's query. What shows that the feed lists the search, in both modes, is its cards: the stub filters rooms and
 * price in memory, so after «Показать N» the feed holds exactly the counted cards, ends after them, and they are the
 * points of the map's answer. The live count follows the draft: the price preset narrows the rooms-only count, and
 * «Показать N» shows each answer in turn. The chips, the map bar and the collapsed title follow every change of the
 * filters; each toast reads as the legacy text; Back closes the editor, then the sheet, then hides itself on the tab.
 *
 * The stubs store no write: the radar created here never shows on the tab (the stateless list holds the three
 * fixture radars), so the tab part runs on the active fixture radar `RADAR`; and the stub ignores a polygon when it
 * filters, so the drawn area is checked by its parameters only (in cookie mode by the address and the render), never
 * by which listings it keeps: back on the list, the cards only show that rooms and price still hold. The nudges are
 * silenced before the launch (`homi-nudge`), so none of them takes a tap. The map is read engine-free
 * (`[data-map-view]`, `[data-lasso]`): which engine headless Chromium gets is the map specs' concern. One launch of
 * some 50–70 stub requests; the run shares one stub user's API limit (120 a minute, KI-32), so run the journeys one
 * worker at a time locally — a refused count names its status.
 */

/**
 * The local servers are shared with the other spec runs of the session, and the stub API answers one request at a
 * time, so a screen may wait several seconds for its answer: each check waits up to 20 s.
 */
const expect = baseExpect.configure({ timeout: 20_000 });

const test = base.extend<{ photos: readonly string[] }>({
  /** The stub photos answered so far: the feed and the radar sheet show them, and CI has no `cdn.homi.loc`. */
  photos: [async ({ page }, use) => use(await stubMedia(page)), { auto: true }],
});

/** Ten screens in a row, each waiting for the stub API. */
test.describe.configure({ timeout: 240_000 });

interface Fake {
  webApp: { BackButton: { isVisible: boolean } };
  emit(eventType: string): void;
}

type Point = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };

/** How long a launch may take to sign in and show its first screen. */
const LAUNCH_MS = 30_000;

/**
 * A «до N» preset of Tashkent's long rent (`cities/default.json`, `reference/default.ru.json`): `price_max=600`. It
 * narrows the stub's two-room set (`StubListingSource::matches` over `listings/catalog.json` and its repeats: 32
 * two-room flats, 14 of them up to $600; the dearest costs $750, so «до $800» would leave the count and the cards as
 * they were), and it leaves at least 10, below which the stub's flow answer adds relax chips to the footer.
 */
const PRESET = 600;
/** The feed's page size (`FEED_PAGE_SIZE`): a result of at most this many listings is one page, and the list ends. */
const FEED_PAGE = 20;
/** The search after «Показать N», as the address spells it. */
const APPLIED = { city: "tashkent", rooms_min: "2", rooms_max: "2", price_max: String(PRESET) };

/** The legacy toasts of the path (`radars/created.json`, `radars/updated.json`, the survey's «Ещё ищу»). */
const CREATED_TOAST = "Радар включён — новые придут в чат, как только появятся — обычно 2 в день";
const UPDATED_TOAST = "Радар обновлён. Пока пусто";
const SEARCHING_TOAST = "Удачи в поиске! Радар можно снова включить в любой момент";

/** The wire form of an area: 3 to 40 `lat,lon` pairs with 5 decimals, not closed (WP-28 `serializePolygon`). */
const POLYGON = /^-?\d+\.\d{5},-?\d+\.\d{5}(;-?\d+\.\d{5},-?\d+\.\d{5}){2,39}$/;
const MINI = /(^|\s)chrome-mini(\s|$)/;

/**
 * The visible copy only: with `cacheComponents` the router keeps earlier routes hidden in `<Activity>`
 * (`preserving-ui-state.md`), so the same element can be in the document twice.
 */
const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const html = (page: Page) => page.locator("html");
const route = (page: Page, name: string) => visible(page, `[data-route="${name}"]`);
const cards = (page: Page) => visible(page, "article[data-listing]");
/** The search feed's cards (SCR-007) and the end of its list, «Это всё по вашему поиску» (`data-feed-end`). */
const feedCards = (page: Page) => visible(page, '[data-feed="feed"] article[data-listing]');
const feedEnd = (page: Page) => visible(page, '[data-feed="feed"] [data-feed-end]');
/** The listing numbers of the feed's visible cards, sorted. */
const feedNumbers = (page: Page) =>
  feedCards(page).evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("data-listing"))).sort((a, b) => a - b));
const tab =(page: Page, key: "radars") => visible(page, `[data-tab="${key}"]`);
const toggle = (page: Page) => visible(page, "[data-view-toggle]");
/** The search list's chips (SCR-007): `filters`, `sort`, `area`, `rooms`, `price`, `owner`, `city`. */
const listBar = (page: Page) => visible(page, '[data-topbar="search-list"]');
const chip = (page: Page, key: string) => visible(page, `[data-topbar="search-list"] [data-chip="${key}"]`);
/** The one-line title of the collapsed chrome (shown under `html.chrome-mini` only). */
const miniTitle = (page: Page) => visible(page, "[data-mini-title]");
const mapView = (page: Page) => visible(page, "[data-map-view]");
const mapBar = (page: Page) => visible(page, '[data-topbar="map"] [data-slot="map-bar"]');
const lassoButton = (page: Page) => mapBar(page).getByRole("button", { name: "Обвести на карте", exact: true });
const areaPill = (page: Page) => visible(page, '[data-topbar="map"] [data-slot="area-pill"]');
const overlay = (page: Page) => visible(page, "[data-lasso]");
const outline = (page: Page) => visible(page, "[data-lasso-stroke]");
/** The intercepted copy of a sheet address, inside its bottom sheet. */
const sheet = (page: Page, name: string) => visible(page, `[data-slot="bottom-sheet"] [data-route="${name}"][data-layer="sheet"]`);
/** A footer button of the open sheet (outside the `data-route` content). */
const action = (page: Page, name: "apply" | "subscribe" | "save") => visible(page, `[data-slot="bottom-sheet"] [data-action="${name}"]`);
const radarOn = (page: Page) => visible(page, '[data-slot="bottom-sheet"] [data-slot="filters-footer"] [data-state="radar-on"]');
const tile = (page: Page, id: string) => visible(page, `[data-radar-tile="${id}"]`);
const radarSheet = (page: Page, id: string) => visible(page, `[data-route="radar"][data-layer="sheet"][data-radar-id="${id}"]`);
const survey = (page: Page) => visible(page, '[data-route="radars/found"][data-layer="sheet"]');
const layers = (page: Page) => visible(page, "[data-layer]");
const appToast = (page: Page) => visible(page, '[data-toast-host="app"] [data-toast]');
const roomButton = (scope: Locator, label: string) => scope.getByRole("button", { name: label, exact: true });

const press = (page: Page, eventType: "backButtonClicked") =>
  page.evaluate((type) => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit(type), eventType);
const backVisible = (page: Page) =>
  page.evaluate(() => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.webApp.BackButton.isVisible);

const pathOf = (page: Page) => new URL(page.url()).pathname;
const searchOf = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams);
/** The address's search keys, sorted: what the feed and the map must share. */
const searchKeys = (page: Page) => {
  const params = new URL(page.url()).searchParams;
  params.sort();
  return params.toString();
};
/** A listing method's v1 query without its paging (`limit`, `cursor`), sorted: the filters it searched with. */
function v1Filters(url: string): string {
  const params = new URL(url).searchParams;
  params.delete("limit");
  params.delete("cursor");
  params.sort();
  return params.toString();
}

const isCount = (url: URL) => url.pathname === "/bff/listings/count";
const isMapRead = (url: URL) => url.pathname === "/bff/listings/map";
/** The feed's page one: `/bff/listings` without a cursor (a browser read in header mode only). */
const isPageOne = (url: URL) => url.pathname === "/bff/listings" && !url.searchParams.has("cursor");
/** A Server Action call: a POST to the page's address carrying the `Next-Action` header. */
const isServerAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;
/** A server render the router asks for: an RSC request that is neither a prefetch nor a Server Action. */
const isRender = (request: Request) => {
  const headers = request.headers();
  return (
    headers.rsc === "1" &&
    headers["next-router-prefetch"] === undefined &&
    headers["next-router-segment-prefetch"] === undefined &&
    headers["next-action"] === undefined
  );
};
/** A render of the feed's address `/ru`: both session modes ask for one on a new search. */
const isFeedRender = (request: Request) => isRender(request) && new URL(request.url()).pathname === "/ru";
/** A query carrying the applied rooms and price. */
const hasApplied = (url: URL) =>
  url.searchParams.get("rooms_min") === "2" && url.searchParams.get("rooms_max") === "2" && url.searchParams.get("price_max") === String(PRESET);
/** A query carrying the applied rooms and no price yet: the draft before the preset (the opening draft has no rooms). */
const hasRoomsOnly = (url: URL) =>
  url.searchParams.get("rooms_min") === "2" && url.searchParams.get("rooms_max") === "2" && !url.searchParams.has("price_max");
/** The `count` of a `GET /listings/count` answer. */
const countOf = async (response: Response) => ((await response.json()) as { data: { count: number } }).data.count;

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

async function notifications(app: LaunchedApp, type: "success" | "error"): Promise<number> {
  return (await app.calls()).filter((call) => call.member === "HapticFeedback.notificationOccurred" && call.args[0] === type).length;
}

/** Silences the nudges before the launch (`homi-nudge`, WP-30): the follow nudge, the return banner, the feed's radar card. */
async function silenceNudges(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const far = Date.now() + 30 * 24 * 3_600_000;
    try {
      localStorage.setItem("homi-nudge", JSON.stringify({ asked: [], closed: 0, quietUntil: far, lastShown: 0, back: {}, feedOff: far }));
    } catch {
      // No storage on this document (about:blank): nothing to silence there.
    }
  });
}

/** Two animation frames: `useMiniChrome` has read the scroll position of the last scroll event by then. */
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

/** Scrolls the window and waits until `useMiniChrome` has read it (one position per frame). */
async function scrollTo(page: Page, y: number): Promise<void> {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await nextFrames(page);
}

/**
 * Collapses the chrome of the search list and reads its title, then expands it again at the top: the first tap on
 * collapsed chrome only expands it, so nothing may be tapped while it is collapsed.
 */
async function collapsedTitle(page: Page, title: string): Promise<void> {
  await expect(cards(page).first()).toBeVisible();
  await scrollTo(page, 40);
  await scrollTo(page, 400);
  await expect(html(page)).toHaveClass(MINI);
  await expect(miniTitle(page)).toBeVisible();
  await expect(miniTitle(page)).toHaveText(title);
  await scrollTo(page, 0);
  await expect(html(page)).not.toHaveClass(MINI);
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

/** Draws `path` over the lasso overlay with the mouse's main button; the outline follows the pointer midway. */
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
    if (index === Math.floor(rest.length / 2)) {
      await expect(outline(page)).toBeVisible();
    }
  }
  await page.mouse.up();
}

/** The address's polygon as the radar body spells it: `[[lat, lon], …]` of the parsed numbers. */
const polygonJson = (wire: string) => JSON.stringify(wire.split(";").map((pair) => pair.split(",").map(Number)));

test.describe(
  "search to radar @journey",
  {
    annotation: [
      { type: "screen", description: "SCR-006" },
      { type: "screen", description: "SCR-007" },
      { type: "screen", description: "SCR-011" },
      { type: "screen", description: "SCR-012" },
      { type: "screen", description: "SCR-014" },
      { type: "screen", description: "SCR-026" },
      { type: "screen", description: "SCR-028" },
      { type: "screen", description: "SCR-029" },
      { type: "screen", description: "SCR-031" },
      { type: "screen", description: "SCR-042" },
    ],
  },
  () => {
    test("filters → «Показать N» → map → «Своя область» → «Включить радар» → radar sheet → editor → save → pause → «Ещё ищу»: one search everywhere, each toast, Back in order", async ({ page }) => {
      const header = projectSessionMode(test.info()) === "header";
      await silenceNudges(page);
      const app = await launchApp(page, { path: "/" });
      // The servers are shared with other spec runs: a sign-in may queue behind them, and the boot retry covers a refusal.
      await expect(html(page)).toHaveAttribute("data-session", "ready", { timeout: LAUNCH_MS });
      await expect(cards(page).first()).toBeVisible({ timeout: LAUNCH_MS });
      await expect(chip(page, "rooms")).toHaveAttribute("data-state", "off");
      await expect(chip(page, "price")).toHaveAttribute("data-state", "off");

      let countQuery = "";
      let feedQuery: string | null = null;
      /** The listing numbers the feed shows for the applied search, sorted. */
      let shownNumbers: number[] = [];

      await test.step(`the filters sheet: rooms 2, then «до $${PRESET}»; «Показать N» follows each count and applies them to the feed`, async () => {
        await chip(page, "filters").click();
        const filters = sheet(page, "filters");
        await expect(filters).toBeVisible();
        await expect.poll(() => backVisible(page)).toBe(true);
        // The live count of the draft with rooms only: it is asked for 250 ms after the rooms tap.
        const roomsCounted = page.waitForResponse((response) => isCount(new URL(response.url())) && hasRoomsOnly(new URL(response.url())));

        await roomButton(filters.locator('[data-section="rooms"]'), "2").click();
        await expect(roomButton(filters.locator('[data-section="rooms"]'), "2")).toHaveAttribute("aria-pressed", "true");
        const roomsAnswer = await roomsCounted;
        // A refusal (the shared stub user's limit, KI-32) fails here by its status, not as «Показать undefined».
        expect(roomsAnswer.ok(), `the rooms-only count answered ${roomsAnswer.status()}`).toBe(true);
        const roomsCount = await countOf(roomsAnswer);
        await expect.poll(() => shownText(action(page, "apply"))).toBe(`Показать ${roomsCount}`);

        // The live count of the whole draft: rooms and price in one query.
        const counted = page.waitForResponse((response) => isCount(new URL(response.url())) && hasApplied(new URL(response.url())));
        const preset = filters.locator(`[data-section="price"] [data-preset="${PRESET}"]`);
        await expect(preset).toHaveText(`до $${PRESET}`);
        await preset.click();
        await expect(preset).toHaveAttribute("aria-pressed", "true");

        const answer = await counted;
        expect(answer.ok(), `the count answered ${answer.status()}`).toBe(true);
        countQuery = v1Filters(answer.url());
        const count = await countOf(answer);
        expect(count, `the stub finds two-room flats up to $${PRESET} in Tashkent`).toBeGreaterThan(0);
        // The preset cuts the rooms-only result, so a label left at the rooms-only answer fails below.
        expect(count, "the price preset narrows the two-room count").toBeLessThan(roomsCount);
        expect(count, `the whole result fits the feed's first page of ${FEED_PAGE}`).toBeLessThanOrEqual(FEED_PAGE);
        await expect.poll(() => shownText(action(page, "apply"))).toBe(`Показать ${count}`);

        const firstPages = recordRequests(page, (request) => isPageOne(new URL(request.url())));
        const renders = recordRequests(page, isFeedRender);
        await action(page, "apply").click();
        await expect.poll(() => ({ pathname: pathOf(page), search: searchOf(page) })).toEqual({ pathname: "/ru", search: APPLIED });
        await expect(layers(page)).toHaveCount(0);
        await expect.poll(() => backVisible(page)).toBe(false);
        await expect(route(page, "feed")).toBeVisible();
        // The feed lists the applied search in both modes, whoever read its page one: exactly the counted cards, then
        // the end of the list. A list of another search fails here (the default search's page one holds 20 cards and
        // goes on); which listings they are is checked against the map's answer below.
        await expect(feedCards(page)).toHaveCount(count);
        await expect(feedEnd(page)).toBeVisible();
        shownNumbers = await feedNumbers(page);
        // The router renders the feed for the applied search in both modes (`filters.spec.ts` `watchFeed`).
        await expect
          .poll(() => renders.some((request) => hasApplied(new URL(request.url()))), { message: "the feed was rendered with rooms and price" })
          .toBe(true);
        if (header) {
          // Header mode reads the new page one in the browser; cookie mode adopts the server's.
          await expect.poll(() => firstPages.filter((request) => hasApplied(new URL(request.url()))).length).toBeGreaterThan(0);
          feedQuery = v1Filters(firstPages.filter((request) => hasApplied(new URL(request.url())))[0].url());
          expect(feedQuery, "the feed searched with the count's filters").toBe(countQuery);
        }
      });

      await test.step("the chips and the collapsed title follow the filters", async () => {
        await expect(chip(page, "rooms")).toHaveAttribute("data-state", "on");
        await expect(chip(page, "rooms")).toHaveText("2-комн.");
        await expect(chip(page, "price")).toHaveAttribute("data-state", "on");
        await expect(chip(page, "price")).toHaveText(`до $${PRESET}`);
        await expect(listBar(page).getByRole("button", { name: "Фильтры, 2", exact: true })).toBeVisible();
        await expect(chip(page, "area")).toHaveCount(0);
        await collapsedTitle(page, `Аренда · Ташкент · 2-комн. · до $${PRESET}`);
      });

      const feedSearch = searchKeys(page);

      await test.step("the view toggle carries the same search to the map", async () => {
        const mapRead = page.waitForResponse((response) => isMapRead(new URL(response.url())));
        await expect(toggle(page)).toHaveText("Карта");
        await toggle(page).click();
        await expect.poll(() => pathOf(page)).toBe("/ru/map");
        await expect.poll(() => searchKeys(page)).toBe(feedSearch);
        // The first map of a page loads the library (and on GL starts its worker): slow on a loaded machine.
        await expect(mapView(page)).toBeVisible({ timeout: 30_000 });
        const mapAnswer = await mapRead;
        expect(v1Filters(mapAnswer.url()), "the map searched with the feed's filters").toBe(countQuery);
        expect(mapAnswer.ok(), `the map's read answered ${mapAnswer.status()}`).toBe(true);
        // Every listing of this search has a location in the stub catalogue, so the map's points are the whole result:
        // the feed showed exactly these listings.
        const { data } = (await mapAnswer.json()) as { data: { points: { number: number }[] } };
        expect(
          data.points.map((point) => point.number).sort((a, b) => a - b),
          "the feed's cards are the listings the map found",
        ).toEqual(shownNumbers);
        // The answer is drawn: markers of any kind (the search is filtered, so no fixed count), then no status pill.
        await expect(visible(page, "[data-marker]").first()).toBeVisible();
        await expect(visible(page, "[data-map-status]")).toHaveCount(0);
        await expect(toggle(page)).toHaveText("Список");
        await expect(mapBar(page).getByRole("button", { name: "Фильтры, 2", exact: true })).toBeVisible();
        await expect(lassoButton(page)).toHaveAttribute("data-state", "off");
        await expect(areaPill(page)).toHaveCount(0);
        await expect.poll(() => backVisible(page)).toBe(false);
      });

      let area = "";

      await test.step("the lasso: a large loop becomes «Своя область», the map searches inside it with the same filters", async () => {
        await lassoButton(page).click();
        await expect(page).toHaveURL(/[?&]draw=1(&|$)/);
        await expect(overlay(page)).toBeVisible({ timeout: 15_000 });
        await expect.poll(() => backVisible(page)).toBe(true);
        const read = page.waitForRequest((request) => isMapRead(new URL(request.url())) && new URL(request.url()).searchParams.has("polygon"));

        await stroke(page, loop);
        await expect.poll(() => new URL(page.url()).searchParams.get("polygon") ?? "").toMatch(POLYGON);
        await expect(page).not.toHaveURL(/[?&]draw=/);
        area = new URL(page.url()).searchParams.get("polygon") ?? "";
        expect(pathOf(page)).toBe("/ru/map");
        expect(searchOf(page)).toEqual({ ...APPLIED, polygon: area });
        await expect(areaPill(page).getByRole("button", { name: "Своя область", exact: true })).toBeVisible();
        await expect(overlay(page)).toHaveCount(0);

        const asked = new URL((await read).url());
        expect(asked.searchParams.get("polygon")).toBe(area);
        const withArea = new URLSearchParams(countQuery);
        withArea.append("polygon", area);
        withArea.sort();
        expect(v1Filters(asked.href), "the map's read keeps rooms and price and adds the area").toBe(withArea.toString());

        await expect(lassoButton(page)).toHaveAttribute("data-state", "on");
        await expect(mapBar(page).getByRole("button", { name: "Фильтры, 3", exact: true })).toBeVisible();
        await expect.poll(() => backVisible(page)).toBe(false);
      });

      const mapSearch = searchKeys(page);

      await test.step("the filters sheet over the map holds the whole search; «Включить радар» turns a radar on for it", async () => {
        await mapBar(page).getByRole("button", { name: "Фильтры, 3", exact: true }).click();
        await expect(page).toHaveURL(/\/ru\/filters\?.*from=map/);
        const filters = sheet(page, "filters");
        await expect(filters).toBeVisible();
        await expect(filters.locator('[data-section="where"]').getByRole("button", { name: "Своя область на карте", exact: true })).toHaveAttribute("aria-pressed", "true");
        await expect(roomButton(filters.locator('[data-section="rooms"]'), "2")).toHaveAttribute("aria-pressed", "true");
        await expect(filters.locator(`[data-section="price"] [data-preset="${PRESET}"]`)).toHaveAttribute("aria-pressed", "true");
        // No fixture radar has this search: the footer offers the button, not ✓ «Радар включён».
        await expect(action(page, "subscribe")).toHaveText("Включить радар");
        await expect(action(page, "subscribe")).toBeEnabled();
        await expect(radarOn(page)).toHaveCount(0);

        const actions = recordRequests(page, isServerAction);
        const success = await notifications(app, "success");
        await action(page, "subscribe").click();

        await expect(appToast(page)).toHaveText(CREATED_TOAST);
        // The sheet closes without applying anything: the map of the same search, no layer left.
        await expect(layers(page)).toHaveCount(0);
        await expect.poll(() => pathOf(page)).toBe("/ru/map");
        await expect.poll(() => searchKeys(page)).toBe(mapSearch);
        await expect.poll(() => backVisible(page)).toBe(false);
        expect(actions).toHaveLength(1);
        const body = actions[0].postData() ?? "";
        expect(body).toContain('"entry":"filters"');
        expect(body).toContain('"rooms_min":2,"rooms_max":2');
        expect(body).toContain(`"price_max":${PRESET}`);
        expect(body).toContain(`"polygon":${polygonJson(area)}`);
        expect(await notifications(app, "success")).toBe(success + 1);
      });

      await test.step("back on the list: the same search with «Своя область» in the chips and the collapsed title", async () => {
        const firstPages = recordRequests(page, (request) => isPageOne(new URL(request.url())));
        const renders = recordRequests(page, isFeedRender);
        await toggle(page).click();
        await expect.poll(() => pathOf(page)).toBe("/ru");
        await expect.poll(() => searchKeys(page)).toBe(mapSearch);
        await expect(route(page, "feed")).toBeVisible();
        await expect(chip(page, "area")).toHaveAttribute("data-state", "on");
        await expect(chip(page, "area")).toHaveText("Своя область");
        await expect(chip(page, "rooms")).toHaveText("2-комн.");
        await expect(chip(page, "price")).toHaveText(`до $${PRESET}`);
        await expect(listBar(page).getByRole("button", { name: "Фильтры, 3", exact: true })).toBeVisible();
        await expect
          .poll(
            () =>
              renders.some((request) => {
                const url = new URL(request.url());
                return hasApplied(url) && url.searchParams.get("polygon") === area;
              }),
            { message: "the feed was rendered with rooms, price and the area" },
          )
          .toBe(true);
        if (header) {
          await expect.poll(() => firstPages.some((request) => new URL(request.url()).searchParams.get("polygon") === area)).toBe(true);
          const read = firstPages.find((request) => new URL(request.url()).searchParams.get("polygon") === area);
          const withArea = new URLSearchParams(feedQuery ?? "");
          withArea.append("polygon", area);
          withArea.sort();
          expect(v1Filters(read?.url() ?? "http://x/"), "the feed searched with the map's filters").toBe(withArea.toString());
        }
        await collapsedTitle(page, `Аренда · Ташкент · Своя область · 2-комн. · до $${PRESET}`);
        // Still the rooms and price set: the stub ignores the polygon, so the cards stay the ones found before and the
        // list still ends after them. This is no proof of the area, which only the parameters above show.
        await expect(feedCards(page)).toHaveCount(shownNumbers.length);
        await expect(feedEnd(page)).toBeVisible();
        expect(await feedNumbers(page), "the feed still lists two-room flats up to the preset").toEqual(shownNumbers);
      });

      await test.step("the «Радар» tab and the radar sheet; Back closes the editor to the sheet", async () => {
        await tab(page, "radars").click();
        await expect(page).toHaveURL(/\/ru\/radars$/);
        await expect(visible(page, '[data-topbar="radars"] h1')).toHaveText("Радар");
        // The stub list is stateless: the three fixture radars, not the one created above.
        await expect(visible(page, "[data-radar-tile]")).toHaveCount(3);
        await expect(layers(page)).toHaveCount(0);
        await expect.poll(() => backVisible(page)).toBe(false);

        await tile(page, RADAR).locator("[data-radar-open]").click();
        await expect(page).toHaveURL(new RegExp(`/ru/radars/${RADAR}$`));
        await expect(radarSheet(page, RADAR)).toBeVisible();
        await expect(page.getByRole("dialog", { name: "2-комн. · до $700" })).toBeVisible();
        await expect.poll(() => backVisible(page)).toBe(true);

        const edit = radarSheet(page, RADAR).locator("[data-radar-edit]");
        await expect(edit).toHaveText("Изменить условия");
        await edit.click();
        await expect(page).toHaveURL(new RegExp(`/ru/radars/${RADAR}/edit$`));
        await expect(sheet(page, "radar/edit")).toBeVisible();
        await expect(page.getByRole("dialog", { name: "Условия радара" })).toBeVisible();

        await press(page, "backButtonClicked");
        await expect(page).toHaveURL(new RegExp(`/ru/radars/${RADAR}$`));
        await expect(visible(page, '[data-route="radar/edit"]')).toHaveCount(0);
        await expect(radarSheet(page, RADAR)).toBeVisible();
        await expect.poll(() => backVisible(page)).toBe(true);
      });

      await test.step("«Изменить условия» → «Сохранить» closes the editor to the sheet with «Радар обновлён. Пока пусто»; Back goes to the tab", async () => {
        await radarSheet(page, RADAR).locator("[data-radar-edit]").click();
        await expect(page).toHaveURL(new RegExp(`/ru/radars/${RADAR}/edit$`));
        const editor = sheet(page, "radar/edit");
        await expect(editor).toBeVisible();
        // The editor starts from the radar's own filters (`radars/list.json`: Юнусабад and Мирабад, 2 rooms, up to
        // $700), not from the search above (an area, up to $600): rooms 2 are in both, the price and the districts are not.
        await expect(roomButton(editor.locator('[data-section="rooms"]'), "2")).toHaveAttribute("aria-pressed", "true");
        await expect(editor.locator('[data-section="price"] input[name="price_max"]')).toHaveValue("700");
        await expect(editor.locator('[data-section="where"]').getByRole("button", { name: "Юнусабад", exact: true })).toHaveAttribute("aria-pressed", "true");
        await expect(editor.locator('[data-section="where"]').getByRole("button", { name: "Своя область на карте", exact: true })).toHaveCount(0);
        await roomButton(editor.locator('[data-section="rooms"]'), "3").click();
        await expect(roomButton(editor.locator('[data-section="rooms"]'), "3")).toHaveAttribute("aria-pressed", "true");
        await expect(action(page, "save")).toHaveText("Сохранить");

        const actions = recordRequests(page, isServerAction);
        await action(page, "save").click();
        await expect(appToast(page)).toHaveText(UPDATED_TOAST);
        await expect(page).toHaveURL(new RegExp(`/ru/radars/${RADAR}$`));
        await expect(visible(page, '[data-route="radar/edit"]')).toHaveCount(0);
        await expect(radarSheet(page, RADAR)).toBeVisible();
        expect(actions).toHaveLength(1);
        const body = actions[0].postData() ?? "";
        expect(body).toContain(`"id":"${RADAR}"`);
        // A second room button widens the range (`RoomsPicker`): 2–3.
        expect(body).toContain('"rooms_min":2,"rooms_max":3');
        expect(body).toContain('"districts":["yunusobod","mirobod"]');
        expect(body).toContain('"price_max":700');
        expect(body).not.toContain('"entry"');

        await press(page, "backButtonClicked");
        await expect(page).toHaveURL(/\/ru\/radars$/);
        await expect(layers(page)).toHaveCount(0);
        await expect(visible(page, "[data-radar-tile]")).toHaveCount(3);
        await expect.poll(() => backVisible(page)).toBe(false);
      });

      await test.step("a pause answered ask_found pushes «Нашли жильё?»; «Ещё ищу» closes it to the tab with its toast", async () => {
        const tileSwitch = tile(page, RADAR).getByRole("switch");
        await expect(tileSwitch).toHaveAttribute("aria-checked", "true");
        const actions = recordRequests(page, isServerAction);
        const paused = page.waitForResponse(
          (response) => isServerAction(response.request()) && (response.request().postData() ?? "").includes(`{"id":"${RADAR}","active":false}`),
        );
        await withScenario(page, "ask_found", async () => {
          await tileSwitch.click();
          await paused;
          await expect.poll(() => pathOf(page) + new URL(page.url()).search).toBe("/ru/radars/found?trigger=pause");
        });
        await expect(survey(page)).toHaveAttribute("data-step", "ask");
        await expect(page.getByRole("dialog", { name: "Нашли жильё?" })).toBeVisible();

        const searching = survey(page).locator('[data-found="searching"]');
        await expect(searching).toHaveText("Ещё ищу");
        await searching.click();
        await expect(appToast(page)).toHaveText(SEARCHING_TOAST);
        await expect(page).toHaveURL(/\/ru\/radars$/);
        await expect(layers(page)).toHaveCount(0);
        await expect(visible(page, "[data-radar-tile]")).toHaveCount(3);
        await expect.poll(() => actions.at(-1)?.postData() ?? "").toContain('{"answer":"searching","trigger":"pause"}');
        await expect.poll(() => backVisible(page)).toBe(false);
      });
    });
  },
);
