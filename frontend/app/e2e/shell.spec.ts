import { expect, launchApp, test, type LaunchedApp } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

/**
 * The shell of WP-23 (SCR-006, SCR-010, `03` §1.2) over the feed of WP-24, the placeholder routes and the API on
 * stubs: the tab bar and its memory, the collapsing chrome, the list / map switch and the map bar, the deal switch,
 * pull-to-refresh on the feed, and a sheet route closed four ways, in cookie mode and (the tests that navigate, pull
 * and open a sheet) in header mode; without the Telegram SDK the app's own close cross on the listing and on a
 * sub-page, and the page under a sub-page that does not scroll (WP-36). The last block keeps the browser proof of the
 * part B wrappers on the dev gallery (`/dev/ui`): the toast host, `RouteSheet`, `SubPage` and `RouteOverlay`.
 */

interface Fake {
  webApp: { BackButton: { isVisible: boolean } };
  emit(eventType: string): void;
}

/** Safari on an iPhone and Chrome on Android: the swipe back follows the User-Agent (TMA-041, D-SH-6). */
const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

const press = (page: Page, eventType: "backButtonClicked" | "settingsButtonClicked") =>
  page.evaluate((type) => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit(type), eventType);
const backVisible = (page: Page) =>
  page.evaluate(() => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.webApp.BackButton.isVisible);

/**
 * The visible copy only: with `cacheComponents` the router keeps earlier routes hidden in `<Activity>`
 * (`preserving-ui-state.md`), so the same element can be in the document twice.
 */
const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const route = (page: Page, name: string) => visible(page, `[data-route="${name}"]`);
const tab = (page: Page, key: "search" | "saved" | "radars" | "settings") => visible(page, `[data-tab="${key}"]`);
const toggle = (page: Page) => visible(page, "[data-view-toggle]");
const html = (page: Page) => page.locator("html");
const filtersSheet = (page: Page) => visible(page, '[data-slot="bottom-sheet"] [data-route="filters"][data-layer="sheet"]');
/** The filters chip of the feed's top bar (WP-24): it pushes the filters sheet with the search state. */
const filtersChip = (page: Page) => visible(page, '[data-topbar="search-list"] [data-chip="filters"]');
const cards = (page: Page) => visible(page, "article[data-listing]");

/** The feed's page-one reads through `/bff` from now on: `/bff/listings` without a cursor (WP-24). */
function recordFirstPages(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/bff/listings" && !url.searchParams.has("cursor")) {
      seen.push(request.url());
    }
  });
  return seen;
}
const MINI = /(^|\s)chrome-mini(\s|$)/;

/** Light impacts the page asked the fake Telegram for so far (TMA-025). */
async function impacts(app: LaunchedApp): Promise<number> {
  return (await app.calls()).filter((call) => call.member === "HapticFeedback.impactOccurred" && call.args[0] === "light").length;
}

/** The entrance animation (rise, slide-in) has ended, so a gesture lands where the layer rests. */
const settled = (page: Page, selector: string) =>
  visible(page, selector).evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));

/** The search keys of the current address, in their order. */
const searchOf = (page: Page) => new URL(page.url()).searchParams;

