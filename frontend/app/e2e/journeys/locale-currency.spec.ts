import { expect, launchApp, stubMedia, test, withScenario } from "@homi/testing/playwright";
import type { Page, Request } from "@playwright/test";

import { LISTING } from "../support/pages";

/**
 * Journey 5 of WP-33: the language and the currency of the settings (WP-31, SCR-035, SCR-036; the fix of LB-APP-041),
 * followed into the feed (WP-24), the full filters sheet (WP-25) and the listing (WP-26), against the API on stubs, in
 * one launch and one document. The stub user starts in `ru` with USD. «Oʻzbekcha» moves the address to `/uz/…` in
 * place — a marker set on `window` before the first pick is still there at the end, no document is requested again and
 * no new sign-in runs — and the tab labels read in Uzbek. «Soʻm» (the currency names come from `GET /settings`
 * in the document's language, re-read once `lang` is `uz`) switches the amounts the client formats: the price presets
 * of the full filters sheet read in «mln soʻm», a daily-rent preset below a million groups its thousands with the no-break
 * space of the `ru-RU` number locale that uz uses (`numberLocale`, `03` §3.1), and the listing's market scale reads its
 * marker and its median in сум with a decimal comma.
 *
 * Stubs store nothing, so `GET /me` keeps answering `ru` and USD after the picks; the client merges the saved changes
 * of the launch over every read of `me` (`patchMe`), so the picks hold either way. Once the currency is saved, the
 * scenario `uz` (WP-11: the Uzbek profile with UZS) makes the API's own reads of the profile (the feed's server read
 * of `/me` for the city, the session's re-reads through `/bff/session`) answer what this launch chose, as a real API
 * would; no assertion depends on it, and the city is `tashkent` in both profiles. It is not set at launch: the
 * sign-in would answer the uz profile, the address would move by itself and both picks would be no-ops. The card and CTA
 * prices are formatted by the server, as the fixture has them, and are checked on real sources in WP-48. Every stub
 * photo of the feed and the listing is answered by `stubMedia`.
 */

interface Fake {
  emit(eventType: string): void;
}

interface MarkedWindow {
  __journeyMarker?: number;
}

/** Sign-in, the profile and the first server parts can take a while on a cold app server. */
const API_MS = 20_000;
/** The Uzbek «ʻ» (U+02BB) of the catalogues and of `config/settings.php`; a typed apostrophe would not match. */
const OKINA = "ʻ";
const UZBEK = `O${OKINA}zbekcha`;
/** The name of UZS in `GET /settings` answered in uz, and the сум of the uz money messages. */
const SOM_NAME = `So${OKINA}m`;
const SOM = `so${OKINA}m`;
/** «до …» of the presets in uz: `sheet.upto` = «{amount} gacha». */
const MLN_PRESET = new RegExp(`^\\d+(,\\d)?\\smln\\s${SOM}\\sgacha$`);
/** The thousands separator of the `ru-RU` number locale that uz uses. */
const NBSP = "\u00a0";
/**
 * A daily preset below a million сум: three digits, the no-break space, `000`, then the plain spaces of `money.uzs` and
 * `sheet.upto`. `toHaveText` with a RegExp matches the raw text without normalising whitespace, so the separator is
 * pinned. Tashkent's city presets give 400 000 at 12 800 сум per dollar, the fixed ones 300 000 while its stats load.
 */
const THOUSANDS_PRESET = new RegExp(`^\\d{3}${NBSP}000 ${SOM} gacha$`);
/**
 * Listing 100001 (WP-12 catalogue): own price $600 and district median $672 a month, at the reference rate of 12 800 сум
 * (`reference/default.uz.json`): 7 680 000 and 8 601 600 сум, rounded to a tenth of a million.
 */
const OWN_PRICE = `7,7 mln ${SOM}`;
const MEDIAN_LINE = `odatda 8,6 mln ${SOM}/oyiga`;

