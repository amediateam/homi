import { expect, launchApp, test, type LaunchedApp } from "@homi/testing/playwright";
import type { Page, Request } from "@playwright/test";

/**
 * The journal of WP-32 (`03` §3.3; DEC-41, DEC-44) against the API on stubs: the events reach `POST /bff/events` with
 * their legacy names and property names, only once the session exists, in cookie mode and in header mode; nothing
 * outside Telegram. Without `NEXT_PUBLIC_POSTHOG_KEY` (the default e2e build) no PostHog host is asked for anything.
 */

type Event = { name: string; props: Record<string, unknown> };

const html = (page: Page) => page.locator("html");
const isEvents = (request: Request) => new URL(request.url()).pathname === "/bff/events" && request.method() === "POST";
const isSession = (request: Request) => new URL(request.url()).pathname === "/bff/session";
const isPosthog = (request: Request) => /posthog/i.test(new URL(request.url()).hostname) || /posthog/i.test(new URL(request.url()).pathname);

/** Records the journal's requests from now on, with the moment each was sent and its body. */
function journal(page: Page): { events: () => Event[]; requests: Request[] } {
  const requests: Request[] = [];
  page.on("request", (request) => {
    if (isEvents(request)) {
      requests.push(request);
    }
  });
  return { requests, events: () => requests.map((request) => JSON.parse(request.postData() ?? "{}") as Event) };
}

const names = (events: Event[]) => events.map((event) => event.name);

for (const mode of ["cookie", "header"] as const) {
  test.describe(`journal (${mode} mode)`, { annotation: [{ type: "screen", description: "SCR-006" }] }, () => {
    test("a launch from the menu sends app_launch then app_opened, both after the session answered; the header mode carries the bearer token", async ({ page }) => {
      const log = journal(page);
      const order: string[] = [];
      page.on("requestfinished", (request) => {
        if (isSession(request)) {
          order.push("session");
        }
      });
      page.on("request", (request) => {
        if (isEvents(request)) {
          order.push("event");
        }
      });

      await launchApp(page, { mode, path: "/" });
      await expect(html(page)).toHaveAttribute("data-session", "ready");
      await expect.poll(() => names(log.events())).toEqual(expect.arrayContaining(["app_launch", "app_opened"]));

      const launch = log.events().find((event) => event.name === "app_launch")!;
      expect(Object.keys(launch.props).sort()).toEqual(expect.arrayContaining(["entry", "js", "ms", "platform", "tg", "v"]));
      expect(launch.props.entry).toBe("menu");
      expect(log.events().find((event) => event.name === "app_opened")?.props).toMatchObject({ entry: "menu" });
      expect(order.indexOf("event")).toBeGreaterThan(order.indexOf("session"));
      const headers = await log.requests[0]!.allHeaders();
      if (mode === "header") {
        expect(headers.authorization).toMatch(/^Bearer \S+$/);
      } else {
        expect(headers.authorization).toBeUndefined();
      }
    });

    test("a launch from a listing link sends app_opened with entry link and the listing_id", async ({ page }) => {
      const log = journal(page);
      await launchApp(page, { mode, startParam: "l_100008-web" });
      await expect(html(page)).toHaveAttribute("data-session", "ready");

      await expect.poll(() => log.events().find((event) => event.name === "app_opened")?.props).toMatchObject({ entry: "link", listing_id: 100008 });
    });

    test("«Позвонить» sends contact_call with the listing_id and via; no PostHog host is asked for anything without a key", async ({ page }) => {
      const posthog: string[] = [];
      page.on("request", (request) => {
        if (isPosthog(request)) {
          posthog.push(request.url());
        }
      });
      const log = journal(page);
      await launchApp(page, { mode, path: "/ru/listing/100001" });
      await expect(html(page)).toHaveAttribute("data-session", "ready");
      await expect(page.locator('[data-listing-state="loaded"]').first()).toBeVisible();

      await page.locator('button[data-cta-action="call"]').filter({ visible: true }).first().click();
      await expect.poll(() => log.events().find((event) => event.name === "contact_call")?.props).toMatchObject({ listing_id: 100001 });
      expect(["tel", "browser"]).toContain(log.events().find((event) => event.name === "contact_call")?.props.via);

      await page.waitForLoadState("networkidle");
      expect(posthog).toEqual([]);
    });
  });
}

test.describe("journal", { annotation: [{ type: "screen", description: "SCR-006" }] }, () => {
  test("outside Telegram nothing is sent", async ({ page }) => {
    const log = journal(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/ru\/outside$/);
    await page.waitForLoadState("networkidle");

    expect(log.requests).toEqual([]);
  });

  test("a journal failure changes nothing on screen and starts no new sign-in", async ({ page }) => {
    await page.route((url) => url.pathname === "/bff/events", (route) => route.fulfill({ status: 401, body: "" }));
    const sessions: Request[] = [];
    page.on("request", (request) => {
      if (isSession(request) && request.method() === "POST") {
        sessions.push(request);
      }
    });
    const app: LaunchedApp = await launchApp(page, { path: "/" });
    await expect(html(page)).toHaveAttribute("data-session", "ready");
    await expect(page.locator("article[data-listing]").first()).toBeVisible();
    const signIns = sessions.length;
    await page.waitForLoadState("networkidle");

    expect(sessions).toHaveLength(signIns);
    await expect(html(page)).toHaveAttribute("data-session", "ready");
    expect(app).toBeTruthy();
  });
});
