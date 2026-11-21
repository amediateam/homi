import { expect, launchApp, projectSessionMode, setScenario, stubMedia, test, withScenario } from "@homi/testing/playwright";

/**
 * The stub scenario reaches every path of the app (WP-33 step 2, WP-22): the server's own reads of a document, the
 * browser's reads through `/bff`, and a Server Action. The test names no mode, so it runs in cookie mode
 * (`miniapp-cookie`: a reload reads page one on the server with the cookie) and in header mode (`miniapp-header`: the
 * same read goes through `/bff` with the bearer).
 */
test.describe("stub scenarios", () => {
  test("«empty» empties the feed of a reloaded document, and clearing it brings the cards back", async ({ page }) => {
    await stubMedia(page);
    await launchApp(page);
    await expect(page.locator("[data-card]").filter({ visible: true }).first()).toBeVisible();

    await setScenario(page, "empty");
    const document = page.waitForResponse((response) => response.request().isNavigationRequest());
    await page.reload();
    const html = await (await document).text();
    // An empty first page shows the empty state, or the few-results note when the city's counts offer one.
    await expect(page.locator('[data-empty="feed"], [data-slot="few-note"]').filter({ visible: true })).toBeVisible();
    await expect(page.locator("[data-card]").filter({ visible: true })).toHaveCount(0);
    // In cookie mode the server read page one itself with the scenario, so the document holds no card.
    if (projectSessionMode(test.info()) === "cookie") {
      expect(html).not.toContain("data-card=");
    }

    await setScenario(page, null);
    await page.reload();
    await expect(page.locator("[data-card]").filter({ visible: true }).first()).toBeVisible();
  });

  test("«source_unavailable» refuses a Server Action, and the next save without it goes through", async ({ page }) => {
    await stubMedia(page);
    await launchApp(page);
    const heart = page.locator("[data-card]").filter({ visible: true }).first().locator("[data-fav]");
    await expect(heart).toHaveAttribute("aria-pressed", "false");

    await withScenario(page, "source_unavailable", async () => {
      await heart.click();
      await expect(page.getByText("Не получилось сохранить")).toBeVisible();
      await expect(heart).toHaveAttribute("aria-pressed", "false");
    });

    await heart.click();
    await expect(heart).toHaveAttribute("aria-pressed", "true");
  });
});
