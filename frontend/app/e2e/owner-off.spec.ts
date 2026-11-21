import { expect, launchApp, stubMedia, test } from "@homi/testing/playwright";
import type { Request } from "@playwright/test";

/**
 * The owner cabinet switched off end to end (WP-81, DEC-81), tagged `@owner-off`: it runs with `@radars-off` against
 * the second API, which leaves `OWNER_CABINET_ENABLED` unset, so `GET /reference` says `owner_enabled: false`. A direct
 * load of `/owner/new` or of a draft's address ends on `/settings`, and no owner Server Action is sent.
 */

const isServerAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;

test.describe("owner cabinet switched off @owner-off", () => {
  for (const path of ["/owner/new", "/owner/01JF0000000000000000000004"]) {
    test(`${path} gives way to the settings tab and sends nothing`, async ({ page }) => {
      await stubMedia(page);
      const sent: Request[] = [];
      page.on("request", (request) => {
        if (isServerAction(request)) {
          sent.push(request);
        }
      });
      await launchApp(page, { path });

      await expect(page).toHaveURL(/\/ru\/settings$/);
      await expect(page.locator("[data-owner-questionnaire], [data-route='owner-new']")).toHaveCount(0);
      expect(sent).toEqual([]);
    });
  }
});
