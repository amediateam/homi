import { expect, launchApp, stubMedia, test as base, type LaunchedApp } from "@homi/testing/playwright";
import type { Page, Request } from "@playwright/test";

/**
 * Feed continuity (WP-38): the long return of the search feed and its fresh pill (BR-APP-104, SCR-063), the list's
 * scroll memory across the map, the tabs and Telegram's Settings button (BR-APP-105, TMA-023), the radar sheet's two
 * scrolls after a find (SCR-028, DEC-64) and the sale switch of a launch listing (BR-APP-108, DEC-65). Six hours away
 * are the page's clock moved on while it is hidden (`page.clock`), without the timers that would have fired; the
 * visibility is the document's `visibilityState`, which `tg.onHidden` and `tg.onVisible` read (WP-21). With radars on
 * (CI) the return banner may ask `GET /listings/new` after the same long return: the pill's request is told apart by its
 * `since`, the moment the list was created, which is before the app went away; the banner's is the visit recorded then.
 */

const test = base.extend<{ photos: readonly string[] }>({
  /** The stub photos answered so far: every test answers them itself, as CI has no `cdn.homi.loc`. */
  photos: [async ({ page }, use) => use(await stubMedia(page)), { auto: true }],
});

interface Fake {
  emit(eventType: string): void;
}

const HOUR_MS = 60 * 60 * 1000;
const API_MS = 20_000;

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const route = (page: Page, name: string) => visible(page, `[data-route="${name}"]`);
const html = (page: Page) => page.locator("html");
const cards = (page: Page) => visible(page, "article[data-listing]");
const tab = (page: Page, key: "search" | "saved" | "radars" | "settings") => visible(page, `[data-tab="${key}"]`);
const toggle = (page: Page) => visible(page, "[data-view-toggle]");
const pill = (page: Page) => visible(page, "[data-fresh-pill]");
const press = (page: Page, eventType: "backButtonClicked" | "settingsButtonClicked") =>
  page.evaluate((type) => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit(type), eventType);
const scrollY = (page: Page) => page.evaluate(() => window.scrollY);
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

/** The feed's page one: `/bff/listings` without a cursor. */
const isPageOne = (request: Request) => {
  const url = new URL(request.url());
  return url.pathname === "/bff/listings" && !url.searchParams.has("cursor");
};
const isNew = (request: Request) => new URL(request.url()).pathname === "/bff/listings/new";
const sinceOf = (request: Request) => Number(new URL(request.url()).searchParams.get("since"));

/** Every request matching `match` from now on. */
function record(page: Page, match: (request: Request) => boolean): Request[] {
  const seen: Request[] = [];
  page.on("request", (request) => {
    if (match(request)) {
      seen.push(request);
    }
  });
  return seen;
}

/** `GET /listings/new` answers `count` in the API's envelope. */
const answerNew = (page: Page, count: number) =>
  page.route(
    (url) => url.pathname === "/bff/listings/new",
    (handled) =>
      handled.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { count }, meta: { source: "stub" } }) }),
  );

/**
 * Launches the app as the bot does and waits for the session; `clock` installs the page's clock first, for the cases
 * that move it on (the long return).
 */
async function open(
  page: Page,
  mode: "cookie" | "header",
  { clock = false, ...options }: { path?: string; startParam?: string; clock?: boolean } = {},
): Promise<LaunchedApp> {
  if (clock) {
    await page.clock.install();
  }
  const app = await launchApp(page, { mode, ...options });
  await expect(html(page)).toHaveAttribute("data-session", "ready", { timeout: API_MS });
  return app;
}

/**
 * The app hidden for `hours` and shown again; says when it went away (page clock, seconds). The timers of those hours
 * do not run: only the clock moves on.
 */
async function away(page: Page, hours: number): Promise<number> {
  const hiddenAt = await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    return Date.now();
  });
  await page.clock.setSystemTime(hiddenAt + hours * HOUR_MS);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    Reflect.deleteProperty(document, "visibilityState");
  });
  return Math.floor(hiddenAt / 1000);
}

/** Scrolls the window and lets the collapsing chrome read it. */
async function scrollTo(page: Page, y: number): Promise<void> {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await nextFrames(page);
}