/** The visible copy only: `cacheComponents` keeps earlier routes in the document, hidden (`preserving-ui-state.md`). */
const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const html = (page: Page) => page.locator("html");
const route = (page: Page, name: string) => visible(page, `[data-route="${name}"]`);
const row = (page: Page, id: "language" | "currency") => visible(page, `[data-route="settings"] [data-settings-row="${id}"]`);
const tab = (page: Page, key: "search" | "saved" | "radars" | "settings") => visible(page, `[data-tab="${key}"]`);
const radio = (page: Page, name: string) => page.getByRole("radio", { name, exact: true });
/** The title region of a settings sub-page (`SubPage`, named by its title). */
const subPage = (page: Page, title: string) => page.getByRole("region", { name: title, exact: true });
const chip = (page: Page, key: string) => visible(page, `[data-topbar="search-list"] [data-chip="${key}"]`);
const cards = (page: Page) => visible(page, "article[data-listing]");
const card = (page: Page, number: number) => visible(page, `article[data-listing="${number}"]`);
/** The intercepted copy of a sheet address, inside its bottom sheet. */
const sheet = (page: Page, name: string) => visible(page, `[data-slot="bottom-sheet"] [data-route="${name}"][data-layer="sheet"]`);
/** The listing layer of `number` (each layer carries its own number). */
const layer = (page: Page, number: number) => visible(page, `[data-route="listing"][data-listing-number="${number}"]`);
const press = (page: Page, eventType: "backButtonClicked") =>
  page.evaluate((type) => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit(type), eventType);
const address = (page: Page) => new URL(page.url()).pathname;
const marker = (page: Page) => page.evaluate(() => (window as unknown as MarkedWindow).__journeyMarker);

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

/** The texts of a list of chips, once there is at least one and every one matches `pattern`. */
async function allMatch(texts: Promise<string[]>, pattern: RegExp): Promise<boolean> {
  const list = await texts;
  return list.length > 0 && list.every((text) => pattern.test(text));
}

