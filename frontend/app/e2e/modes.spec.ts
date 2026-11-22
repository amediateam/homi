import { expect, launchApp, modeFindings, resetModeRecords, test } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

/**
 * The checks every test gets after it passes (WP-33 "Tests", `@homi/testing` `modes.ts`) fail on a planted breach.
 * Each test reads the findings itself and then forgets them, so its own teardown passes.
 */
const isSignIn = (url: string, method: string) => new URL(url).pathname === "/bff/session" && method === "POST";

async function signedIn(page: Page, mode: "cookie" | "header"): Promise<string> {
  const answer = page.waitForResponse((response) => isSignIn(response.url(), response.request().method()) && response.status() === 200);
  await launchApp(page, { mode });
  const { token } = (await (await answer).json()) as { token: string };
  await expect(page.locator("html")).toHaveAttribute("data-session", "ready");
  return token;
}

test.describe("session-mode checks", { annotation: [{ type: "screen", description: "SCR-006" }] }, () => {
  test("header mode: a token planted in localStorage is a finding", async ({ page }) => {
    const token = await signedIn(page, "header");
    expect(await modeFindings(test.info())).toEqual([]);

    await page.evaluate((value) => localStorage.setItem("planted", value), token);
    expect(await modeFindings(test.info())).toContain("header mode: the token is in localStorage or sessionStorage");
    resetModeRecords();
  });

  test("cookie mode: a planted Authorization header on a /bff/ read is a finding", async ({ page }) => {
    await signedIn(page, "cookie");
    expect(await modeFindings(test.info())).toEqual([]);

    await page.evaluate(() => fetch("/bff/reference", { headers: { Authorization: "Bearer planted" } }).then((response) => response.status));
    expect(await modeFindings(test.info())).toContain("cookie mode: GET /bff/reference carried Authorization");
    resetModeRecords();
  });

  test("cookie mode: a console error of the page is a finding unless the test declares it", async ({ page }) => {
    await signedIn(page, "cookie");
    await page.evaluate(() => console.error("planted"));
    expect(await modeFindings(test.info())).toContain("console error: planted");
    resetModeRecords();
  });
});
