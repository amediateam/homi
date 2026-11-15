import { expect, test } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

/**
 * The app foundation end to end (WP-20): the locale redirect with the launch fragment, the route tree in three
 * locales, interception into the sheet and overlay slots, and the theme and lite attributes.
 */
const LOCALES = ["ru", "uz", "en"] as const;
const RADAR = "01JD7K3QZ8V6R3M2N4P5Q6R7S8";

/** Every address of `25` §3.2 with the placeholder each one shows on a direct load. */
const ADDRESSES: [string, string[]][] = [
  ["", ["feed"]],
  ["/map", ["map"]],
  ["/filters", ["filters"]],
  ["/filters/rooms", ["filters/rooms"]],
  ["/filters/price", ["filters/price"]],
  ["/filters/owner", ["filters/owner"]],
  ["/sort", ["sort"]],
  ["/city", ["city"]],
  ["/listing/1", ["listing"]],
  ["/listing/1/photos", ["listing", "listing/photos"]],
  ["/listing/1/location", ["listing", "listing/location"]],
  ["/listing/1/market", ["listing", "listing/market"]],
  ["/listing/1/actions", ["listing", "listing/actions"]],
  ["/saved", ["saved"]],
  ["/saved/history", ["saved/history"]],
  ["/radars", ["radars"]],
  ["/radars/new", ["radars/new"]],
  [`/radars/${RADAR}`, ["radar"]],
  [`/radars/${RADAR}/edit`, ["radar", "radar/edit"]],
  ["/radars/found", ["radars/found"]],
  ["/settings", ["settings"]],
  ...["theme", "graphics", "language", "currency", "quiet-hours", "digest", "hidden"].map(
    (name): [string, string[]] => [`/settings/${name}`, ["settings", `settings/${name}`]],
  ),
  ["/welcome/language", ["welcome/language"]],
  ["/welcome/city", ["welcome/city"]],
  ["/no-access", ["no-access"]],
  ["/outside", ["outside"]],
];

type NextWindow = Window & { next: { router: { push(href: string): void } } };

/** A client-side navigation through the app router, as a `Link` would make it. */
async function softNavigate(page: Page, href: string) {
  await page.evaluate((target) => (window as unknown as NextWindow).next.router.push(target), href);
}

/**
 * The visible copies of a selector. Next.js keeps a page it navigated away from in the DOM inside a hidden React
 * `<Activity>` (`preserving-ui-state.md`), so a closed layer is hidden, not removed.
 */
function visible(page: Page, selector: string) {
  return page.locator(selector).filter({ visible: true });
}

/** Marks an element so a later check can tell that the same node is still mounted. */
async function mark(page: Page, selector: string, value: string) {
  await page.locator(selector).first().evaluate((element, probe) => element.setAttribute("data-probe", probe), value);
}

test.describe("locale redirect", () => {
  test("/ goes to /ru and keeps the query and the launch fragment", async ({ page }) => {
    await page.goto("/?listing=7#tgWebAppData=x");

    expect(new URL(page.url()).pathname).toBe("/ru");
    expect(new URL(page.url()).search).toBe("?listing=7");
    expect(await page.evaluate(() => location.hash)).toBe("#tgWebAppData=x");
  });

  test("a deeper path keeps its query under the locale", async ({ page }) => {
    await page.goto("/listing/5?x=1");

    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe("/ru/listing/5?x=1");
  });

  test("next-intl's cookie picks the locale", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "NEXT_LOCALE", value: "uz", url: baseURL }]);
    await page.goto("/");

    expect(new URL(page.url()).pathname).toBe("/uz");
  });

  test("Accept-Language is not used", async ({ request }) => {
    const response = await request.get("/", { headers: { "Accept-Language": "en-GB,en;q=0.9" }, maxRedirects: 0 });

    expect(response.status()).toBe(307);
    expect(new URL(response.headers().location, "http://x").pathname).toBe("/ru");
  });
});

test.describe("addresses", () => {
  for (const locale of LOCALES) {
    test(`every address answers 200 with its placeholder in ${locale}`, async ({ request }) => {
      for (const [path, names] of ADDRESSES) {
        const response = await request.get(`/${locale}${path}`);
        expect(response.status(), `/${locale}${path}`).toBe(200);
        const html = await response.text();
        for (const name of names) {
          expect(html, `/${locale}${path} shows ${name}`).toContain(`data-route="${name}"`);
        }
        expect(html).toContain(`<html lang="${locale}"`);
      }
    });

    test(`the lang attribute follows the segment in ${locale}`, async ({ page }) => {
      await page.goto(`/${locale}/map`);

      await expect(page.locator("html")).toHaveAttribute("lang", locale);
    });
  }

  // Documents render at request time for the CSP nonce (ADR-0020); the not-found screen then answers 200 with
  // noindex instead of 404 (AM-57).
  test("an unknown address and an unknown locale render the not-found screen with noindex", async ({ page }) => {
    for (const path of ["/ru/unknown", "/en/listing", "/uz/settings/nope", "/de/x"]) {
      await page.goto(path);
      await expect(page.locator('[data-route="not-found"]'), path).toBeVisible();
      await expect(page.locator('meta[name="robots"]'), path).toHaveAttribute("content", "noindex");
    }
  });

  test("an invalid parameter renders the not-found placeholder", async ({ page }) => {
    for (const path of ["/ru/listing/abc", "/ru/listing/0", "/ru/filters/sort", "/ru/radars/12"]) {
      await page.goto(path);
      await expect(page.locator('[data-route="not-found"]'), path).toBeVisible();
    }
  });
});

