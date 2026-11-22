import { defaultFilters, toSearchParams } from "@homi/search";
import { expect, launchApp, type LaunchedApp, setScenario, stubMedia, test as base } from "@homi/testing/playwright";
import type { Locator, Page, Request } from "@playwright/test";

/**
 * The radar card in the search list of WP-30 (SCR-047, BR-APP-072) against the API on stubs with radars switched on,
 * in cookie and header mode: on the default feed (45 listings, pages of 20) it stands after the 8th card, with the
 * rent title and «Настроить радар», which opens «Новый радар» with the search and `entry=feed`; a fixture radar of the
 * same base deal and city keeps it away; the scenario `few` with custom filters (5 cards, no few-results note) puts it
 * after the 5th card with «Включить радар», which turns a radar on through a Server Action with `entry: "feed"`; a
 * short custom sale list shows it after its last card with the sale title; × hides it at once and on the next search
 * and launch, for 7 days, without counting towards the nudges' close streak.
 *
 * The fixture radars of WP-13 cover every Tashkent default search (the same base deal and city), so the cases that
 * want the card on a default search answer the radar list (`/bff/radars`, read in the browser in both modes) with an
 * empty one. `homi-nudge` is seeded with the nudges silenced (`quietUntil` far ahead), which keeps the follow nudge out
 * of the way and shows that their silence does not apply to the card. `feed_radar_shown` fires once 60 % of the card
 * is in view; the card is scrolled there, but `track()` keeps the journal events in module memory only (until WP-32),
 * so the event itself is not observable here. Every photo is answered by `stubMedia`.
 */

const test = base.extend<{ photos: readonly string[] }>({
  /** The stub photos answered so far: every test answers them itself, as CI has no `cdn.homi.loc`. */
  photos: [async ({ page }, use) => use(await stubMedia(page)), { auto: true }],
});

type Mode = "cookie" | "header";

interface NudgeState {
  asked: string[];
  closed: number;
  quietUntil: number;
  lastShown: number;
  back: Record<string, number>;
  feedOff: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** The nudges' silence, far ahead (a year): no follow nudge or return banner during these tests. */
const QUIET = { quietUntil: Date.now() + 365 * DAY_MS };
/**
 * The bound of a wait on the stub API: locally it is one `php -S` process that parallel runs share, so a sign-in, a
 * server render or a Server Action can take seconds.
 */
const API_MS = 20_000;

test.describe.configure({ timeout: 120_000 });

/**
 * The visible copy only: with `cacheComponents` the router keeps earlier routes hidden in `<Activity>`
 * (`preserving-ui-state.md`), so the same element can be in the document twice.
 */
const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const html = (page: Page) => page.locator("html");
const cards = (page: Page) => visible(page, "article[data-listing]");
const list = (page: Page) => visible(page, '[data-feed="feed"]');
const radarCard = (page: Page) => list(page).locator('[data-slot="feed-radar"]');
const chip = (page: Page, key: string) => visible(page, `[data-topbar="search-list"] [data-chip="${key}"]`);
const sheet = (page: Page, name: string) => visible(page, `[data-slot="bottom-sheet"] [data-route="${name}"][data-layer="sheet"]`);
const applyButton = (page: Page) => visible(page, '[data-slot="bottom-sheet"] [data-action="apply"]');
const roomButton = (scope: Locator, label: string) => scope.getByRole("button", { name: label, exact: true });
const appToast = (page: Page) => visible(page, '[data-toast-host="app"] [data-toast]');
/** The search keys of the current address. */
const searchOf = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams);

const isRadarList = (url: URL) => url.pathname === "/bff/radars";
/** A Server Action call: a POST to the page's address carrying the `Next-Action` header. */
const isServerAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;

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

/** Medium impacts the page asked the fake Telegram for so far (TMA-025). */
async function impacts(app: LaunchedApp, style: "light" | "medium"): Promise<number> {
  return (await app.calls()).filter((call) => call.member === "HapticFeedback.impactOccurred" && call.args[0] === style).length;
}

/** Writes `homi-nudge` before the app's first script, once per tab (a reload keeps what the app stored). */
async function seedNudge(page: Page, state: Partial<NudgeState>): Promise<void> {
  const value = JSON.stringify({ asked: [], closed: 0, quietUntil: 0, lastShown: 0, back: {}, feedOff: 0, ...state });
  await page.addInitScript((raw) => {
    try {
      if (sessionStorage.getItem("e2e-seeded-nudge") === null) {
        sessionStorage.setItem("e2e-seeded-nudge", "1");
        localStorage.setItem("homi-nudge", raw);
      }
    } catch {
      // about:blank has no storage.
    }
  }, value);
}

const readNudge = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("homi-nudge") ?? "null") as NudgeState | null);

