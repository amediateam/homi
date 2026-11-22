import { expect, launchApp, setScenario, stubMedia, test } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

import { LISTING, PAGE_SCREENS, PAGES, pageName, SHOWS_TIMEOUT_MS } from "../support/pages";

/**
 * Journey 8 of WP-33: the demo-data marker (`DemoDataMarker`, WP-20, `25` §4.4, RK-27, DEC-50) over the route tree on
 * stubs. Every address of the address table, its three gates included, loaded directly with its state and scenario,
 * shows its content and the pill «Демо-данные». A soft navigation from the feed through the listing layer, Back, the
 * map, the saved, radar and settings tabs and a settings page finds the pill on every new pathname. Outside Telegram,
 * `/outside` shows no marker, after the gate's redirect and after a direct load: it is the one address that withholds
 * the pill.
 *
 * The marker counts every source reported for the current pathname. That includes the root layout's cached
 * `GET /reference` and `GET /cities` (`ReferenceProvider`), as `feed.spec.ts` notes. The server reads them without a
 * scenario, and `source.reference` and `source.cities` are `stub` in `backend/config/sources.php`. Their
 * `SourceReporter`s report `stub` again on every pathname. So the pill here proves the marker per address, not per
 * screen source. Other tests prove the rest:
 * - a screen's own answer reports `stub`: `feed.spec.ts` (the feed's page one) and `saved.spec.ts` (favourites and
 *   history);
 * - the pill clears on a new pathname: `tests/shell/demo-marker.test.tsx` ("is hidden again after the pathname
 *   changes").
 * These tests still catch a marker that does not render or hydrate on some address, like the React error 418 of WP-33.
 *
 * Row 8's third clause is not tested end to end here: no marker while a screen's answers carry `meta.source = native`
 * (header mode). Even with a screen's answers faked as `native`, the layout's reference read would still report
 * `stub` and keep the pill. No stub scenario answers `native` either, and this journey fakes no answer. The clause is
 * proven at unit level by `tests/shell/demo-marker.test.tsx` ("is hidden while the screen reports only legacy and
 * native answers").
 *
 * The `/outside` test makes no launch: there is no fake Telegram, as in `gates.spec.ts`. So the suite's session-mode,
 * console and CSP checks after the test have no record of its page. The external-request guard still runs. No mode in
 * a title: both projects run every test, and nothing here differs by mode.
 */

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const html = (page: Page) => page.locator("html");
/** The pill of the root layout: one element outside every route, never kept hidden by `<Activity>`. */
const marker = (page: Page) => page.locator("[data-demo-marker]");
const tab = (page: Page, key: "search" | "saved" | "radars" | "settings") => visible(page, `[data-tab="${key}"]`);
const press = (page: Page, eventType: "backButtonClicked") =>
  page.evaluate((type) => (window as unknown as { __homiFakeTelegram: { emit(type: string): void } }).__homiFakeTelegram.emit(type), eventType);

/** `demo.label` and `demo.hint` of the `ru` catalogue (WP-20). */
const LABEL = "Демо-данные";
const HINT = "Раздел пока работает на тестовых данных";
/** The one sentence of SCR-002 (`gates.spec.ts`). */
const OUTSIDE = "Откройте приложение через бота в Telegram.";

/**
 * What the journey's tests open: every screen of the address table, its gates SCR-003, SCR-004 and SCR-005 included,
 * and SCR-002 of the `/outside` test (`/outside` is not in the table).
 */
const SCREENS = [...new Set([...PAGE_SCREENS, "SCR-002"])].sort();

/** The pill is on screen with its label. */
async function markerShown(page: Page): Promise<void> {
  await expect(marker(page)).toBeVisible();
  await expect(marker(page)).toContainText(LABEL);
}