test.describe(
  "locale and currency: settings → uz → UZS → feed → listing @journey",
  {
    annotation: [
      { type: "screen", description: "SCR-006" },
      { type: "screen", description: "SCR-007" },
      { type: "screen", description: "SCR-014" },
      { type: "screen", description: "SCR-018" },
      { type: "screen", description: "SCR-032" },
      { type: "screen", description: "SCR-035" },
      { type: "screen", description: "SCR-036" },
    ],
  },
  () => {
    test("uz and UZS switch in place; the tabs, the presets and the market scale follow them in the same document", async ({ page }) => {
      // About ten screens in one launch, each waiting on the API on stubs: three times the default test timeout.
      test.slow();
      await stubMedia(page);
      await launchApp(page, { path: "/settings" });
      await expect(html(page)).toHaveAttribute("data-session", "ready", { timeout: API_MS });
      await expect.poll(() => address(page)).toBe("/ru/settings");
      await expect(row(page, "language")).toBeVisible({ timeout: API_MS });

      // From here on the journey stays in this document: no navigation request, no new sign-in (`POST /bff/session`).
      const documents = recordRequests(page, (request) => request.isNavigationRequest());
      const signIns = recordRequests(page, (request) => request.method() === "POST" && new URL(request.url()).pathname === "/bff/session");
      await page.evaluate(() => {
        (window as unknown as MarkedWindow).__journeyMarker = 42;
      });

      // Language: «Oʻzbekcha» moves the segment and the texts in place.
      await row(page, "language").click();
      await expect(subPage(page, "Язык")).toBeVisible();
      await radio(page, UZBEK).click();
      await expect.poll(() => address(page)).toBe("/uz/settings/language");
      await expect(html(page)).toHaveAttribute("lang", "uz");
      await expect(subPage(page, "Til")).toBeVisible();
      await expect(radio(page, UZBEK)).toHaveAttribute("aria-checked", "true");
      expect(await marker(page)).toBe(42);

      // Back lands under the new segment; the tab bar of the settings root reads in Uzbek.
      await press(page, "backButtonClicked");
      await expect.poll(() => address(page)).toBe("/uz/settings");
      await expect(row(page, "language").locator("[data-settings-value]")).toHaveText(UZBEK);
      await expect(tab(page, "search")).toHaveText("Qidiruv");
      await expect(tab(page, "saved")).toHaveText("Saralangan");
      await expect(tab(page, "radars")).toHaveText("Radar");
      await expect(tab(page, "settings")).toHaveText("Sozlamalar");

      // Currency: the names are the uz ones of `GET /settings`, read again once `lang` turned uz.
      await row(page, "currency").click();
      await expect(subPage(page, "Valyuta")).toBeVisible();
      await expect(radio(page, "AQSH dollari")).toHaveAttribute("aria-checked", "true", { timeout: API_MS });
      await radio(page, SOM_NAME).click();
      await expect(radio(page, SOM_NAME)).toHaveAttribute("aria-checked", "true", { timeout: API_MS });
      expect(await marker(page)).toBe(42);

      // The saves are done: from here on the API's reads of the profile answer the uz profile with UZS the picks made,
      // as a real API would. The client keeps its saved changes over every read either way, so no assertion needs it.
      await withScenario(page, "uz", async () => {
        await press(page, "backButtonClicked");
        await expect.poll(() => address(page)).toBe("/uz/settings");
        await expect(row(page, "currency").locator("[data-settings-value]")).toHaveText(SOM_NAME);

        // Feed: the search tab lands on the uz feed with its uz chips.
        await tab(page, "search").click();
        await expect.poll(() => address(page)).toBe("/uz");
        await expect(route(page, "feed")).toBeVisible({ timeout: API_MS });
        await expect(cards(page).first()).toBeVisible({ timeout: API_MS });
        await expect(chip(page, "price")).toContainText("Narxi");
        const feedUrl = page.url();

        // The full filters sheet: long-term presets in «mln soʻm», a daily one below a million with grouped thousands.
        await chip(page, "filters").click();
        const filters = sheet(page, "filters");
        await expect(filters).toBeVisible();
        const presets = filters.locator('[data-section="price"] [data-slot="price-presets"] [data-preset]');
        await expect.poll(() => allMatch(presets.allTextContents(), MLN_PRESET), { timeout: API_MS }).toBe(true);
        await filters.locator('[data-section="rentTerm"]').getByRole("radio", { name: "Kunlik", exact: true }).click();
        await expect(presets.first()).toHaveText(THOUSANDS_PRESET);
        expect((await presets.allTextContents()).join(" · ")).not.toContain("$");

        // Closed by Back without «Koʻrsatish»: the feed's address is unchanged.
        await press(page, "backButtonClicked");
        await expect(visible(page, "[data-layer]")).toHaveCount(0);
        await expect(page).toHaveURL(feedUrl);

        // Listing: the market scale the client formats reads in сум, with the decimal comma of uz.
        await card(page, LISTING).locator("a").click();
        await expect(page).toHaveURL(new RegExp(`/uz/listing/${LISTING}$`));
        // A layer may hold a kept copy of its screen beside the shown one: every lookup takes the visible copy.
        const listing = layer(page, LISTING);
        await expect(listing.locator('[data-listing-state="loaded"]').filter({ visible: true }).first()).toBeVisible({ timeout: API_MS });
        const market = listing.locator('[data-section="market"]').filter({ visible: true }).first();
        await expect(market.getByRole("heading")).toHaveText("Tuman bilan solishtirish");
        await expect(market.locator("[data-market-marker]")).toHaveText(OWN_PRICE);
        await expect(market.getByText(MEDIAN_LINE, { exact: true })).toHaveCount(1);
      });

      expect(await marker(page)).toBe(42);
      expect(documents.map((request) => request.url())).toEqual([]);
      expect(signIns.map((request) => request.url())).toEqual([]);
    });
  },
);
