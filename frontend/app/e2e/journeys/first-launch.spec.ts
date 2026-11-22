import { expect, launchApp, projectSessionMode, setScenario, stubMedia, test } from "@homi/testing/playwright";
import type { Page, Request } from "@playwright/test";

/**
 * Journey 1 of WP-33: the first launch of a Telegram user whose language is Uzbek, through both gates of WP-23
 * (SCR-004, SCR-005) into the feed (SCR-006, SCR-007), against the API on stubs. The launch reads the stub user of the
 * `first_launch` scenario (WP-11: `locale` `ru`, `locale_chosen` and `city_chosen` false). The scenario is kept on
 * purpose for the whole test (each test has its own browser context, so nothing is cleared): the picks do not re-read
 * `me`, they patch this launch's copy (`patchMe`) and set the gate memory (`gateState.localePicked`, `cityPicked`), and
 * every address change re-runs `resolveGate` with both without reaching `/welcome/`.
 *
 * The language page greets in the Telegram language (the full mapping, D-S-5) with the two other phrases below and
 * Oʻzbekcha first; «English» saves the locale through one `updateSettings` Server Action and the gate moves the
 * address to `/en/welcome/city` in the same document; a city saves through one more action and lands on its feed with
 * BackButton hidden. A tour of three tabs afterwards proves that the gates do not come back in this launch: each
 * address change runs `resolveGate` again. The `PATCH /settings` bodies are sent by the app server and are the unit
 * tests' of `updateSettings`; here only the action requests the browser sends are counted. Every stub photo of the
 * feed and the saved tab is answered by `stubMedia`.
 */

interface Fake {
  webApp: { BackButton: { isVisible: boolean } };
  emit(eventType: string): void;
}

/** The gate marks of a `me` the app read through `GET /bff/session`. */
interface GateMarks {
  locale?: unknown;
  locale_chosen?: unknown;
  city_chosen?: unknown;
}

/** The visible copy only: `cacheComponents` keeps earlier routes in the document, hidden (`preserving-ui-state.md`). */
const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const route = (page: Page, name: string) => visible(page, `[data-route="${name}"]`);
const html = (page: Page) => page.locator("html");
/** The city chip of the feed's top bar (WP-24): the city of the feed's search. */
const cityChip = (page: Page) => visible(page, '[data-topbar="search-list"] [data-chip="city"]');
const tab = (page: Page, key: "search" | "saved" | "radars" | "settings") => visible(page, `[data-tab="${key}"]`);
const backVisible = (page: Page) =>
  page.evaluate(() => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.webApp.BackButton.isVisible);

/** A Server Action call: a POST to the page's address carrying the `Next-Action` header. */
const isServerAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;

/** A document load of the page's main frame; a soft navigation of the router sends none. */
function isDocumentOf(page: Page): (request: Request) => boolean {
  return (request) => {
    try {
      return request.isNavigationRequest() && request.frame() === page.mainFrame();
    } catch {
      return false;
    }
  };
}

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

/** The `me` of every session read (`GET /bff/session` answered with a session) from now on. */
function recordSessionUsers(page: Page): Promise<GateMarks | null>[] {
  const reads: Promise<GateMarks | null>[] = [];
  page.on("response", (response) => {
    const request = response.request();
    if (request.method() !== "GET" || new URL(request.url()).pathname !== "/bff/session" || response.status() !== 200) {
      return;
    }
    reads.push(
      response
        .json()
        .then((body: { me?: unknown }) => (typeof body.me === "object" && body.me !== null ? (body.me as GateMarks) : null))
        .catch(() => null),
    );
  });
  return reads;
}

/** Every address the main frame showed from now on, soft navigations included. */
function recordAddresses(page: Page): string[] {
  const seen: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      seen.push(frame.url());
    }
  });
  return seen;
}

/** A mark on the window: gone after a document load, kept by every soft navigation. */
const markWindow = (page: Page) => page.evaluate(() => Object.assign(window, { __homiNoReload: true }));
const stillMarked = (page: Page) => page.evaluate(() => "__homiNoReload" in window);

/** No gate page is on screen. */
async function expectNoGate(page: Page): Promise<void> {
  await expect(route(page, "welcome/language")).toHaveCount(0);
  await expect(route(page, "welcome/city")).toHaveCount(0);
}