/** A one-finger touch drag through the CDP, as a finger on a phone (pull-to-refresh, swipe back). */
async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 10): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let step = 1; step <= steps; step += 1) {
    const point = { x: from.x + ((to.x - from.x) * step) / steps, y: from.y + ((to.y - from.y) * step) / steps };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** Drags a sheet down by its title row with the mouse (pointer events), far past the 25 % threshold. */
async function dragSheetDown(page: Page): Promise<void> {
  await settled(page, '[data-slot="bottom-sheet"]');
  const header = await visible(page, '[data-slot="bottom-sheet-title"]').boundingBox();
  if (header === null) {
    throw new Error("no sheet header");
  }
  await page.mouse.move(header.x + 4, header.y + header.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(header.x + 4, header.y + header.height / 2 + step * 40);
  }
  await page.mouse.up();
}

/** Two animation frames: `useMiniChrome` has read the scroll position of the last scroll event by then. */
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

/**
 * Scrolls the window and waits until `useMiniChrome` has read it. The hook reads one position per frame, so two
 * scrolls in the same frame count as one.
 */
async function scrollTo(page: Page, y: number): Promise<void> {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await nextFrames(page);
}

/** Launches the app as the bot does, in a session mode, and waits for the session. */
async function open(page: Page, mode: "cookie" | "header", path: string): Promise<LaunchedApp> {
  const app = await launchApp(page, { mode, path });
  await expect(html(page)).toHaveAttribute("data-session", "ready");
  return app;
}

/**
 * Header mode keeps the token in memory only (DEC-44): a document load would lose it. The tests that navigate between
 * the tabs, pull and open a sheet therefore run in both modes; the others read nothing per session and run once.
 */
for (const mode of ["cookie", "header"] as const) {
  test.describe(`shell (${mode} mode)`, { annotation: [{ type: "screen", description: "SCR-006" }, { type: "screen", description: "SCR-010" }] }, () => {
    test("the tab bar: a round trip keeps the search state, the list or map view and the last saved list", async ({ page }) => {
      const app = await open(page, mode, "/?rooms_min=2&sort=cheap&utm_source=bot");
      await expect(route(page, "feed")).toBeVisible();
      await expect(tab(page, "search")).toHaveAttribute("aria-current", "page");
      await expect(tab(page, "search")).toHaveText("Поиск");

      const before = await impacts(app);
      await tab(page, "saved").click();
      await expect(page).toHaveURL(/\/ru\/saved$/);
      await expect(route(page, "saved")).toBeVisible();
      await expect(tab(page, "saved")).toHaveAttribute("aria-current", "page");
      expect(await impacts(app)).toBe(before + 1);
      await expect.poll(() => backVisible(page)).toBe(false);

      // The saved title tabs replace the address; the saved tab then returns to the list shown last.
      await visible(page, '[data-topbar="saved"] [data-slot="title-tab"]').filter({ hasText: "Смотрели" }).click();
      await expect(page).toHaveURL(/\/ru\/saved\/history$/);
      await tab(page, "radars").click();
      await expect(page).toHaveURL(/\/ru\/radars$/);
      await expect(visible(page, '[data-topbar="radars"] h1')).toHaveText("Радар");
      await tab(page, "saved").click();
      await expect(page).toHaveURL(/\/ru\/saved\/history$/);
      await tab(page, "settings").click();
      await expect(page).toHaveURL(/\/ru\/settings$/);
      await expect(visible(page, '[data-topbar="settings"] h1')).toHaveText("Настройки");
      await expect.poll(() => backVisible(page)).toBe(false);

      // Search returns to the feed with its filters and sort, without the foreign parameter.
      await tab(page, "search").click();
      await expect(page).toHaveURL(/\/ru\?/);
      await expect(route(page, "feed")).toBeVisible();
      expect(searchOf(page).get("rooms_min")).toBe("2");
      expect(searchOf(page).get("sort")).toBe("cheap");
      expect(searchOf(page).get("utm_source")).toBeNull();

      // The map is remembered as the view of the search tab.
      await toggle(page).click();
      await expect(page).toHaveURL(/\/ru\/map\?/);
      await expect(route(page, "map")).toBeVisible();
      await tab(page, "radars").click();
      await expect(page).toHaveURL(/\/ru\/radars$/);
      await tab(page, "search").click();
      await expect(page).toHaveURL(/\/ru\/map\?/);
      await expect(route(page, "map")).toBeVisible();
      expect(searchOf(page).get("rooms_min")).toBe("2");
      expect(searchOf(page).get("sort")).toBe("cheap");
      await expect.poll(() => backVisible(page)).toBe(false);
    });

    test("a pull on the feed asks for page one again; a short pull and a pull under a sheet do nothing", async ({ page }) => {
      const app = await open(page, mode, "/");
      await expect(route(page, "feed")).toBeVisible();
      await expect(cards(page).first()).toBeVisible();
      const indicator = page.locator("[data-ptr]");
      await expect(indicator).toHaveAttribute("aria-hidden", "true");
      const firstPages = recordFirstPages(page);

      // 200 px of finger travel moves the indicator 100 px, past the 72 px trigger: one haptic, the spinner, page one.
      const before = await impacts(app);
      await touchDrag(page, { x: 195, y: 300 }, { x: 195, y: 500 });
      await expect(indicator).toHaveAttribute("data-ptr", "refreshing");
      await expect.poll(() => firstPages.length).toBe(1);
      await expect(indicator).toHaveAttribute("data-ptr", "idle");
      await expect(cards(page).first()).toBeVisible();
      expect(await impacts(app)).toBe(before + 1);

      // 100 px of travel stays below the trigger.
      await touchDrag(page, { x: 195, y: 300 }, { x: 195, y: 400 });
      expect(await indicator.getAttribute("data-ptr")).toBe("idle");

      // Under a sheet the pull is off.
      await filtersChip(page).click();
      await expect(filtersSheet(page)).toBeVisible();
      await settled(page, '[data-slot="bottom-sheet"]');
      await touchDrag(page, { x: 195, y: 60 }, { x: 195, y: 260 });
      expect(await indicator.getAttribute("data-ptr")).toBe("idle");
      await press(page, "backButtonClicked");
      await expect(page).toHaveURL(/\/ru$/);
      await expect(cards(page).first()).toBeVisible();
      expect(firstPages).toHaveLength(1);
    });

    test("a sheet route closes by BackButton, backdrop, × and drag; the page below is locked meanwhile", async ({ page }) => {
      await open(page, mode, "/");
      await expect(route(page, "feed")).toBeVisible();
      const openFilters = async () => {
        await filtersChip(page).click();
        await expect(filtersSheet(page)).toBeVisible();
        await expect(page).toHaveURL(/\/ru\/filters\?city=tashkent$/);
        await expect(page.locator("body")).toHaveClass(/(^|\s)sheet-open(\s|$)/);
      };
      const closed = async () => {
        await expect(page).toHaveURL(/\/ru$/);
        await expect(route(page, "feed")).toBeVisible();
        await expect(visible(page, "[data-layer]")).toHaveCount(0);
        await expect(page.locator("body")).not.toHaveClass(/(^|\s)sheet-open(\s|$)/);
        await expect.poll(() => backVisible(page)).toBe(false);
      };

      await openFilters();
      await expect.poll(() => backVisible(page)).toBe(true);
      await press(page, "backButtonClicked");
      await closed();

      await openFilters();
      await visible(page, '[data-slot="bottom-sheet-overlay"]').click({ position: { x: 10, y: 8 } });
      await closed();

      await openFilters();
      await visible(page, '[data-slot="bottom-sheet-close"]').click();
      await closed();

      await openFilters();
      await dragSheetDown(page);
      await closed();
    });
  });
}

test.describe("shell", { annotation: [{ type: "screen", description: "SCR-006" }, { type: "screen", description: "SCR-010" }] }, () => {
  test("the chrome collapses on scroll, expands on the way up, and the first tap only expands", async ({ page }) => {
    const app = await open(page, "cookie", "/");
    await expect(route(page, "feed")).toBeVisible();
    // Page one of the stub feed (20 cards) is several screens tall.
    await expect(cards(page).first()).toBeVisible();
    const miniTitle = page.locator("[data-mini-title]");
    await expect(miniTitle).toBeHidden();

    await scrollTo(page, 40);
    await expect(html(page)).not.toHaveClass(MINI);
    await scrollTo(page, 400);
    await expect(html(page)).toHaveClass(MINI);
    await expect(miniTitle).toBeVisible();
    await expect(miniTitle).toHaveText(/^Аренда · /);

    // Up by more than 24 px expands; within 60 px of the top it stays expanded.
    await scrollTo(page, 370);
    await expect(html(page)).not.toHaveClass(MINI);
    await scrollTo(page, 800);
    await expect(html(page)).toHaveClass(MINI);

    // The tab bar is the active tab's circle: the first tap expands, plays the haptic, and goes nowhere.
    let before = await impacts(app);
    await tab(page, "search").click();
    await expect(html(page)).not.toHaveClass(MINI);
    expect(await impacts(app)).toBe(before + 1);
    expect(await page.evaluate(() => window.scrollY)).toBe(800);
    await expect(page).toHaveURL(/\/ru$/);

    // The toggle's circle: the first tap expands and stays on the list.
    await scrollTo(page, 1600);
    await expect(html(page)).toHaveClass(MINI);
    await expect(toggle(page)).toHaveAttribute("data-view-toggle", "list");
    await toggle(page).click({ position: { x: 27, y: 22 } });
    await expect(html(page)).not.toHaveClass(MINI);
    await expect(page).toHaveURL(/\/ru$/);

    // The mini title: the first tap expands.
    await scrollTo(page, 2400);
    await expect(html(page)).toHaveClass(MINI);
    await miniTitle.click();
    await expect(html(page)).not.toHaveClass(MINI);

    // Expanded, a tap on the active tab scrolls to the top.
    before = await impacts(app);
    await tab(page, "search").click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await nextFrames(page);
    expect(await impacts(app)).toBe(before + 1);
    await expect(page).toHaveURL(/\/ru$/);

    // Leaving the list removes the class.
    await scrollTo(page, 1200);
    await expect(html(page)).toHaveClass(MINI);
    await press(page, "settingsButtonClicked");
    await expect(route(page, "settings")).toBeVisible();
    await expect(html(page)).not.toHaveClass(MINI);
  });

  test("the view toggle: list → map → list keeps the search; the map bar's lasso, area and filters", async ({ page }) => {
    await open(page, "cookie", "/?rooms_min=2");
    await expect(route(page, "feed")).toBeVisible();
    await expect(toggle(page)).toHaveAttribute("data-view-toggle", "list");
    await expect(toggle(page)).toHaveText("Карта");

    await toggle(page).click();
    await expect(page).toHaveURL(/\/ru\/map\?/);
    await expect(route(page, "map")).toBeVisible();
    expect(searchOf(page).get("rooms_min")).toBe("2");
    await expect(toggle(page)).toHaveText("Список");
    await expect.poll(() => backVisible(page)).toBe(false);

    // The filters button counts the active groups, in its badge and in its name.
    const mapBar = visible(page, '[data-topbar="map"]');
    await expect(mapBar.getByRole("button", { name: "Фильтры, 1", exact: true })).toContainText("1");

    // The lasso pushes the `draw` layer (WP-28): the drawing bar takes the map bar's place, the toggle hides and the
    // BackButton shows; «Отмена» returns to the plain map with the search. The drawing itself: `map-lasso.spec.ts`.
    await mapBar.getByRole("button", { name: "Обвести на карте" }).click();
    await expect(page).toHaveURL(/[?&]draw=1(&|$)/);
    const drawBar = visible(page, '[data-topbar="map-drawing"] [data-slot="draw-bar"]');
    await expect(drawBar.getByRole("status")).toContainText("Обведите пальцем, где искать");
    await expect(mapBar).toHaveCount(0);
    await expect(toggle(page)).toHaveCount(0);
    await expect.poll(() => backVisible(page)).toBe(true);
    expect(searchOf(page).get("rooms_min")).toBe("2");

    await drawBar.getByRole("button", { name: "Отмена" }).click();
    await expect(page).not.toHaveURL(/[?&]draw=/);
    expect(searchOf(page).get("rooms_min")).toBe("2");
    await expect(visible(page, '[data-topbar="map-drawing"]')).toHaveCount(0);
    await expect(mapBar).toBeVisible();
    await expect(toggle(page)).toHaveText("Список");
    await expect.poll(() => backVisible(page)).toBe(false);

    await toggle(page).click();
    await expect(page).toHaveURL(/\/ru\?/);
    await expect(route(page, "feed")).toBeVisible();
    expect(searchOf(page).get("rooms_min")).toBe("2");
    await expect(toggle(page)).toHaveText("Карта");
  });

  test("the map with a drawn area: «Своя область» and its × clears the polygon", async ({ page }) => {
    await open(page, "cookie", "/map?polygon=41.31100,69.24000;41.32000,69.26000;41.30000,69.27000&rooms_min=2");
    const mapBar = visible(page, '[data-topbar="map"]');
    await expect(mapBar.locator('[data-slot="area-pill"]')).toContainText("Своя область");

    await mapBar.getByRole("button", { name: "Убрать область" }).click();
    await expect(page).not.toHaveURL(/polygon=/);
    await expect(mapBar.locator('[data-slot="area-pill"]')).toHaveCount(0);
    expect(searchOf(page).get("rooms_min")).toBe("2");
  });

  test("the deal switch keeps the districts, resets the rest, and ignores the active deal", async ({ page }) => {
    const app = await open(page, "cookie", "/?deal=sale&districts=chilonzor&districts=mirobod&rooms_min=2&sort=ppm");
    await expect(route(page, "feed")).toBeVisible();
    const deals = visible(page, '[data-topbar="search-list"] [data-slot="title-tab"]');
    const rent = deals.filter({ hasText: "Аренда" });
    const sale = deals.filter({ hasText: "Продажа" });
    await expect(sale).toHaveAttribute("aria-checked", "true");
    const entries = await page.evaluate(() => history.length);
    const address = page.url();

    let before = await impacts(app);
    await sale.click();
    expect(page.url()).toBe(address);
    expect(await impacts(app)).toBe(before);

    await rent.click();
    await expect(rent).toHaveAttribute("aria-checked", "true");
    await expect(page).not.toHaveURL(/deal=sale/);
    expect(searchOf(page).getAll("districts")).toEqual(["chilonzor", "mirobod"]);
    expect(searchOf(page).get("rooms_min")).toBeNull();
    // `ppm` is a sale sort: rent goes back to `new`, which the address leaves out.
    expect(searchOf(page).get("sort")).toBeNull();
    expect(await page.evaluate(() => history.length)).toBe(entries);
    expect(await impacts(app)).toBe(before + 1);

    // The compact control of the map does the same.
    await toggle(page).click();
    await expect(page).toHaveURL(/\/ru\/map\?/);
    before = await impacts(app);
    await visible(page, '[data-topbar="map"]').getByRole("radio", { name: "Продажа" }).click();
    await expect(page).toHaveURL(/[?&]deal=sale(&|$)/);
    expect(searchOf(page).getAll("districts")).toEqual(["chilonzor", "mirobod"]);
    expect(await impacts(app)).toBe(before + 1);
  });

  test("a sheet address loaded directly: backdrop and drag do nothing, × goes to the parent with the search state", async ({ page }) => {
    await open(page, "cookie", "/filters?rooms_min=2");
    await expect(visible(page, '[data-route="filters"]')).toBeVisible();

    await visible(page, '[data-slot="bottom-sheet-overlay"]').click({ position: { x: 10, y: 8 } });
    await dragSheetDown(page);
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/\/ru\/filters\?rooms_min=2$/);
    await expect(visible(page, '[data-route="filters"]')).toBeVisible();

    await visible(page, '[data-slot="bottom-sheet-close"]').click();
    await expect(page).toHaveURL(/\/ru\?rooms_min=2$/);
    await expect(route(page, "feed")).toBeVisible();
  });
});


