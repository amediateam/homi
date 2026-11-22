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

test.describe("session-mode checks", () => {
  test("header mode: a token planted in localStorage is a finding", async ({ page }) => {
    const token = await signedIn(page, "header");
    expect(await modeFindings(test.info())).toEqual([]);

    await page.evaluate((value) => localStorage.setItem("planted", value), token);
    expect(await modeFindings(test.info())).toContain("header mode: the token is in localStorage or sessionStorage");
    resetModeRecords();
  });

  test("header mode: a request that carries a planted session cookie is a finding", async ({ page }) => {
    await signedIn(page, "header");
    // A plain cookie: Chromium's snapshot of an intercepted request's headers (every request passes the guard's route)
    // leaves a `Partitioned` cookie out, so a real partitioned `homi_session` is caught by the end-of-test check of the
    // context's cookies instead ("the context holds a homi_session cookie"), which this test sees as well.
    await page.context().addCookies([{ name: "homi_session", value: "planted", url: test.info().project.use.baseURL ?? "http://localhost:3001" }]);
    await page.evaluate(() => fetch("/bff/reference").then((response) => response.status));
    const findings = await modeFindings(test.info());
    expect(findings).toContain("header mode: GET /bff/reference carried the session cookie");
    expect(findings).toContain("header mode: the context holds a homi_session cookie");
    resetModeRecords();
    await page.context().clearCookies({ name: "homi_session" });
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
