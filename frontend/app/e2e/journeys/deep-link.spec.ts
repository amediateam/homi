import { expect, launchApp, stubMedia, test } from "@homi/testing/playwright";
import type { Page, Request } from "@playwright/test";

import { LISTING, SHOWS_TIMEOUT_MS } from "../support/pages";

/**
 * Journey 2 of WP-33: the ways into the Mini App other than the menu button, against the API on stubs. A listing link
 * (`start_param` `l_<number>`, the bare form a shared link has) and the page query `?listing=` push the listing over
 * the feed (`LaunchRedirector`, TMA-010 … TMA-012), so Telegram's Back lands on the loaded feed (SCR-007: its cards)
 * in the shell (SCR-006: the tab bar on search) with BackButton hidden; both launches tell the journal `app_launch` and
 * `app_opened` with `entry: "link"` (`lib/session/bootstrap.ts`). `?news=pets` opens the filters sheet on the pets
 * section, with the «Новое» pill until the control is tried (BR-APP-057). A directly loaded layer of a listing goes
 * back to its parent, the listing (`parentOf` through `useBack`: a replace at depth 0, `lib/navigation/useBack.ts`);
 * that soft navigation adds an overlay copy over the standalone one (`ListingLayer`). A directly loaded listing, and
 * that overlay copy, close to the feed through the layer's own close (`takeOverBack` → `leaveListingRoute`: a replace
 * with the feed at depth 0, `features/listing/closeListing.ts`). No session mode in a title: both projects run every
 * test, and nothing here differs by mode. Each test launches once (the stub user's API limit, KI-32); every photo is
 * answered by `stubMedia`.
 */

interface FakeWindow {
  __homiFakeTelegram: { emit(type: string): void };
  Telegram: { WebApp: { BackButton: { isVisible: boolean } } };
}

type JournalEvent = { name: string; props: Record<string, unknown> };

/** The visible copy only: with `cacheComponents` the router keeps earlier routes hidden in `<Activity>`. */
const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const route = (page: Page, name: string) => visible(page, `[data-route="${name}"]`);
const ready = (page: Page) => expect(page.locator("html")).toHaveAttribute("data-session", "ready");
const back = (page: Page) => page.evaluate(() => (window as unknown as FakeWindow).__homiFakeTelegram.emit("backButtonClicked"));
const backVisible = (page: Page) => page.evaluate(() => (window as unknown as FakeWindow).Telegram.WebApp.BackButton.isVisible);
/** The listing layer pushed over the feed (the `@overlay` copy) of `number`. */
const overlay = (page: Page, number: number) => visible(page, `[data-route="listing"][data-layer="overlay"][data-listing-number="${number}"]`);
/** The intercepted copy of a sheet address, inside its bottom sheet. */
const sheet = (page: Page, name: string) => visible(page, `[data-slot="bottom-sheet"] [data-route="${name}"][data-layer="sheet"]`);

const isEvents = (request: Request) => new URL(request.url()).pathname === "/bff/events" && request.method() === "POST";

/** Records the journal's events (one `POST /bff/events` each, WP-32) from now on: call it before the launch. */
function journal(page: Page): (name: string) => Record<string, unknown> | undefined {
  const requests: Request[] = [];
  page.on("request", (request) => {
    if (isEvents(request)) {
      requests.push(request);
    }
  });
  return (name) => requests.map((request) => JSON.parse(request.postData() ?? "{}") as JournalEvent).find((event) => event.name === name)?.props;
}

/**
 * Back on the feed: its address without a launch parameter, the feed loaded (SCR-007: a card of `ListingFeed`, which
 * neither the skeleton nor the error state inside the route root renders, as in `pages.ts`), no listing layer, the
 * shell's tab bar on the search tab (`features/shell/TabBar.tsx`), BackButton hidden. After a directly loaded listing
 * the feed renders first after Back, so the card waits as long as a loaded state of the address table.
 */
async function onFeed(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/ru$/);
  await expect(route(page, "feed")).toBeVisible();
  await expect(visible(page, '[data-route="feed"] [data-feed="feed"] [data-card]').first()).toBeVisible({ timeout: SHOWS_TIMEOUT_MS });
  await expect(visible(page, '[data-route="listing"]')).toHaveCount(0);
  await expect(visible(page, "[data-tabbar]")).toBeVisible();
  await expect(visible(page, '[data-tab="search"]')).toHaveAttribute("aria-current", "page");
  await expect.poll(() => backVisible(page)).toBe(false);
}