/**
 * Collapsed chrome clips the tab bar to the circle around the active tab and the view toggle to its icon (SCR-006): a
 * press on the active tab there only expands it.
 */
async function expand(page: Page): Promise<void> {
  if (await html(page).evaluate((node) => node.classList.contains("chrome-mini"))) {
    await visible(page, '[data-tab][aria-current="page"]').click();
    await expect(html(page)).not.toHaveClass(/chrome-mini/);
  }
}

/** A tab press, on expanded chrome. */
async function pressTab(page: Page, key: "search" | "saved" | "radars" | "settings"): Promise<void> {
  await expand(page);
  await tab(page, key).click();
}

/** The list/map toggle, on expanded chrome. */
async function pressToggle(page: Page): Promise<void> {
  await expand(page);
  await toggle(page).click();
}

/** The list long enough to scroll: page one and the next. */
async function longList(page: Page): Promise<void> {
  await expect(cards(page).first()).toBeVisible({ timeout: API_MS });
  await expect
    .poll(async () => {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      return cards(page).count();
    })
    .toBeGreaterThan(20);
  await scrollTo(page, 0);
}

for (const mode of ["cookie", "header"] as const) {
  test.describe(`feed continuity (${mode} mode)`, () => {
    test("a listing open, 7 h away: one count request; after the close «Показать 3 новых»; a tap reloads from page one", async ({ page }) => {
      await answerNew(page, 3);
      await open(page, mode, { clock: true });
      await expect(cards(page).first()).toBeVisible({ timeout: API_MS });
      const shown = await page.evaluate(() => Math.floor(Date.now() / 1000));
      await cards(page).first().locator("a").click();
      await expect(route(page, "listing")).toBeVisible();

      const asked = record(page, isNew);
      const hiddenAt = await away(page, 7);

      // The list was created before its cards showed; the banner's visit (radars on) is the moment the app went away.
      await expect.poll(() => asked.filter((request) => sinceOf(request) < hiddenAt).length).toBe(1);
      const mine = asked.find((request) => sinceOf(request) < hiddenAt)!;
      expect(sinceOf(mine)).toBeLessThanOrEqual(shown);
      expect(new URL(mine.url()).searchParams.get("city")).not.toBeNull();
      await expect(pill(page)).toHaveCount(0);

      await press(page, "backButtonClicked");
      await expect(route(page, "listing")).toHaveCount(0);
      await expect(pill(page)).toHaveText("Показать 3 новых");

      // With the chrome collapsed it hangs under the top of the screen and takes the tap.
      await scrollTo(page, 900);
      await expect(html(page)).toHaveClass(/chrome-mini/);
      await expect
        .poll(() =>
          pill(page).evaluate((node) => {
            const box = node.getBoundingClientRect();
            const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            return box.top >= 0 && box.bottom <= window.innerHeight && hit !== null && node.contains(hit);
          }),
        )
        .toBe(true);

      const pageOnes = record(page, isPageOne);
      await pill(page).click();
      await expect(pill(page)).toHaveCount(0);
      await expect.poll(() => pageOnes.length).toBe(1);
      expect(await scrollY(page)).toBe(0);
    });

    test("at the top with nothing open, 7 h away: a silent reload and no pill; on another tab the feed comes back re-created at its top", async ({
      page,
    }) => {
      await answerNew(page, 3);
      await open(page, mode, { clock: true });
      await longList(page);

      const pageOnes = record(page, isPageOne);
      const hiddenAt = await away(page, 7);
      await expect.poll(() => pageOnes.length).toBe(1);
      await nextFrames(page);
      await expect(pill(page)).toHaveCount(0);

      // Scrolled, then the radar tab: the long return there re-creates the hidden feed and drops its memory.
      await longList(page);
      await scrollTo(page, 1400);
      await pressTab(page, "radars");
      await expect(page).toHaveURL(/\/ru\/radars$/);
      const asked = record(page, isNew);
      const second = await away(page, 7);
      expect(second).toBeGreaterThan(hiddenAt);
      // Off the search tab nothing is asked for: neither the count nor the banner, which records no visit there.
      await nextFrames(page);
      expect(asked).toHaveLength(0);
      await pressTab(page, "search");
      await expect(route(page, "feed")).toBeVisible();
      await expect.poll(() => pageOnes.length).toBe(2);
      expect(await scrollY(page)).toBe(0);
    });

    test("the list's scroll survives the map, the Heart tab and the Settings button", async ({ page }) => {
      await open(page, mode);
      await longList(page);

      await scrollTo(page, 1500);
      await pressToggle(page);
      await expect(page).toHaveURL(/\/ru\/map/);
      await pressToggle(page);
      await expect(route(page, "feed")).toBeVisible();
      await expect.poll(() => scrollY(page)).toBe(1500);

      await pressTab(page, "saved");
      await expect(page).toHaveURL(/\/ru\/saved/);
      await pressTab(page, "search");
      await expect(route(page, "feed")).toBeVisible();
      await expect.poll(() => scrollY(page)).toBe(1500);

      await press(page, "settingsButtonClicked");
      await expect(route(page, "settings")).toBeVisible();
      await press(page, "backButtonClicked");
      await expect(route(page, "feed")).toBeVisible();
      await expect.poll(() => scrollY(page)).toBe(1500);

      // A second press of the active tab forgets it: the top, and the top again after the map.
      await pressTab(page, "search");
      await expect.poll(() => scrollY(page)).toBe(0);
      await pressToggle(page);
      await expect(page).toHaveURL(/\/ru\/map/);
      await pressToggle(page);
      await expect(route(page, "feed")).toBeVisible();
      expect(await scrollY(page)).toBe(0);
    });

    test("a sale launch listing over the rent feed leaves the sale feed of the same city; a daily-rent one changes nothing", async ({
      page,
    }) => {
      await open(page, mode, { startParam: "l_100008-web" });
      await expect(page).toHaveURL(/\/ru\/listing\/100008$/, { timeout: API_MS });
      await expect(visible(page, '[data-route="listing"] [data-listing-state="loaded"]')).toBeVisible({ timeout: API_MS });

      await press(page, "backButtonClicked");

      await expect(page).toHaveURL(/\/ru\?/);
      const search = new URL(page.url()).searchParams;
      expect(search.get("deal")).toBe("sale");
      expect(search.get("city")).not.toBeNull();
      await expect(route(page, "feed")).toBeVisible();

      const next = await page.context().newPage();
      await stubMedia(next);
      await open(next, mode, { startParam: "l_100005-web" });
      await expect(next).toHaveURL(/\/ru\/listing\/100005$/, { timeout: API_MS });
      await expect(visible(next, '[data-route="listing"] [data-listing-state="loaded"]')).toBeVisible({ timeout: API_MS });
      await press(next, "backButtonClicked");
      await expect(next).toHaveURL(/\/ru$/);
    });
  });
}

