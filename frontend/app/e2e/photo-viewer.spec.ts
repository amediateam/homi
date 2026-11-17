import { expect, launchApp, stubMedia, test as base, type LaunchedApp } from "@homi/testing/playwright";
import type { CDPSession, Locator, Page } from "@playwright/test";

/**
 * The photo viewer of WP-26 (SCR-020) over the listing `100001` of the stub catalogue (8 photos; D-10: "photo 3 of
 * 8"), by touch, in cookie and header mode: photo 3 opened from the hero, paging that replaces `i` in the address
 * without a new history entry, a double tap that zooms and a second one that zooms back, a swipe down that closes;
 * Telegram's Back closes the viewer before the listing; a direct load of `photos?i=2` opens at «3 / 8», keeps the
 * locale while paging, and its × closes it to the listing, from where Back goes to the feed (review X1). The viewer
 * is portalled to `body` and rendered in the browser only. The touches go through the CDP, as a finger on a phone:
 * the viewer's listeners are touch listeners, mouse events do nothing. Each test launches once; the full run shares
 * one stub user's API limit (120 a minute, KI-32). Every photo is answered by `stubMedia`.
 */

const test = base.extend<{ photos: readonly string[] }>({
  /** The stub photos answered so far: every test answers them itself, as CI has no `cdn.homi.loc`. */
  photos: [async ({ page }, use) => use(await stubMedia(page)), { auto: true }],
});

interface Fake {
  webApp: { BackButton: { isVisible: boolean } };
  emit(eventType: string): void;
}

type Mode = "cookie" | "header";
type Point = { x: number; y: number };

const LISTING = 100001;

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const html = (page: Page) => page.locator("html");
const route = (page: Page, name: string) => visible(page, `[data-route="${name}"]`);
const cards = (page: Page) => visible(page, "article[data-listing]");
/** The listing layer of `number` (each layer carries its own number, also a hidden one). */
const layer = (page: Page, number: number) => visible(page, `[data-route="listing"][data-listing-number="${number}"]`);
const viewer = (page: Page) => visible(page, '[role="dialog"][data-route="listing/photos"]');
const counter = (page: Page) => viewer(page).locator("[data-viewer-counter]");
const strip = (page: Page) => viewer(page).locator("[data-viewer-strip]");
const zoomBox = (page: Page, slide: number) => viewer(page).locator(`[data-viewer-slide="${slide}"] [data-zoom]`);
const zoomLayer = (page: Page, slide: number) => viewer(page).locator(`[data-viewer-slide="${slide}"] [data-zoom-layer]`);
const press = (page: Page, eventType: "backButtonClicked") =>
  page.evaluate((type) => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit(type), eventType);
const backVisible = (page: Page) =>
  page.evaluate(() => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.webApp.BackButton.isVisible);
const historyLength = (page: Page) => page.evaluate(() => window.history.length);
const bodyLocked = (page: Page) => page.evaluate(() => document.body.classList.contains("locked"));
/** The address as the app spells it: path and query, the locale segment included. */
const address = (page: Page) => {
  const url = new URL(page.url());
  return url.pathname + url.search;
};

/** Light impacts the page asked the fake Telegram for so far (TMA-025). */
async function impacts(app: LaunchedApp, style: "light" | "medium"): Promise<number> {
  return (await app.calls()).filter((call) => call.member === "HapticFeedback.impactOccurred" && call.args[0] === style).length;
}

/** Scrolls a horizontal snap strip to slide `index` (the slides are as wide as the strip). */
const scrollStrip = (scroller: Locator, index: number) =>
  scroller.evaluate((element, slide) => {
    element.scrollLeft = slide * element.clientWidth;
  }, index);