test.describe(
  "deep links @journey",
  {
    annotation: [
      { type: "screen", description: "SCR-006" },
      { type: "screen", description: "SCR-007" },
      { type: "screen", description: "SCR-014" },
      { type: "screen", description: "SCR-018" },
      { type: "screen", description: "SCR-022" },
    ],
  },
  () => {
    test.beforeEach(async ({ page }) => {
      await stubMedia(page);
    });

    test("start_param l_<number> opens the listing over the feed with entry link; Back → feed, then no BackButton", async ({ page }) => {
      const event = journal(page);
      await launchApp(page, { startParam: `l_${LISTING}` });
      await ready(page);

      await expect(page).toHaveURL(new RegExp(`/ru/listing/${LISTING}$`));
      await expect(overlay(page, LISTING)).toBeVisible();
      await expect(overlay(page, LISTING).locator('[data-listing-state="loaded"]').filter({ visible: true }).first()).toBeVisible();
      await expect.poll(() => backVisible(page)).toBe(true);
      await expect.poll(() => event("app_launch")).toMatchObject({ entry: "link" });
      await expect.poll(() => event("app_opened")).toMatchObject({ entry: "link", listing_id: LISTING });

      await back(page);
      await onFeed(page);
    });

    test("?listing=<number> opens the listing over the feed with entry link; Back → feed without the parameter, then no BackButton", async ({ page }) => {
      const event = journal(page);
      await launchApp(page, { path: `/?listing=${LISTING}` });
      await ready(page);

      // The parameter leaves the address by a replace before the push.
      await expect(page).toHaveURL(new RegExp(`/ru/listing/${LISTING}$`));
      await expect(overlay(page, LISTING)).toBeVisible();
      await expect(overlay(page, LISTING).locator('[data-listing-state="loaded"]').filter({ visible: true }).first()).toBeVisible();
      await expect.poll(() => backVisible(page)).toBe(true);
      await expect.poll(() => event("app_launch")).toMatchObject({ entry: "link" });
      await expect.poll(() => event("app_opened")).toMatchObject({ entry: "link", listing_id: LISTING });

      await back(page);
      await onFeed(page);
    });

    test("?news=pets opens the filters on the pets section with «Новое» until the control is tried; Back → feed", async ({ page }) => {
      const event = journal(page);
      await launchApp(page, { path: "/?news=pets" });
      await ready(page);

      await expect(page).toHaveURL(/\/ru\/filters\?focus=pets$/);
      const filters = sheet(page, "filters");
      await expect(filters).toBeVisible();
      // `FOCUS_DELAY_MS` after the open the section scrolls to the middle of the sheet's body (`03` §3.4).
      const pets = filters.locator('[data-focus="pets"]');
      await expect(pets.getByRole("heading")).toContainText("Животные");
      await expect.poll(() => visible(page, '[data-slot="bottom-sheet-body"]').evaluate((body) => body.scrollTop)).toBeGreaterThan(0);
      await expect(pets).toBeInViewport({ ratio: 1 });
      // `GET /reference` announces `pets` and this device has not tried it (`homi-new-pets`): the pill shows.
      await expect(pets.locator('[data-slot="new-pill"]')).toHaveText("Новое");
      await expect.poll(() => event("app_launch")).toMatchObject({ entry: "news" });
      await expect.poll(() => event("app_opened")).toMatchObject({ entry: "news" });

      // Any tap on the control marks the feature tried; a tap on the selected «Не важно» changes no filter.
      await pets.getByRole("radio", { name: "Не важно" }).click();
      await expect(pets.locator('[data-slot="new-pill"]')).toHaveCount(0);

      await back(page);
      await expect(route(page, "filters")).toHaveCount(0);
      await onFeed(page);
    });

    test("a directly loaded listing address is its own screen, not an overlay; Back → its parent, the feed, then no BackButton", async ({ page }) => {
      await launchApp(page, { path: `/ru/listing/${LISTING}` });
      await ready(page);

      const listing = visible(page, `[data-route="listing"][data-listing-number="${LISTING}"]`);
      await expect(listing.locator('[data-listing-state="loaded"]').filter({ visible: true }).first()).toBeVisible();
      await expect(listing).not.toHaveAttribute("data-layer");
      await expect.poll(() => backVisible(page)).toBe(true);

      await back(page);
      await onFeed(page);
    });

    test("a directly loaded layer of a listing address goes back to its parent, the listing, then to the feed", async ({ page }) => {
      await launchApp(page, { path: `/ru/listing/${LISTING}/market` });
      await ready(page);

      const market = visible(page, '[data-slot="bottom-sheet"] [data-route="listing/market"]');
      await expect(market).toBeVisible();
      await expect(page.getByRole("dialog", { name: "Откуда эта цифра" })).toBeVisible();
      await expect(market.locator('[data-market-paragraph="sample"]')).toBeVisible();
      await expect.poll(() => backVisible(page)).toBe(true);

      await back(page);
      await expect(page).toHaveURL(new RegExp(`/ru/listing/${LISTING}$`));
      await expect(visible(page, '[data-route^="listing/"]')).toHaveCount(0);
      // The depth-0 replace is a soft navigation, which Next intercepts into `@overlay`: an overlay copy now lies over
      // the standalone one (`ListingLayer`). The copy on top is read, and no visible copy is in another state.
      await expect(overlay(page, LISTING).locator('[data-listing-state="loaded"]').filter({ visible: true }).first()).toBeVisible();
      await expect(visible(page, `[data-route="listing"][data-listing-number="${LISTING}"] [data-listing-state]:not([data-listing-state="loaded"])`)).toHaveCount(0);
      await expect.poll(() => backVisible(page)).toBe(true);

      await back(page);
      await onFeed(page);
    });
  },
);