/**
 * No radar for any search: the radar list answers `[]` in the API's envelope (a bare array would read as a failed
 * read, and the card waits for a loaded list). Registered before the launch, so the first read is answered.
 */
const noRadars = (page: Page) =>
  page.route(
    (url) => isRadarList(url),
    (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: [], meta: { source: "stub" } }) }),
  );

/** Launches the app as the bot does, in a session mode, and waits for the session and the first cards. */
async function open(page: Page, mode: Mode, path = "/"): Promise<LaunchedApp> {
  const app = await launchApp(page, { mode, path });
  await expect(html(page)).toHaveAttribute("data-session", "ready", { timeout: API_MS });
  await expect(cards(page).first()).toBeVisible({ timeout: API_MS });
  return app;
}

/** How many listing cards stand before the radar card in the list. */
const cardsBefore = (card: Locator) =>
  card.evaluate((node) => {
    let count = 0;
    for (let sibling = node.previousElementSibling; sibling !== null; sibling = sibling.previousElementSibling) {
      if (sibling.matches("article[data-listing]")) {
        count += 1;
      }
    }
    return count;
  });

/** Scrolls the card fully into view (`feed_radar_shown` wants 60 % of it). */
async function bringIntoView(card: Locator): Promise<void> {
  await card.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await expect(card).toBeInViewport({ ratio: 1 });
}

/**
 * Waits for the address an apply lands on. `closeThen` steps back first, so the page below shows its old address
 * for a moment before the replace.
 */
const landed = (page: Page, search: Record<string, string>) =>
  expect
    .poll(() => ({ pathname: new URL(page.url()).pathname, search: searchOf(page) }), { timeout: API_MS })
    .toEqual({ pathname: "/ru", search });

