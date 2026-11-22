import { allowConsoleErrors, expect, launchApp, test } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

/**
 * The app foundation end to end (WP-20): the locale redirect with the launch fragment, the route tree in three
 * locales, interception into the sheet and overlay slots, and the theme and lite attributes. Since WP-23 the gates
 * send a page opened without Telegram to `/outside`, so the checks of the redirect read the server's answer, those of
 * the route tree the server HTML, and the tests that use a page in the browser launch the app in the fake Telegram
 * with a sign-in that never reaches the app server (`launchSigningIn`).
 */
const LOCALES = ["ru", "uz", "en"] as const;
/** The first radar of the stub list (`radars/list.json`, WP-13): an id the radar sheet knows. */
const RADAR = "01JD0000000000000000000001";

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
  // The viewer and the two sheets are portalled and rendered in the browser only (WP-26): the server HTML holds the
  // listing alone. The location child (WP-28) renders inside the layer on the server too: the fullscreen spot map's
  // frame (its `RouteOverlay` with × over the map's background); the map itself mounts in the browser only.
  ["/listing/1/photos", ["listing"]],
  ["/listing/1/location", ["listing", "listing/location"]],
  ["/listing/1/market", ["listing"]],
  ["/listing/1/actions", ["listing"]],
  ["/saved", ["saved"]],
  ["/saved/history", ["saved/history"]],
  ["/radars", ["radars"]],
  ["/radars/new", ["radars/new"]],
  [`/radars/${RADAR}`, ["radar"]],
  [`/radars/${RADAR}/edit`, ["radar", "radar/edit"]],
  ["/radars/found", ["radars/found"]],
  ["/settings", ["settings"]],
  ...["theme", "graphics", "language", "currency", "quiet-hours", "digest", "cards", "hidden"].map(
    (name): [string, string[]] => [`/settings/${name}`, ["settings", `settings/${name}`]],
  ),
  ["/welcome/language", ["welcome/language"]],
  ["/welcome/city", ["welcome/city"]],
  ["/no-access", ["no-access"]],
  ["/outside", ["outside"]],
];

type NextWindow = Window & { next: { router: { push(href: string): void } } };

/** The session is still being created: no gate has moved the page (row 1). */
const signingIn = (page: Page, path: string) => expect(page.locator("html"), path).toHaveAttribute("data-session", "booting");

/**
 * Opens the app at `path` inside the fake Telegram while every session request fails as offline: the session stays
 * `booting` (the boot retry keeps trying), so the gates leave every address alone (row 1) and these WP-20 checks run
 * on the page they loaded, as before WP-23, without a request to the API — the full run shares one stub user's API
 * limit. The gates and the session have their own specs.
 */
async function launchSigningIn(page: Page, path: string) {
  await page.route("**/bff/session", (route) => route.abort("internetdisconnected"));
  await launchApp(page, { path });
  await signingIn(page, path);
}

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

/**
 * The address the document was served at after the redirects. Without Telegram the gates soon replace the page's
 * address with `/outside` (WP-23), so `page.url()` would race them.
 */
async function servedAt(page: Page, path: string): Promise<URL> {
  const response = await page.goto(path);
  expect(response, path).not.toBeNull();
  return new URL(response?.url() ?? page.url());
}

test.describe("locale redirect", { annotation: [{ type: "screen", description: "SCR-006" }] }, () => {
  test("/ goes to /ru and keeps the query and the launch fragment", async ({ page }) => {
    // The adapter removes the fragment once the SDK wait settled (TMA-009, WP-21), so it is read on arrival.
    await page.addInitScript(() => Object.assign(window, { __arrivedHash: location.hash }));
    const served = await servedAt(page, "/?listing=7#tgWebAppData=x");

    expect(served.pathname).toBe("/ru");
    expect(served.search).toBe("?listing=7");
    expect(await page.evaluate(() => (window as unknown as { __arrivedHash: string }).__arrivedHash)).toBe("#tgWebAppData=x");
  });

  test("a deeper path keeps its query under the locale", async ({ page }) => {
    const served = await servedAt(page, "/listing/5?x=1");

    expect(served.pathname + served.search).toBe("/ru/listing/5?x=1");
  });

  test("next-intl's cookie picks the locale", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "NEXT_LOCALE", value: "uz", url: baseURL }]);
    const served = await servedAt(page, "/");

    expect(served.pathname).toBe("/uz");
  });

  test("Accept-Language is not used", async ({ request }) => {
    const response = await request.get("/", { headers: { "Accept-Language": "en-GB,en;q=0.9" }, maxRedirects: 0 });

    expect(response.status()).toBe(307);
    expect(new URL(response.headers().location, "http://x").pathname).toBe("/ru");
  });
});