test.describe(
  "first launch @journey",
  {
    annotation: [
      { type: "screen", description: "SCR-004" },
      { type: "screen", description: "SCR-005" },
      { type: "screen", description: "SCR-006" },
      { type: "screen", description: "SCR-007" },
    ],
  },
  () => {
    test("Telegram in uz: the language page greets in Uzbek, «English» moves to /en without a reload, a city opens its feed, and the gates stay away", async ({ page }) => {
      const mode = projectSessionMode(test.info());
      await stubMedia(page);
      const actions = recordRequests(page, isServerAction);
      const users = recordSessionUsers(page);
      await setScenario(page, "first_launch");
      await launchApp(page, { locale: "uz" });

      // SCR-004 in the user's saved locale (`me.locale` ru), greeting in the Telegram language. Before sign-in the
      // address may pass `/uz` first (LocaleGuard, BR-APP-050); that move races the sign-in here, and `launch.spec.ts`
      // proves it with the sign-in held.
      const picker = route(page, "welcome/language");
      await expect(picker).toBeVisible();
      await expect(page).toHaveURL(/\/ru\/welcome\/language$/);
      const heading = picker.getByRole("heading", { level: 1 });
      await expect(heading).toHaveText("Tilni tanlang");
      await expect(heading).toHaveAttribute("lang", "uz");
      await expect(picker.locator('[data-slot="subtitle"]')).toHaveText("Выберите язык · Choose a language");
      const buttons = picker.locator("[data-locale]");
      await expect(buttons).toHaveText(["Oʻzbekcha", "Русский", "English"]);
      await expect(buttons.first()).toHaveAttribute("data-variant", "primary");
      await expect(buttons.nth(2)).toHaveAttribute("data-variant", "secondary");
      expect(await backVisible(page)).toBe(false);
      expect(actions).toEqual([]);

      // The launch read `me` with both marks "not chosen" (the `first_launch` fixture).
      const read = (await Promise.all(users)).filter((me): me is GateMarks => me !== null);
      expect(read.length).toBeGreaterThan(0);
      for (const me of read) {
        expect(me).toMatchObject({ locale: "ru", locale_chosen: false, city_chosen: false });
      }

      await markWindow(page);
      const documents = recordRequests(page, isDocumentOf(page));

      await picker.locator('[data-locale="en"]').click();

      // One Server Action with the pick, then SCR-005 in the chosen locale, in the same document.
      const city = route(page, "welcome/city");
      await expect(page).toHaveURL(/\/en\/welcome\/city$/);
      await expect(html(page)).toHaveAttribute("lang", "en");
      await expect(city.getByRole("heading", { level: 1 })).toHaveText("Where are you looking?");
      expect(actions).toHaveLength(1);
      expect(actions[0].postData() ?? "").toContain('{"locale":"en"}');
      // Header mode has no session cookie: the action's arguments carry the token kept in memory (`useAction`).
      expect((actions[0].postData() ?? "").includes('"token"')).toBe(mode === "header");
      expect(await stillMarked(page)).toBe(true);
      expect(await backVisible(page)).toBe(false);

      // Not the default city (`tashkent`), so the feed's address and chip can only come from the pick.
      const andijan = city.locator('[data-city="andijan"]');
      await expect(andijan).toContainText("Andijan");
      await expect(andijan).toContainText("210 to rent · 430 to buy");
      await andijan.click();

      // One more Server Action, then the feed of the picked city (row 7), still the same document, BackButton hidden.
      await expect(page).toHaveURL(/\/en\?city=andijan$/);
      await expect(route(page, "feed")).toBeVisible();
      await expect(cityChip(page)).toHaveText("Andijan");
      // The stub catalogue's one long-term apartment in Andijan.
      await expect(visible(page, 'article[data-listing="100017"]')).toBeVisible();
      await expect(visible(page, "[data-tabbar] [data-tab]")).toHaveText(["Search", "Saved", "Radar", "Settings"]);
      await expect.poll(() => actions.length).toBe(2);
      expect(actions[1].postData() ?? "").toContain('{"city":"andijan"}');
      expect((actions[1].postData() ?? "").includes('"token"')).toBe(mode === "header");
      expect(await backVisible(page)).toBe(false);
      await expectNoGate(page);
      expect(await stillMarked(page)).toBe(true);

      // The scenario stays set: each address change below re-runs `resolveGate` with the patched `me` and the gate
      // memory, and none of them reaches a gate.
      const addresses = recordAddresses(page);

      await tab(page, "saved").click();
      await expect(page).toHaveURL(/\/en\/saved$/);
      await expect(route(page, "saved")).toBeVisible();
      await expectNoGate(page);

      await tab(page, "settings").click();
      await expect(page).toHaveURL(/\/en\/settings$/);
      await expect(route(page, "settings")).toBeVisible();
      await expectNoGate(page);

      await tab(page, "search").click();
      await expect(page).toHaveURL(/\/en\?city=andijan$/);
      await expect(route(page, "feed")).toBeVisible();
      await expect(cityChip(page)).toHaveText("Andijan");
      // A settled feed before the last look at the addresses: a gate redirect would follow the route's commit.
      await expect(visible(page, 'article[data-listing="100017"]')).toBeVisible();
      await expectNoGate(page);
      expect(await backVisible(page)).toBe(false);
      await expect(page).toHaveURL(/\/en\?city=andijan$/);

      expect(addresses.length).toBeGreaterThan(0);
      expect(addresses.filter((address) => new URL(address).pathname.includes("/welcome/"))).toEqual([]);
      // One action per pick over the whole journey, and not a single document load since the language page.
      expect(actions).toHaveLength(2);
      expect(documents.map((request) => request.url())).toEqual([]);
      expect(await stillMarked(page)).toBe(true);
      // Every session read of the launch answered "not chosen", so only the gate memory and the patches let the user
      // through. Today the launch read is the only one (`refresh()` re-reads `me` for the owner cabinet only).
      for (const me of (await Promise.all(users)).filter((me): me is GateMarks => me !== null)) {
        expect(me).toMatchObject({ locale_chosen: false, city_chosen: false });
      }
    });
  },
);