/**
 * Without the Telegram SDK (WP-36, TMA-047): the SDK tag is aborted, the session signs in from the launch fragment,
 * and Telegram's BackButton cannot be shown, so the listing layer and every sub-page carry the app's own cross.
 */
test.describe("without the Telegram SDK", { annotation: [{ type: "screen", description: "SCR-006" }, { type: "screen", description: "SCR-010" }] }, () => {
  const cross = (page: Page) => visible(page, "[data-fallback-close]");
  const softNavigate = (page: Page, href: string) =>
    page.evaluate((target) => (window as unknown as { next: { router: { push(href: string): void } } }).next.router.push(target), href);

  test("the listing carries the cross «Закрыть» in its skeleton, content and error states; each closes it", async ({ page }) => {
    // Header mode: the server render has no session, so the listing reads through `/bff`, held here for the skeleton.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/bff/listings/100001", async (route) => {
      await held;
      await route.fallback();
    });
    await launchApp(page, { sdk: false, mode: "header", path: "/listing/100001" });
    await expect(html(page)).toHaveAttribute("data-session", "ready");
    const state = visible(page, '[data-route="listing"] [data-listing-state]');

    await expect(state).toHaveAttribute("data-listing-state", "skeleton");
    await expect(cross(page)).toHaveAttribute("aria-label", "Закрыть");
    release();
    await expect(state).toHaveAttribute("data-listing-state", "loaded");
    await expect(cross(page)).toBeVisible();
    // A direct load: the cross plays the leave and replaces the address with the feed.
    await cross(page).click();
    await expect(page).toHaveURL(/\/ru$/);
    await expect(route(page, "feed")).toBeVisible();
    await expect(visible(page, '[data-route="listing"]')).toHaveCount(0);

    await softNavigate(page, "/ru/listing/999503");
    await expect(visible(page, '[data-route="listing"] [data-slot="error-state"]')).toBeVisible();
    await expect(cross(page)).toBeVisible();
    await cross(page).click();
    await expect(page).toHaveURL(/\/ru$/);
    await expect(visible(page, '[data-route="listing"]')).toHaveCount(0);
  });

  test("a sub-page carries the cross, which closes it, and the page under it does not scroll while it is open", async ({ page }) => {
    await launchApp(page, { sdk: false, path: "/settings" });
    await expect(html(page)).toHaveAttribute("data-session", "ready");
    await expect(route(page, "settings")).toBeVisible();
    // Make the settings page taller than the screen, so a scroll that reached it would move the window.
    await page.evaluate(() => document.body.style.setProperty("min-height", "3000px"));

    await softNavigate(page, "/ru/settings/theme");
    const sub = page.getByRole("region", { name: "Тема" });
    await expect(sub).toBeVisible();
    await settled(page, '[data-slot="subpage"]');
    await expect(page.locator("body")).toHaveClass(/(^|\s)subpage-open(\s|$)/);
    await page.mouse.move(195, 500);
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    await expect(cross(page)).toHaveAttribute("aria-label", "Закрыть");
    await cross(page).click();
    await expect(page).toHaveURL(/\/ru\/settings$/);
    await expect(sub).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveClass(/(^|\s)subpage-open(\s|$)/);
  });

  test("with the SDK there is no cross on the listing", async ({ page }) => {
    await launchApp(page, { path: "/listing/100001" });
    await expect(html(page)).toHaveAttribute("data-session", "ready");
    await expect(visible(page, '[data-route="listing"] [data-listing-state="loaded"]')).toBeVisible();
    await expect(cross(page)).toHaveCount(0);
  });
});