test.describe("addresses", { annotation: [{ type: "screen", description: "SCR-006" }] }, () => {
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

    // Without Telegram the gates move the page to `/outside` in the locale of its address (WP-23).
    test(`the lang attribute follows the segment in ${locale}`, async ({ page }) => {
      await page.goto(`/${locale}/map`);

      await expect(page).toHaveURL(new RegExp(`/${locale}/outside$`));
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
    });
  }

  // Documents render at request time for the CSP nonce (ADR-0020); the not-found screen then answers 200 with
  // noindex instead of 404 (AM-57). The first address is the launch, the others are loaded in the same Telegram. A
  // `notFound()` under `<Suspense>` gets two identical tags: the server inserts one into the head and Next.js's
  // not-found boundary adds its own when the client renders the screen; no robots tag may say anything else.
  test("an unknown address and an unknown locale render the not-found screen with noindex", async ({ page }) => {
    // The `notFound()` under `<Suspense>` (AM-57): when the boundary streams after the shell, React finishes it on the
    // client and reports error 419 as recoverable (WP-33: about one launch in sixteen).
    allowConsoleErrors(test.info(), /Minified React error #419/);
    const [first, ...others] = ["/ru/unknown", "/en/listing", "/uz/settings/nope", "/de/x"];
    await launchSigningIn(page, first);
    for (const path of [first, ...others]) {
      if (path !== first) {
        await page.goto(path);
      }
      await signingIn(page, path);
      await expect(page.locator('[data-route="not-found"]').filter({ visible: true }), path).toBeVisible();
      await expect(page.locator('meta[name="robots"][content="noindex"]').first(), path).toBeAttached();
      await expect(page.locator('meta[name="robots"]:not([content="noindex"])'), path).toHaveCount(0);
    }
  });

  // The fake Telegram is an init script, so the browser tests above pass without the boot script; real Telegram needs
  // it to insert the SDK tag. A `notFound()` outside `<Suspense>` would serve Next.js's `__next_error__` shell instead.
  test("an unknown address or parameter is a normal document with the boot script", async ({ request }) => {
    for (const path of ["/ru/unknown", "/en/listing", "/uz/settings/nope", "/ru/listing/abc"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      const html = await response.text();
      expect(html, path).toContain('id="homi-boot"');
      expect(html, path).not.toContain('id="__next_error__"');
      expect(html, path).toContain('<meta name="robots" content="noindex"/>');
    }
  });

  test("an invalid parameter renders the not-found screen", async ({ page }) => {
    const [first, ...others] = ["/ru/listing/abc", "/ru/listing/0", "/ru/filters/sort", "/ru/radars/12"];
    await launchSigningIn(page, first);
    for (const path of [first, ...others]) {
      if (path !== first) {
        await page.goto(path);
      }
      await signingIn(page, path);
      await expect(page.locator('[data-route="not-found"]').filter({ visible: true }), path).toBeVisible();
    }
  });
});

test.describe("layers", { annotation: [{ type: "screen", description: "SCR-006" }] }, () => {
  test("a sheet opened by navigation shows over the feed, Back closes it, reload shows the direct page", async ({
    page,
  }) => {
    await launchSigningIn(page, "/ru");
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
    // The form is keyed on the city (KI-54): this address has none that counts, so the form is mounted anew when the
    // profile's city arrives. For the length of the exit there are two copies, the leaving one `aria-hidden` under
    // the new one; a strict locator met both in CI (KI-63). The check is on the copy that stays.
    await expect(page.locator('[data-route="filters"]:not([data-layer]):not([aria-hidden="true"])').last()).toBeVisible();
    await expect(page.locator('[data-route="filters"]:not([data-layer])')).toHaveCount(1);
    await expect(page.locator('[data-route="feed"]')).toHaveCount(0);
  });

  test("a quick filter, the sort and the radar sheets intercept the same way", async ({ page }) => {
    await launchSigningIn(page, "/ru");
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
    await signingIn(page, "/ru/radars");
    await mark(page, '[data-route="radars"]', "radars");
    await softNavigate(page, `/ru/radars/${RADAR}`);
    await expect(page.locator('[data-route="radar"][data-layer="sheet"]')).toBeVisible();
    await softNavigate(page, `/ru/radars/${RADAR}/edit`);
    // The editor is portalled to the body (WP-30), a sibling of the radar sheet that stays mounted under it, so the
    // two are checked apart.
    await expect(page.locator('[data-route="radar"][data-layer="sheet"]')).toBeVisible();
    await expect(page.locator('[data-route="radar/edit"][data-layer="sheet"]')).toBeVisible();
    await expect(page.locator('[data-route="radars"][data-probe="radars"]')).toBeAttached();
  });

  test("the listing stays mounted under its child layer in the overlay", async ({ page }) => {
    await launchSigningIn(page, "/ru");
    await mark(page, '[data-route="feed"]', "feed");

    await softNavigate(page, "/ru/listing/1");
    const listing = page.locator('[data-route="listing"][data-layer="overlay"]');
    await expect(listing).toBeVisible();
    await mark(page, '[data-route="listing"][data-layer="overlay"]', "listing");

    await softNavigate(page, "/ru/listing/1/photos");
    // The viewer is portalled to the body (WP-26): over the listing, not inside it.
    await expect(visible(page, '[data-route="listing/photos"]')).toBeVisible();
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
    await launchSigningIn(page, "/ru/listing/1/market");

    // The market sheet is portalled to the body (WP-26), so the two are checked apart.
    await expect(page.locator('[data-route="listing"]:not([data-layer])')).toBeVisible();
    await expect(page.locator('[data-route="listing/market"]')).toBeVisible();
  });
});

/**
 * On the development gallery: its glass sample and a primary button. Until WP-31 these were the settings placeholder's
 * (WP-20); the settings screen has neither, and no placeholder route is left.
 */
test.describe("themes and lite", { annotation: [{ type: "screen", description: "SCR-006" }] }, () => {
  const background = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const glassFilter = (page: Page) =>
    page.locator("[data-glass-sample]").first().evaluate((element) => getComputedStyle(element).backdropFilter);

  test("the three theme states and the lite class change the computed styles", async ({ page }) => {
    await launchSigningIn(page, "/ru/dev/ui");
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
    await launchSigningIn(page, "/ru/dev/ui");
    const accent = () =>
      page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="gallery-glass-button"]') as Element).backgroundColor);

    expect(await accent()).toBe("rgb(255, 210, 63)");
    await page.evaluate(() => document.documentElement.setAttribute("data-scheme", "dark"));
    expect(await accent()).toBe("rgb(255, 210, 63)");
  });
});