test.describe("feed continuity: the radar sheet (radars on)", () => {
  test("a find opened from the strip and closed leaves the strip and the sheet where they were", async ({ page }) => {
    await open(page, "cookie", { path: "/radars" });
    const tile = visible(page, "[data-radar-tile] [data-radar-open]").first();
    await expect(tile).toBeVisible({ timeout: API_MS });
    await tile.click();
    const strip = visible(page, '[data-radar-strip="finds"]');
    await expect(strip).toBeVisible({ timeout: API_MS });
    const body = visible(page, '[data-slot="bottom-sheet-body"]');
    const place = await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>('[data-route="radar"] [data-radar-strip="finds"]')!;
      const scroller = row.closest<HTMLElement>('[data-slot="bottom-sheet-body"]')!;
      row.scrollLeft = 120;
      scroller.scrollTop = 80;
      return { x: row.scrollLeft, y: scroller.scrollTop };
    });
    expect(place.x).toBeGreaterThan(0);

    await visible(page, "[data-radar-find]").first().click();
    await expect(route(page, "listing")).toBeVisible();
    await press(page, "backButtonClicked");

    await expect(strip).toBeVisible();
    await expect.poll(() => strip.evaluate((node) => node.scrollLeft)).toBe(place.x);
    await expect.poll(() => body.evaluate((node) => node.scrollTop)).toBe(place.y);
  });
});
