import { expect, launchApp, test } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

/**
 * The data layer of WP-22 against the API on stubs: the proof on the feed placeholder shows the search state parsed
 * from the address, the reference data and a count read with the session — from the server in cookie mode, through
 * `/bff` in header mode.
 */

const proof = (page: Page, name: string) => page.locator(`[data-proof="${name}"]`);
const isCountRead = (url: string) => new URL(url).pathname === "/bff/listings/count";

async function ready(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-session", "ready");
  await expect(proof(page, "count")).toHaveAttribute("data-status", "success");
}

test.describe("data layer", () => {
  test("cookie mode: the parsed state, the cities, the count and the demo marker", async ({ page }) => {
    await launchApp(page, { path: "/ru?rooms_min=2&from=map" });
    await ready(page);

    await expect(proof(page, "filters")).toHaveText("city=tashkent&rooms_min=2");
    await expect(proof(page, "cities")).not.toHaveText("0");
    await expect(proof(page, "count")).toHaveText(/^\d+$/);
    await expect(page.locator("[data-demo-marker]")).toBeVisible();
  });

  test("cookie mode: after a reload the server reads the count with the cookie, and the browser does not", async ({ page }) => {
    await launchApp(page, { path: "/ru" });
    await ready(page);

    const reads: string[] = [];
    page.on("request", (request) => isCountRead(request.url()) && reads.push(request.url()));
    await page.reload();
    await ready(page);

    expect(reads).toEqual([]);
    await expect(page.locator("[data-demo-marker]")).toBeVisible();
  });

  test("a filter change rewrites the address without a history entry, keeps a reserved parameter, and a reload restores it", async ({ page }) => {
    await launchApp(page, { path: "/ru?from=map" });
    await ready(page);
    const entries = await page.evaluate(() => history.length);

    await proof(page, "deal").click();

    await expect(page).toHaveURL(/[?&]deal=sale(&|$)/);
    const url = new URL(page.url());
    expect(url.searchParams.get("from")).toBe("map");
    expect(url.searchParams.get("city")).toBe("tashkent");
    expect(await page.evaluate(() => history.length)).toBe(entries);
    await expect(proof(page, "filters")).toHaveText("city=tashkent&deal=sale");

    await page.reload();
    await ready(page);
    await expect(proof(page, "filters")).toHaveText("city=tashkent&deal=sale");
  });

  test("header mode: the same proof, read through /bff with the bearer header and no session cookie", async ({ page }) => {
    const read = page.waitForRequest((request) => isCountRead(request.url()));
    await launchApp(page, { mode: "header", path: "/ru?rooms_min=2" });

    const request = await read;
    expect(request.headers().authorization ?? "").toMatch(/^Bearer \S+$/);
    expect(request.headers().cookie ?? "").not.toContain("homi_session");
    await ready(page);
    await expect(proof(page, "filters")).toHaveText("city=tashkent&rooms_min=2");
    await expect(proof(page, "count")).toHaveText(/^\d+$/);
    await expect(page.locator("[data-demo-marker]")).toBeVisible();
  });

  test("/bff passes only the listed reads", async ({ page }) => {
    await launchApp(page, { path: "/ru" });
    await ready(page);

    for (const path of ["/bff/listings/1/contact", "/bff/events", "/bff/auth/telegram", "/bff/listings/abc"]) {
      expect((await page.request.get(path)).status(), path).toBe(404);
    }
    expect((await page.request.get("/bff/reference")).status()).toBe(200);
  });
});
