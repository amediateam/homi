import { allowConsoleErrors, expect, launchApp, playwrightTelegram, test } from "@homi/testing/playwright";
import type { Page, Request } from "@playwright/test";

/**
 * The error reports of WP-32 (`03` §1.6, §3.4; TMA-003) against the API on stubs: a render error of the gallery of WP-23
 * gives one `app_error` of kind `render` and the crash screen; an uncaught error and an unhandled rejection give one
 * each, and the same one again gives none; a bundle that cannot start makes the boot guard post `/bff/boot-error`, with
 * no launch data in the body.
 */

type AppError = { name: string; props: { v: string; error: Record<string, string> } };

const isEvents = (request: Request) => new URL(request.url()).pathname === "/bff/events" && request.method() === "POST";
const crash = (page: Page) => page.locator('[data-route="error"]').filter({ visible: true });
const gallery = (page: Page) => page.getByTestId("gallery-throw").filter({ visible: true });

/** The `app_error` bodies the page posts from now on. */
function reports(page: Page): () => AppError["props"]["error"][] {
  const seen: AppError[] = [];
  page.on("request", (request) => {
    if (isEvents(request)) {
      const body = JSON.parse(request.postData() ?? "{}") as AppError;
      if (body.name === "app_error") {
        seen.push(body);
      }
    }
  });
  return () => seen.map((body) => body.props.error);
}

for (const mode of ["cookie", "header"] as const) {
  test.describe(`error reports (${mode} mode)`, () => {
    test("a render error gives one app_error of kind render, from the screen it happened on, and the crash screen", { annotation: [{ type: "screen", description: "SCR-045" }] }, async ({ page }) => {
      allowConsoleErrors(test.info(), /UI gallery: a render error on purpose/);
      const reported = reports(page);
      await launchApp(page, { mode, path: "/ru/dev/ui" });
      await expect(page.locator("html")).toHaveAttribute("data-session", "ready");
      await expect(gallery(page)).toBeVisible();

      await gallery(page).click();

      await expect(crash(page)).toBeVisible();
      await expect.poll(() => reported().filter((error) => error.kind === "render")).toHaveLength(1);
      // A late duplicate would show by now.
      await page.waitForTimeout(500);
      expect(reported().filter((error) => error.kind === "render")).toHaveLength(1);
      expect(reported().find((error) => error.kind === "render")).toMatchObject({
        name: "Error",
        message: "UI gallery: a render error on purpose",
        stage: "app",
        screen: "dev/ui",
      });
    });

    test("an uncaught error and an unhandled rejection give one app_error each; the same again gives none", async ({ page }) => {
      allowConsoleErrors(test.info(), /^uncaught: e2e: (thrown|rejected) twice$/);
      const reported = reports(page);
      await launchApp(page, { mode, path: "/" });
      await expect(page.locator("html")).toHaveAttribute("data-session", "ready");
      await expect(page.locator("article[data-listing]").first()).toBeVisible();

      await page.evaluate(() => {
        for (let index = 0; index < 2; index += 1) {
          setTimeout(() => {
            throw new Error("e2e: thrown twice");
          });
          void Promise.reject(new Error("e2e: rejected twice"));
        }
      });

      await expect.poll(() => reported().map((error) => `${error.kind}:${error.message}`).sort()).toEqual([
        "error:e2e: thrown twice",
        "rejection:e2e: rejected twice",
      ]);
      // A late duplicate would show by now.
      await page.waitForTimeout(500);
      expect(reported()).toHaveLength(2);
      expect(reported().every((error) => error.screen === "search/list" && error.stage === "app")).toBe(true);
    });
  });
}

test.describe("error reports", { annotation: [{ type: "screen", description: "SCR-001" }] }, () => {
  test("a bundle that cannot start makes the boot guard post /bff/boot-error, without launch data", async ({ page }) => {
    await playwrightTelegram(page);
    const posted: Request[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/bff/boot-error") {
        posted.push(request);
      }
    });
    await page.route("**/_next/static/chunks/**", (route) => route.abort());
    await page.goto("/ru");

    await expect(page.locator("[data-boot-screen]")).toBeVisible();
    await expect.poll(() => posted.length).toBeGreaterThan(0);
    const body = posted[0]!.postData() ?? "";
    expect(JSON.parse(body)).toMatchObject({ error: { name: "ChunkLoadError" } });
    expect(body).not.toMatch(/tgWebAppData|query_id|auth_date|hash=/);
  });
});
