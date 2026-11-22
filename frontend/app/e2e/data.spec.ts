import { expect, launchApp, stubMedia, test as base } from "@homi/testing/playwright";
import type { Page, Request } from "@playwright/test";

/**
 * The data layer of WP-22 against the API on stubs, on the screens that use it since WP-24 and WP-27 replaced the
 * placeholders and their proof: the search state parsed from the address reaches the reads and the chrome (the map's
 * filters button, the list's chips), the reference data arrives (the list's city chip names the city), the demo
 * marker shows; in cookie mode the server reads the list's first page with the cookie and the browser does not; a
 * search written by the map's deal switch replaces the address, keeps a reserved parameter and survives a reload;
 * in header mode the map's read goes through `/bff` with the bearer header and no session cookie; and `/bff` passes
 * only the listed reads. `feed.spec.ts` covers the list's reads in both modes in depth; every photo is answered by
 * `stubMedia`.
 */

const test = base.extend<{ photos: readonly string[] }>({
  /** The stub photos answered so far: the list shows them, and CI has no `cdn.homi.loc`. */
  photos: [async ({ page }, use) => use(await stubMedia(page)), { auto: true }],
});

/**
 * The visible copy only: with `cacheComponents` the router may keep an earlier copy of the route hidden in
 * `<Activity>` (`preserving-ui-state.md`), so the same element can be in the document twice, once hidden.
 */
const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const mapBar = (page: Page) => visible(page, '[data-topbar="map"]');
const chip = (page: Page, key: string) => visible(page, `[data-topbar="search-list"] [data-chip="${key}"]`);
const cards = (page: Page) => visible(page, "article[data-listing]");
/** The map's points: `GET /listings/map` through `/bff`. */
const isMapRead = (request: Request) => new URL(request.url()).pathname === "/bff/listings/map";
/** The list's page one: `/bff/listings` without a cursor. */
const isPageOne = (request: Request) => {
  const url = new URL(request.url());
  return url.pathname === "/bff/listings" && !url.searchParams.has("cursor");
};

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

/** The session is ready and the map has drawn its answer: at least one marker and no status pill. */
async function mapReady(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-session", "ready");
  await expect(visible(page, "[data-marker]").first()).toBeVisible();
  await expect(visible(page, "[data-map-status]")).toHaveCount(0);
}

/** The session is ready and the list shows its first card. */
async function listReady(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-session", "ready");
  await expect(cards(page).first()).toBeVisible();
}

test.describe("data layer", { annotation: [{ type: "screen", description: "SCR-007" }, { type: "screen", description: "SCR-011" }] }, () => {
  test("cookie mode: the parsed search reaches the map's read and its filters button, then the list's chips; the reference data and the demo marker", async ({ page }) => {
    const reads = recordRequests(page, isMapRead);
    await launchApp(page, { path: "/ru/map?rooms_min=2" });
    await mapReady(page);

    expect(new URL(page.url()).searchParams.get("rooms_min")).toBe("2");
    expect(reads).toHaveLength(1);
    const query = new URL(reads[0].url()).searchParams;
    expect(query.get("rooms_min")).toBe("2");
    // The city of `GET /me`, which an address without one leaves to the session.
    expect(query.get("city")).toBe("tashkent");
    await expect(mapBar(page).getByRole("button", { name: "Фильтры, 1" })).toBeVisible();
    await expect(page.locator("[data-demo-marker]")).toBeVisible();

    // The list of the same search: the rooms chip is on, and the city chip names the city of the reference data.
    await visible(page, "[data-view-toggle]").click();
    await expect(page).toHaveURL(/\/ru\?/);
    await listReady(page);
    expect(new URL(page.url()).searchParams.get("rooms_min")).toBe("2");
    await expect(chip(page, "rooms")).toHaveAttribute("data-state", "on");
    await expect(chip(page, "city")).toHaveText("Ташкент");
    await expect(page.locator("[data-demo-marker]")).toBeVisible();
  });

  test("cookie mode: after a reload the server reads the list's page one for the address with the cookie, and the browser does not", async ({ page }) => {
    await launchApp(page, { path: "/?rooms_min=2" });
    await listReady(page);

    const reads = recordRequests(page, isPageOne);
    const document = await page.reload();
    const markup = (await document?.text()) ?? "";
    await listReady(page);
    await page.waitForLoadState("networkidle");

    const served = new Set(markup.match(/data-listing="\d+"/g));
    expect(served.size).toBeGreaterThan(0);
    await expect(cards(page)).toHaveCount(served.size);
    expect(reads).toEqual([]);
    await expect(chip(page, "rooms")).toHaveAttribute("data-state", "on");
    await expect(page.locator("[data-demo-marker]")).toBeVisible();
  });

  test("a filter change rewrites the address without a history entry, keeps a reserved parameter, and a reload restores it", async ({ page }) => {
    await launchApp(page, { path: "/ru/map?from=map" });
    await mapReady(page);
    const entries = await page.evaluate(() => history.length);
    const sale = mapBar(page).getByRole("radio", { name: "Продажа" });
    await expect(sale).toHaveAttribute("data-state", "unchecked");

    const read = page.waitForRequest((request) => isMapRead(request) && new URL(request.url()).searchParams.get("deal") === "sale");
    await sale.click();

    await expect(page).toHaveURL(/[?&]deal=sale(&|$)/);
    const url = new URL(page.url());
    expect(url.searchParams.get("from")).toBe("map");
    expect(url.searchParams.get("city")).toBe("tashkent");
    expect(await page.evaluate(() => history.length)).toBe(entries);
    await expect(sale).toHaveAttribute("data-state", "checked");
    await read;
    await mapReady(page);

    const again = page.waitForRequest((request) => isMapRead(request));
    await page.reload();
    expect(new URL((await again).url()).searchParams.get("deal")).toBe("sale");
    await mapReady(page);
    await expect(page).toHaveURL(url.href);
    await expect(mapBar(page).getByRole("radio", { name: "Продажа" })).toHaveAttribute("data-state", "checked");
  });

  test("header mode: the map's read goes through /bff with the bearer header and no session cookie", async ({ page }) => {
    const read = page.waitForRequest(isMapRead);
    await launchApp(page, { mode: "header", path: "/ru/map?rooms_min=2" });

    const request = await read;
    expect(request.headers().authorization ?? "").toMatch(/^Bearer \S+$/);
    expect((await request.allHeaders()).cookie ?? "").not.toContain("homi_session");
    expect(new URL(request.url()).searchParams.get("rooms_min")).toBe("2");
    await mapReady(page);
    await expect(mapBar(page).getByRole("button", { name: "Фильтры, 1" })).toBeVisible();
    await expect(page.locator("[data-demo-marker]")).toBeVisible();
  });

  test("/bff passes only the listed reads", async ({ page }) => {
    await launchApp(page, { path: "/ru/map" });
    await expect(page.locator("html")).toHaveAttribute("data-session", "ready");

    for (const path of ["/bff/listings/1/contact", "/bff/events", "/bff/auth/telegram", "/bff/listings/abc"]) {
      expect((await page.request.get(path)).status(), path).toBe(404);
    }
    expect((await page.request.get("/bff/reference")).status()).toBe(200);
  });
});
