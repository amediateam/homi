import { expect, launchApp, stubMedia, test } from "@homi/testing/playwright";
import type { Page, Request } from "@playwright/test";

/**
 * The owner form end to end on stubs (WP-81, SCR-050 … SCR-053), with the cabinet on (`OWNER_CABINET_ENABLED=true` of
 * the default run's API), in cookie and header mode: a new draft starts at step «where» and «Указать вручную» leads to
 * the questionnaire; the complete stub draft (`01JF…04`, WP-80) opens on the questionnaire, an edit is autosaved by a
 * Server Action within the 600 ms wait, and «Дальше» opens the phone step; Back from the phone step finds the
 * questionnaire again, and Back from the questionnaire closes the form.
 */

const UNTOUCHED = "01JF0000000000000000000001";
const COMPLETE = "01JF0000000000000000000004";

const isServerAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;

function actions(page: Page): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (isServerAction(request)) {
      sent.push(request);
    }
  });
  return sent;
}

const back = (page: Page) => page.evaluate(() => (window as unknown as { __homiFakeTelegram: { emit(type: string): void } }).__homiFakeTelegram.emit("backButtonClicked"));

for (const mode of ["cookie", "header"] as const) {
  test.describe(`owner form (${mode} mode)`, { annotation: [{ type: "screen", description: "SCR-050" }, { type: "screen", description: "SCR-051" }, { type: "screen", description: "SCR-052" }, { type: "screen", description: "SCR-053" }, { type: "screen", description: "SCR-055" }, { type: "screen", description: "SCR-056" }] }, () => {
    test("a new draft starts at step «where»; «Указать вручную» opens the questionnaire", async ({ page }) => {
      await stubMedia(page);
      const sent = actions(page);
      await launchApp(page, { mode, path: "/owner/new" });

      await expect(page).toHaveURL(new RegExp(`/ru/owner/${UNTOUCHED}/place\\?first=1$`));
      expect(sent.length).toBeGreaterThan(0);
      await expect(page.locator("[data-owner-picker]")).toBeVisible();
      await page.locator('[data-action="pick-manual"]').click();

      await expect(page).toHaveURL(new RegExp(`/ru/owner/${UNTOUCHED}$`));
      await expect(page.locator("[data-owner-questionnaire]").filter({ visible: true })).toHaveCount(1);
      await expect(page.locator("[data-owner-title]").first()).toHaveText("Сдать квартиру");
    });

    test("the complete draft: an edit is autosaved, «Дальше» opens the phone step, Back returns, Back closes", async ({ page }) => {
      await stubMedia(page);
      const sent = actions(page);
      await launchApp(page, { mode, path: `/owner/${COMPLETE}` });
      // A step pushed from the form loaded directly shows the form's overlay copy over it: the visible one counts.
      const form = page.locator("[data-owner-questionnaire]").filter({ visible: true });
      await expect(form).toBeVisible();

      await page.locator('[data-rooms="3"]').click();
      await expect.poll(() => sent.length, { timeout: 5000 }).toBeGreaterThan(0);

      await page.locator('[data-action="next"]').click();
      await expect(page).toHaveURL(new RegExp(`/ru/owner/${COMPLETE}/phone$`));
      await expect(page.locator('[data-owner-step="phone"]')).toBeVisible();
      await expect(page.locator('[data-action="share-phone"]')).toBeEnabled();

      await back(page);
      await expect(page).toHaveURL(new RegExp(`/ru/owner/${COMPLETE}$`));
      await expect(form).toBeVisible();

      // Loaded directly: nothing of this launch is below the form, so closing it goes to its parent.
      await back(page);
      await expect(page).toHaveURL(/\/ru\/settings$/);
    });
  });
}