test.describe("demo marker @journey", { annotation: SCREENS.map((description) => ({ type: "screen", description })) }, () => {
  // The gates as well: the marker withholds itself only on `/outside` (`DemoDataMarker`). On the three gates the pill
  // comes from the layout's reference and cities reports (`/welcome/city` lists those stub cities), which the server
  // reads without the entry's scenario. Each gate draws its content once the sign-in has answered (the session `ready`,
  // or `denied` on `/no-access`), after hydration, so those reporters have run by then, as on every other address.
  for (const entry of PAGES) {
    test(`${pageName(entry)} loaded directly shows its content and the marker`, async ({ page }) => {
      await stubMedia(page);
      await setScenario(page, entry.scenario ?? null);
      await launchApp(page, { path: entry.path });
      // The loaded state, waited for as the coverage passes do: in header mode the reads start after the sign-in.
      await expect(visible(page, entry.shows).first()).toBeVisible({ timeout: SHOWS_TIMEOUT_MS });
      await markerShown(page);
    });
  }

  test("the marker follows a soft navigation: feed, listing layer, Back, map, saved, radars, settings and a settings page", async ({ page }) => {
    await stubMedia(page);
    await launchApp(page);
    await expect(html(page)).toHaveAttribute("data-session", "ready");
    await expect(visible(page, "article[data-listing]").first()).toBeVisible();
    await markerShown(page);
    // The hint is the pill's accessible description; the pill never takes a tap.
    await expect(marker(page)).toHaveAccessibleDescription(HINT);
    await expect(marker(page)).toHaveCSS("pointer-events", "none");

    // The listing layer over the feed is a new pathname. The store starts empty for it, and the layout's reference
    // report gives it the pill again, as on every pathname below.
    await visible(page, `article[data-listing="${LISTING}"]`).locator("a").click();
    await expect(page).toHaveURL(new RegExp(`/ru/listing/${LISTING}$`));
    await expect(visible(page, `[data-route="listing"][data-listing-number="${LISTING}"]`)).toBeVisible();
    await markerShown(page);

    await press(page, "backButtonClicked");
    await expect(page).toHaveURL(/\/ru$/);
    await expect(visible(page, "article[data-listing]").first()).toBeVisible();
    // The listing layer's leave runs after the address changed: the toggle takes a tap once the layer is gone.
    await expect(visible(page, '[data-route="listing"]')).toHaveCount(0);
    await markerShown(page);

    // The map, on whichever engine headless Chromium gets: the pill is checked once its points are drawn. Opening the
    // card scrolled the feed, so the chrome is mini and a first tap only expands it.
    if (await html(page).evaluate((node) => node.classList.contains("chrome-mini"))) {
      await visible(page, '[data-tab][aria-current="page"]').click();
      await expect(html(page)).not.toHaveClass(/chrome-mini/);
    }
    await visible(page, "[data-view-toggle]").click();
    await expect(page).toHaveURL(/\/ru\/map\?/);
    await expect(visible(page, "[data-map-screen]")).toBeVisible();
    await expect(visible(page, "[data-marker]").first()).toBeVisible({ timeout: 15_000 });
    await markerShown(page);

    for (const key of ["saved", "radars", "settings"] as const) {
      await tab(page, key).click();
      await expect(page).toHaveURL(new RegExp(`/ru/${key}(?:[/?]|$)`));
      await expect(visible(page, `[data-route="${key}"]`)).toBeVisible();
      await markerShown(page);
    }

    await visible(page, '[data-route="settings"] [data-settings-row="theme"]').click();
    await expect(page).toHaveURL(/\/ru\/settings\/theme$/);
    await expect(visible(page, '[data-route="settings/theme"]')).toBeVisible();
    await markerShown(page);
  });

  test("outside Telegram /outside shows no marker, after the gate's redirect and after a direct load", async ({ page }) => {
    // No fake Telegram: the launch brings no `initData`, and the gate takes the page to `/outside` (WP-23).
    await page.goto("/");
    await expect(page).toHaveURL(/\/ru\/outside$/);
    await expect(html(page)).toHaveAttribute("data-session", "outside");
    await expect(visible(page, '[data-screen="outside"]')).toHaveText(OUTSIDE);
    // The marker withholds the pill on `/outside` by its route, whatever is reported. The unit test "has no pill on
    // the screen outside Telegram, though the layout's reference read reports stub there (WP-33)" proves that. The
    // screen gives no client signal that the layout's reporters ran, so the quiet page only gives them time, as
    // `gates.spec.ts` waits before its own check of absence.
    await page.waitForLoadState("networkidle");
    await expect(marker(page)).toHaveCount(0);

    await page.goto("/ru/outside");
    await expect(html(page)).toHaveAttribute("data-session", "outside");
    await expect(visible(page, '[data-screen="outside"]')).toHaveText(OUTSIDE);
    await page.waitForLoadState("networkidle");
    await expect(marker(page)).toHaveCount(0);
  });
});