test.describe("part B wrappers on the dev gallery", { annotation: [{ type: "screen", description: "SCR-006" }, { type: "screen", description: "SCR-010" }] }, () => {
  const gallery = (page: Page) => route(page, "dev/ui");

  async function openGallery(page: Page): Promise<void> {
    await launchApp(page, { path: "/dev/ui" });
    await expect(html(page)).toHaveAttribute("data-session", "ready");
    await expect(gallery(page)).toBeVisible();
  }

  async function backOnGallery(page: Page): Promise<void> {
    await expect(page).toHaveURL(/\/ru\/dev\/ui$/);
    await expect(gallery(page)).toBeVisible();
    await expect(visible(page, "[data-layer]")).toHaveCount(0);
  }

  test("toasts: one host above the tab bar; tap closes, the action runs once, a replacement shows the new text", async ({ page }) => {
    await openGallery(page);
    const host = page.locator('[data-toast-host="app"]');
    const toast = host.locator("[data-toast]");

    await page.getByTestId("gallery-toast-plain").click();
    await expect(toast).toHaveText("Ссылка скопирована");
    await toast.click();
    await expect(toast).toHaveCount(0);

    await page.getByTestId("gallery-toast-key").click();
    await expect(toast).toHaveText("Автор @realtor_uz заблокирован");

    await page.getByTestId("gallery-toast-action").click();
    await expect(toast).toContainText("Объявление скрыто");
    await toast.getByRole("button", { name: "Вернуть" }).click();
    await expect(toast).toHaveCount(0);
    await expect(page.getByTestId("gallery-confirm-events")).toContainText("toast action");
    expect((await page.getByTestId("gallery-confirm-events").textContent())?.match(/toast action/g)).toHaveLength(1);

    // The gallery shows a second toast 1.5 s after the first: it takes the first one's place.
    await page.getByTestId("gallery-toast-replace").click();
    await expect(toast).toContainText("Первый тост");
    await expect(toast).toContainText("Второй тост");
    await expect(toast).toHaveCount(1);

    // Tab bar 62 px + no bottom inset + 20 px (legacy `.toast` with no view toggle, sub-page or CTA bar below it, WP-34),
    // at the toast level of the z ladder.
    expect(await page.locator("[data-toast-host]").count()).toBe(1);
    expect(await host.evaluate((element) => ({ bottom: getComputedStyle(element).bottom, zIndex: getComputedStyle(element).zIndex }))).toEqual({
      bottom: "82px",
      zIndex: "60",
    });
    await expect(host).toHaveAttribute("data-placement", "tabbar");
  });

  test("RouteSheet: the gallery's /filters closes by BackButton, backdrop, × and drag", async ({ page }) => {
    await openGallery(page);
    const openFilters = async () => {
      await page.getByTestId("gallery-route-filters").click();
      await expect(filtersSheet(page)).toBeVisible();
      await expect(page).toHaveURL(/\/ru\/filters$/);
    };

    await openFilters();
    await expect.poll(() => backVisible(page)).toBe(true);
    await press(page, "backButtonClicked");
    await backOnGallery(page);

    await openFilters();
    await visible(page, '[data-slot="bottom-sheet-overlay"]').click({ position: { x: 10, y: 8 } });
    await backOnGallery(page);

    await openFilters();
    await visible(page, '[data-slot="bottom-sheet-close"]').click();
    await backOnGallery(page);

    await openFilters();
    await dragSheetDown(page);
    await backOnGallery(page);
    expect(await backVisible(page)).toBe(false);
  });

  test("RouteOverlay: the gallery's /listing/42 closes by BackButton", async ({ page }) => {
    await openGallery(page);
    const overlay = visible(page, '[data-slot="route-overlay"][data-presentation="layer"] [data-route="listing"][data-layer="overlay"]');

    await page.getByTestId("gallery-route-listing").click();
    await expect(overlay).toBeVisible();
    await expect(page).toHaveURL(/\/ru\/listing\/42$/);
    await press(page, "backButtonClicked");
    await backOnGallery(page);
  });

  /** From the left edge across most of the 390 px screen: far past a third of the width. */
  const swipeBack = (page: Page) => touchDrag(page, { x: 30, y: 420 }, { x: 370, y: 422 }, 8);

  test.describe("SubPage on iOS", { annotation: [{ type: "screen", description: "SCR-006" }, { type: "screen", description: "SCR-010" }] }, () => {
    test.use({ userAgent: IOS_UA });

    test("the gallery's /settings/theme closes by BackButton and by swipe back", async ({ page }) => {
      await openGallery(page);
      const sub = page.getByRole("region", { name: "Тема" });

      await page.getByTestId("gallery-route-settings-theme").click();
      await expect(sub).toBeVisible();
      await expect(page).toHaveURL(/\/ru\/settings\/theme$/);
      await press(page, "backButtonClicked");
      await expect(page).toHaveURL(/\/ru\/dev\/ui$/);
      await expect(gallery(page)).toBeVisible();

      await page.getByTestId("gallery-route-settings-theme").click();
      await expect(sub).toBeVisible();
      await settled(page, '[data-slot="subpage"]');
      await swipeBack(page);
      await expect(page).toHaveURL(/\/ru\/dev\/ui$/);
      await expect(gallery(page)).toBeVisible();
    });
  });

  test.describe("SubPage on Android", { annotation: [{ type: "screen", description: "SCR-006" }, { type: "screen", description: "SCR-010" }] }, () => {
    test.use({ userAgent: ANDROID_UA });

    test("the gallery's /settings/theme has no swipe back; BackButton still closes it", async ({ page }) => {
      await openGallery(page);
      const sub = page.getByRole("region", { name: "Тема" });

      await page.getByTestId("gallery-route-settings-theme").click();
      await expect(sub).toBeVisible();
      await settled(page, '[data-slot="subpage"]');
      await swipeBack(page);
      await page.waitForTimeout(400);
      await expect(page).toHaveURL(/\/ru\/settings\/theme$/);
      await expect(sub).toBeVisible();

      await press(page, "backButtonClicked");
      await expect(page).toHaveURL(/\/ru\/dev\/ui$/);
    });
  });
});