for (const mode of ["cookie", "header"] as const) {
  test.describe(`radar card in the search list (${mode} mode)`, { annotation: [{ type: "screen", description: "SCR-047" }] }, () => {
    test("default feed without a radar: after the 8th card, the rent title, «Настроить радар» → «Новый радар» with entry=feed", { annotation: [{ type: "screen", description: "SCR-030" }] }, async ({ page }) => {
      // One close in a row before: the card's button starts the nudges' streak again.
      await seedNudge(page, { ...QUIET, closed: 1 });
      await noRadars(page);
      const app = await open(page, mode);

      await expect(radarCard(page)).toHaveCount(1, { timeout: API_MS });
      expect(await cardsBefore(radarCard(page))).toBe(8);
      await expect(cards(page)).toHaveCount(20, { timeout: API_MS });
      await bringIntoView(radarCard(page));
      await expect(radarCard(page).locator("b")).toHaveText("Хорошие квартиры снимают в первые часы");
      await expect(radarCard(page)).toContainText("Включите радар — новые по этому поиску придут в Telegram сразу, как появятся.");
      await expect(radarCard(page).locator('[data-action="close"]')).toHaveAccessibleName("Закрыть");
      const button = radarCard(page).locator('[data-action="enable"]');
      await expect(button).toHaveText("Настроить радар");

      const medium = await impacts(app, "medium");
      await button.click();
      expect(await impacts(app, "medium")).toBe(medium + 1);
      await expect(page).toHaveURL(/\/ru\/radars\/new\?/, { timeout: API_MS });
      expect(searchOf(page)).toEqual({ city: "tashkent", entry: "feed" });
      await expect(page.getByRole("dialog", { name: "Новый радар" })).toBeVisible({ timeout: API_MS });
      await expect(visible(page, '[data-route="radars/new"]')).toBeVisible();
      await expect(visible(page, '[data-slot="bottom-sheet"] [data-action="subscribe"]')).toHaveText("Включить радар");
      expect((await readNudge(page))?.closed).toBe(0);
    });

    test("a fixture radar of the same base deal and city covers the default search: no card", async ({ page }) => {
      await seedNudge(page, QUIET);
      const listed = page.waitForResponse((response) => isRadarList(new URL(response.url())) && response.ok());
      await open(page, mode);

      const radars = ((await (await listed).json()) as { data: { id: string }[] }).data;
      expect(radars.length).toBeGreaterThan(0);
      await expect(cards(page)).toHaveCount(20, { timeout: API_MS });
      await cards(page).nth(8).scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await expect(page.locator('[data-slot="feed-radar"]')).toHaveCount(0);
    });

    test("the scenario few with custom filters: after the 5th card, «Включить радар» turns a radar on with entry feed", { annotation: [{ type: "screen", description: "SCR-042" }] }, async ({ page }) => {
      await seedNudge(page, QUIET);
      await setScenario(page, "few");
      const app = await open(page, mode, "/?rooms_min=2&rooms_max=2");

      await expect(radarCard(page)).toHaveCount(1, { timeout: API_MS });
      await expect(cards(page)).toHaveCount(5, { timeout: API_MS });
      expect(await cardsBefore(radarCard(page))).toBe(5);
      // Custom filters show no few-results note, so the slot follows the last card of the complete list.
      await expect(visible(page, '[data-feed="feed"] [data-slot="few-note"]')).toHaveCount(0);
      await bringIntoView(radarCard(page));
      await expect(radarCard(page).locator("b")).toHaveText("Хорошие квартиры снимают в первые часы");
      const button = radarCard(page).locator('[data-action="enable"]');
      await expect(button).toHaveText("Включить радар");

      const actions = recordRequests(page, isServerAction);
      const medium = await impacts(app, "medium");
      await button.click();
      expect(await impacts(app, "medium")).toBe(medium + 1);
      // The create of `few` answers with options: the few toast of the subscribe flow, with «Расширить».
      await expect(appToast(page)).toContainText("Радар включён, но таких объявлений мало. до $700: ≈5 в день", { timeout: API_MS });
      await expect(appToast(page).getByRole("button", { name: "Расширить" })).toBeVisible();
      expect(new URL(page.url()).pathname).toBe("/ru");
      expect(actions).toHaveLength(1);
      const body = actions[0].postData() ?? "";
      expect(body).toContain('"entry":"feed"');
      expect(body).toContain('"rooms_min":2');
      await setScenario(page, null);
    });

    test("a short custom sale list: after its last card, the sale title and «Включить радар»", async ({ page }) => {
      await seedNudge(page, QUIET);
      const query = toSearchParams({ ...defaultFilters("sale", "tashkent"), types: ["apartment", "house"] });
      await open(page, mode, `/?${query.toString()}`);

      await expect(radarCard(page)).toHaveCount(1, { timeout: API_MS });
      const shown = await cards(page).count();
      expect(shown).toBeGreaterThan(0);
      expect(shown).toBeLessThanOrEqual(8);
      expect(await cardsBefore(radarCard(page))).toBe(shown);
      await bringIntoView(radarCard(page));
      await expect(radarCard(page).locator("b")).toHaveText("Выгодные квартиры продают быстро");
      await expect(radarCard(page).locator('[data-action="enable"]')).toHaveText("Включить радар");
    });

    test("× hides it at once, on the next search and after a reload, for 7 days; the nudges' close streak is unchanged", async ({ page }) => {
      await seedNudge(page, { ...QUIET, closed: 1 });
      await noRadars(page);
      await open(page, mode);

      await expect(radarCard(page)).toHaveCount(1, { timeout: API_MS });
      await bringIntoView(radarCard(page));
      const before = Date.now();
      await radarCard(page).locator('[data-action="close"]').click();
      await expect(page.locator('[data-slot="feed-radar"]')).toHaveCount(0);
      const after = Date.now();
      const snoozed = await readNudge(page);
      expect(snoozed?.feedOff).toBeGreaterThanOrEqual(before + 7 * DAY_MS - 1_000);
      expect(snoozed?.feedOff).toBeLessThanOrEqual(after + 7 * DAY_MS);
      expect(snoozed?.closed).toBe(1);
      expect(snoozed?.quietUntil).toBe(QUIET.quietUntil);

      // The next search: 2 rooms, custom filters with no radar, 33 listings — the slot after the 8th card stays empty.
      await chip(page, "rooms").click();
      const rooms = sheet(page, "filters/rooms");
      await expect(rooms).toBeVisible({ timeout: API_MS });
      await roomButton(rooms, "2").click();
      await expect(applyButton(page)).toBeEnabled({ timeout: API_MS });
      await applyButton(page).click();
      await landed(page, { city: "tashkent", rooms_min: "2", rooms_max: "2" });
      await expect(visible(page, "[data-layer]")).toHaveCount(0, { timeout: API_MS });
      await expect(chip(page, "rooms")).toHaveAttribute("data-state", "on");
      await expect(cards(page)).toHaveCount(20, { timeout: API_MS });
      await cards(page).nth(8).scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await expect(page.locator('[data-slot="feed-radar"]')).toHaveCount(0);

      // A relaunch: still away. Back to the top first: the browser restores the scroll on a reload, and from the 8th
      // card the restored list can ask for its second page at once (CI on the merge of `main`, 33 cards, not 20).
      await page.evaluate(() => window.scrollTo(0, 0));
      const listed = page.waitForResponse((response) => isRadarList(new URL(response.url())));
      await page.reload();
      await expect(html(page)).toHaveAttribute("data-session", "ready", { timeout: API_MS });
      await expect(cards(page)).toHaveCount(20, { timeout: API_MS });
      await listed;
      await page.waitForTimeout(500);
      await expect(page.locator('[data-slot="feed-radar"]')).toHaveCount(0);
      expect((await readNudge(page))?.feedOff).toBe(snoozed?.feedOff);
    });
  });
}