/** The centre of an element on the screen. */
async function centreOf(target: Locator): Promise<Point> {
  const box = await target.boundingBox();
  if (box === null) {
    throw new Error("the element is not laid out");
  }
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

/** One quick tap of a finger through the CDP. */
async function tap(cdp: CDPSession, point: Point): Promise<void> {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/** Two taps on the same spot well within 300 ms: the viewer's double tap. */
async function doubleTap(page: Page, target: Locator): Promise<void> {
  const point = await centreOf(target);
  const cdp = await page.context().newCDPSession(page);
  await tap(cdp, point);
  await tap(cdp, point);
  await cdp.detach();
}

/** A one-finger touch drag through the CDP, as a finger on a phone. */
async function touchDrag(page: Page, from: Point, to: Point, steps = 10): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let step = 1; step <= steps; step += 1) {
    const point = { x: from.x + ((to.x - from.x) * step) / steps, y: from.y + ((to.y - from.y) * step) / steps };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** Launches the app as the bot does, in a session mode, and waits for the session. */
async function open(page: Page, mode: Mode, path = "/"): Promise<LaunchedApp> {
  const app = await launchApp(page, { mode, path });
  await expect(html(page)).toHaveAttribute("data-session", "ready");
  return app;
}

/** The listing's details are on screen (the viewer then has the full set of photos). */
const loaded = (page: Page, number: number) =>
  expect(layer(page, number).locator("[data-listing-state]")).toHaveAttribute("data-listing-state", "loaded");

for (const mode of ["cookie", "header"] as const) {
  test.describe(`photo viewer (${mode} mode)`, () => {
    test("photo 3 of 8 from the hero; paging replaces the address; a double tap zooms and unzooms; a swipe down closes", async ({ page }) => {
      const app = await open(page, mode, `/ru/listing/${LISTING}`);
      await loaded(page, LISTING);
      const hero = layer(page, LISTING).locator("[data-hero]");
      await scrollStrip(hero.locator("[data-scroll-x]"), 2);
      await expect(hero.locator("[data-hero-counter]")).toHaveText("3 / 8");
      const light = await impacts(app, "light");

      await hero.locator('[data-slide="2"]').click();
      await expect(page).toHaveURL(new RegExp(`/ru/listing/${LISTING}/photos\\?i=2$`));
      await expect(viewer(page)).toBeVisible();
      await expect(page.getByRole("dialog", { name: "Фото" })).toBeVisible();
      await expect(counter(page)).toHaveText("3 / 8");
      expect(await impacts(app, "light")).toBe(light + 1);
      expect(await bodyLocked(page)).toBe(true);
      // Under the viewer the listing stays mounted. The hero's push over a directly loaded listing is intercepted into
      // an overlay copy over the standalone one (a known remainder of review X2), so there may be two.
      await expect(layer(page, LISTING).first()).toBeAttached();
      const entries = await historyLength(page);

      for (const index of [3, 4]) {
        await scrollStrip(strip(page), index);
        await expect.poll(() => address(page)).toBe(`/ru/listing/${LISTING}/photos?i=${index}`);
        await expect(counter(page)).toHaveText(`${index + 1} / 8`);
      }
      expect(await historyLength(page)).toBe(entries);

      await expect(zoomLayer(page, 4)).toHaveCSS("transform", "none");
      await doubleTap(page, zoomBox(page, 4));
      await expect.poll(() => zoomLayer(page, 4).evaluate((element) => element.style.transform)).toContain("scale(2.5)");
      // Zoomed, the strip is locked: a sideways move pans the photo.
      await expect(strip(page)).toHaveClass(/(^|\s)overflow-x-hidden(\s|$)/);
      await doubleTap(page, zoomBox(page, 4));
      await expect.poll(() => zoomLayer(page, 4).evaluate((element) => element.style.transform)).toContain("scale(1)");
      await expect(strip(page)).toHaveClass(/(^|\s)overflow-x-auto(\s|$)/);
      await expect(counter(page)).toHaveText("5 / 8");

      const centre = await centreOf(zoomBox(page, 4));
      await touchDrag(page, centre, { x: centre.x, y: centre.y + 240 }, 8);
      await expect(page).toHaveURL(new RegExp(`/ru/listing/${LISTING}$`));
      await expect(visible(page, '[data-route="listing/photos"]')).toHaveCount(0);
      await expect(layer(page, LISTING).first()).toBeVisible();
      expect(await impacts(app, "light")).toBe(light + 2);
      await expect.poll(() => bodyLocked(page)).toBe(false);
    });

    test("Telegram's Back closes the viewer before the listing, then the listing", async ({ page }) => {
      await open(page, mode);
      await expect(cards(page).first()).toBeVisible();
      const first = cards(page).first();
      const number = Number(await first.getAttribute("data-listing"));
      await first.locator("a").click();
      await loaded(page, number);

      await layer(page, number).locator('[data-hero] [data-slide="0"]').click();
      await expect(page).toHaveURL(new RegExp(`/ru/listing/${number}/photos\\?i=0$`));
      await expect(counter(page)).toHaveText(/^1 \/ \d+$/);

      await press(page, "backButtonClicked");
      await expect(page).toHaveURL(new RegExp(`/ru/listing/${number}$`));
      await expect(visible(page, '[data-route="listing/photos"]')).toHaveCount(0);
      await expect(visible(page, `[data-route="listing"][data-layer="overlay"][data-listing-number="${number}"]`)).toBeVisible();
      await expect.poll(() => backVisible(page)).toBe(true);

      await press(page, "backButtonClicked");
      await expect(page).toHaveURL(/\/ru$/);
      await expect(visible(page, '[data-route="listing"]')).toHaveCount(0);
      await expect(route(page, "feed")).toBeVisible();
    });

    test("a direct load of photos?i=2 opens at «3 / 8» and pages in its locale; × closes it to the listing, Back then to the feed", async ({ page }) => {
      await open(page, mode, `/ru/listing/${LISTING}/photos?i=2`);
      await expect(viewer(page)).toBeVisible();
      // Header mode shows the dialog empty until the listing's `/bff` answer; then the full set, at the asked photo.
      await expect(counter(page)).toHaveText("3 / 8");
      expect(await bodyLocked(page)).toBe(true);
      const entries = await historyLength(page);

      await scrollStrip(strip(page), 5);
      await expect.poll(() => address(page)).toBe(`/ru/listing/${LISTING}/photos?i=5`);
      await expect(counter(page)).toHaveText("6 / 8");
      expect(await historyLength(page)).toBe(entries);

      await viewer(page).locator("button[data-viewer-close]").click();
      await expect(page).toHaveURL(new RegExp(`/ru/listing/${LISTING}$`));
      await expect(visible(page, '[data-route^="listing/"]')).toHaveCount(0);
      await expect(visible(page, '[data-route="listing"]').first()).toBeVisible();
      await expect(visible(page, '[data-route="listing"] [data-listing-state="loaded"]').first()).toBeVisible();
      await expect.poll(() => bodyLocked(page)).toBe(false);

      await press(page, "backButtonClicked");
      await expect(page).toHaveURL(/\/ru$/);
      await expect(route(page, "feed")).toBeVisible();
      await expect(visible(page, '[data-route="listing"]')).toHaveCount(0);
    });
  });
}