test.describe("layers", () => {
  test("a sheet opened by navigation shows over the feed, Back closes it, reload shows the direct page", async ({
    page,
  }) => {
    await page.goto("/ru");
    await mark(page, '[data-route="feed"]', "feed");

    await softNavigate(page, "/ru/filters?city=x");
    await expect(page.locator('[data-route="filters"][data-layer="sheet"]')).toBeVisible();
    await expect(page.locator('[data-route="feed"][data-probe="feed"]')).toBeAttached();

    await page.goBack();
    await expect(visible(page, '[data-route="filters"]')).toHaveCount(0);
    await expect(page.locator('[data-route="feed"][data-probe="feed"]')).toBeVisible();

    await page.goForward();
    await expect(page.locator('[data-route="filters"][data-layer="sheet"]')).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-route="filters"]:not([data-layer])')).toBeVisible();
    await expect(page.locator('[data-route="feed"]')).toHaveCount(0);
  });

  test("a quick filter, the sort and the radar sheets intercept the same way", async ({ page }) => {
    await page.goto("/ru");
    for (const [href, name] of [
      ["/ru/filters/rooms", "filters/rooms"],
      ["/ru/sort", "sort"],
      ["/ru/city", "city"],
    ]) {
      await softNavigate(page, href);
      await expect(page.locator(`[data-route="${name}"][data-layer="sheet"]`)).toBeVisible();
      await expect(page.locator('[data-route="feed"]')).toBeAttached();
      await page.goBack();
      await expect(visible(page, `[data-route="${name}"]`)).toHaveCount(0);
    }

    await page.goto("/ru/radars");
    await mark(page, '[data-route="radars"]', "radars");
    await softNavigate(page, `/ru/radars/${RADAR}`);
    await expect(page.locator('[data-route="radar"][data-layer="sheet"]')).toBeVisible();
    await softNavigate(page, `/ru/radars/${RADAR}/edit`);
    await expect(page.locator('[data-route="radar"][data-layer="sheet"] [data-route="radar/edit"]')).toBeVisible();
    await expect(page.locator('[data-route="radars"][data-probe="radars"]')).toBeAttached();
  });

  test("the listing stays mounted under its child layer in the overlay", async ({ page }) => {
    await page.goto("/ru");
    await mark(page, '[data-route="feed"]', "feed");

    await softNavigate(page, "/ru/listing/1");
    const listing = page.locator('[data-route="listing"][data-layer="overlay"]');
    await expect(listing).toBeVisible();
    await mark(page, '[data-route="listing"][data-layer="overlay"]', "listing");

    await softNavigate(page, "/ru/listing/1/photos");
    await expect(listing.locator('[data-route="listing/photos"]')).toBeVisible();
    await expect(page.locator('[data-route="listing"][data-probe="listing"]')).toBeAttached();
    await expect(page.locator('[data-route="feed"][data-probe="feed"]')).toBeAttached();

    await page.goBack();
    await expect(visible(page, '[data-route="listing/photos"]')).toHaveCount(0);
    await expect(page.locator('[data-route="listing"][data-probe="listing"]')).toBeVisible();

    await page.goBack();
    await expect(visible(page, '[data-route="listing"]')).toHaveCount(0);
    await expect(page.locator('[data-route="feed"][data-probe="feed"]')).toBeVisible();
  });

  test("a direct load of a listing child shows the listing under it", async ({ page }) => {
    await page.goto("/ru/listing/1/market");

    await expect(page.locator('[data-route="listing"]:not([data-layer]) [data-route="listing/market"]')).toBeVisible();
  });
});

test.describe("themes and lite", () => {
  const background = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const glassFilter = (page: Page) =>
    page.locator("[data-glass-sample]").first().evaluate((element) => getComputedStyle(element).backdropFilter);

  test("the three theme states and the lite class change the computed styles", async ({ page }) => {
    await page.goto("/ru");
    await expect(page.locator("html")).toHaveAttribute("data-scheme", "light");
    expect(await background(page)).toBe("rgb(255, 255, 255)");
    expect(await glassFilter(page)).toContain("blur(22px)");

    await page.evaluate(() => document.documentElement.style.setProperty("--tg-theme-bg-color", "#123456"));
    expect(await background(page)).toBe("rgb(18, 52, 86)");

    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    expect(await background(page)).toBe("rgb(255, 255, 255)");

    await page.evaluate(() => {
      document.documentElement.removeAttribute("data-theme");
      document.documentElement.setAttribute("data-scheme", "dark");
    });
    expect(await background(page)).toBe("rgb(0, 0, 0)");

    await page.evaluate(() => document.documentElement.classList.add("lite"));
    expect(await glassFilter(page)).toBe("none");
  });

  test("the accent is the brand yellow in every state", async ({ page }) => {
    await page.goto("/ru");
    const accent = () =>
      page.evaluate(() => getComputedStyle(document.querySelector('[data-slot="button"]') as Element).backgroundColor);

    expect(await accent()).toBe("rgb(255, 210, 63)");
    await page.evaluate(() => document.documentElement.setAttribute("data-scheme", "dark"));
    expect(await accent()).toBe("rgb(255, 210, 63)");
  });
});
