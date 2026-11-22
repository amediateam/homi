import { expect, launchApp, type LaunchedApp, projectSessionMode, setScenario, shownText, stubMedia, test } from "@homi/testing/playwright";
import type { Locator, Page, Request } from "@playwright/test";

import { LISTING } from "../support/pages";

/**
 * Journey 7 of WP-33: the listing source goes down in the middle of a session (the reserved stub scenario
 * `source_unavailable`, which fails every stub method, the sign-in, `/me` and the journal included). The scenario is
 * therefore set only once the session is ready and the feed shows its cards, and cleared before each «Повторить».
 *
 * - The quick rooms sheet keeps the count label of its last answer when the next count fails, and the search it
 *   applies under the failure shows «Не загрузилось» with «Повторить» instead of the cards (in cookie mode the
 *   server's page one failed, in header mode the browser's); the retry shows the cards.
 * - The map shows its error pill with «Повторить»; the retry draws the stub's four stacks of eleven, on whichever
 *   engine the browser gets (`map.spec.ts` and the state table disagree on headless Chromium; the markers and the
 *   pill are the same on both).
 * - A listing opened from the feed shows «Не загрузилось»; «Повторить» reads it once and shows it. Its heart, tapped
 *   under the failure, flips and flips back, with one error haptic and «Не получилось сохранить» (`dev016…` is on by
 *   default since DEC-58, so the toast shows with the haptic), and the card below shows the same heart; the next tap
 *   without the failure keeps its state.
 *
 * The suite runs every test in cookie mode and in header mode (projects `miniapp-cookie` and `miniapp-header`). Stubs
 * store nothing, so the checks are what the interface does. Each test launches once; the photos are answered by
 * `stubMedia`. Selectors as in `feed.spec.ts`, `filters.spec.ts`, `map.spec.ts` and `listing-open.spec.ts`.
 */

interface Fake {
  emit(eventType: string): void;
}

/** The text under «Не загрузилось» on the feed and the listing (`error.serverText`). */
const SERVER_TEXT = "Сервер не ответил. Попробуйте ещё раз через минуту.";
/** The default search's map answer on the fitted screen: four addresses with eleven listings each (`map.spec.ts`). */
const STACKS = 4;
const STACK_SIZE = 11;

/** The visible copy only: with `cacheComponents` the router keeps earlier routes hidden in `<Activity>`. */
const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const html = (page: Page) => page.locator("html");
const cards = (page: Page) => visible(page, "article[data-listing]");
const card = (page: Page, number: number) => visible(page, `article[data-listing="${number}"]`);
const chip = (page: Page, key: string) => visible(page, `[data-topbar="search-list"] [data-chip="${key}"]`);
const feedError = (page: Page) => visible(page, '[data-feed="feed"] [data-slot="error-state"]');
/** The intercepted copy of a sheet address, inside its bottom sheet. */
const sheet = (page: Page, name: string) => visible(page, `[data-slot="bottom-sheet"] [data-route="${name}"][data-layer="sheet"]`);
/** «Показать …» of the open quick sheet (outside its `data-route` content). */
const apply = (page: Page) => visible(page, '[data-slot="bottom-sheet"] [data-action="apply"]');
const roomButton = (scope: Locator, label: string) => scope.getByRole("button", { name: label, exact: true });
const pill = (page: Page) => visible(page, "[data-map-status]");
const stacks = (page: Page) => visible(page, '[data-marker="stack"]');
/** The listing layer of `number` (each layer carries its own number, also a hidden one). */
const layer = (page: Page, number: number) => visible(page, `[data-route="listing"][data-listing-number="${number}"]`);
// A layer may hold a kept copy of its screen beside the shown one: the visible element in each lookup.
const stateOf = (page: Page, number: number) => layer(page, number).locator("[data-listing-state]").filter({ visible: true }).first();
const appToast = (page: Page) => visible(page, '[data-toast-host="app"] [data-toast]');
const press = (page: Page, eventType: "backButtonClicked") =>
  page.evaluate((type) => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit(type), eventType);
/** The search keys of the current address. */
const searchOf = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams);

const isCount = (url: URL) => url.pathname === "/bff/listings/count";
const hasRooms = (url: URL, min: string, max: string) => url.searchParams.get("rooms_min") === min && url.searchParams.get("rooms_max") === max;
/** The feed's page one through `/bff`: `/bff/listings` without a cursor. */
const isPageOne = (url: URL) => url.pathname === "/bff/listings" && !url.searchParams.has("cursor");
/** The map's points: `GET /listings/map` through `/bff`. */
const isMapRead = (url: URL) => url.pathname === "/bff/listings/map";
/** The listing's read through `/bff` (header mode, and cookie mode on «Повторить»). */
const isListingRead = (number: number) => (url: URL) => url.pathname === `/bff/listings/${number}`;
/** A Server Action call: a POST to the page's address carrying the `Next-Action` header. */
const isServerAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;
/** The heart's save of `number` to `on` (`setFavorite`; the body as `feed.spec.ts` checks it). */
const isFavSave = (request: Request, number: number, on: boolean) =>
  isServerAction(request) && (request.postData() ?? "").includes(`{"number":${number},"on":${on}}`);

/** The label of the apply button for a count answer: «Показать {n}», or «Ничего нет» for zero (`filters.spec.ts`). */
const applyLabel = (count: number) => (count > 0 ? `Показать ${count}` : "Ничего нет");

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

/** Collects the statuses of the answers that `match` from now on, in their order. */
function recordStatuses(page: Page, match: (url: URL) => boolean): number[] {
  const seen: number[] = [];
  page.on("response", (response) => {
    if (match(new URL(response.url()))) {
      seen.push(response.status());
    }
  });
  return seen;
}

/** Two animation frames: whatever an answer set off has rendered by then. */
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

/** Light and medium impacts the page asked the fake Telegram for so far (TMA-025). */
async function impacts(app: LaunchedApp, style: "light" | "medium"): Promise<number> {
  return (await app.calls()).filter((call) => call.member === "HapticFeedback.impactOccurred" && call.args[0] === style).length;
}

/** Error notifications the page asked the fake Telegram for so far (TMA-025). */
async function errorHaptics(app: LaunchedApp): Promise<number> {
  return (await app.calls()).filter((call) => call.member === "HapticFeedback.notificationOccurred" && call.args[0] === "error").length;
}

interface PressedWatch {
  observer: MutationObserver;
  /** The value before each change, one per mutation record. */
  old: string[];
}

/**
 * Records every value `aria-pressed` of `button` takes from now on, without holding the save: a mutation observer
 * keeps one record per change, so the flip of a tap and the flip back of its failed save both count even when one
 * callback delivers them together. A change's new value is the next change's old value, the last one's the current
 * attribute; the reader also takes the records not delivered yet.
 */
async function watchPressed(button: Locator): Promise<() => Promise<string[]>> {
  await button.evaluate((node) => {
    const old: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        old.push(record.oldValue ?? "");
      }
    });
    observer.observe(node, { attributes: true, attributeFilter: ["aria-pressed"], attributeOldValue: true });
    const watch: PressedWatch = { observer, old };
    Object.assign(node, { __e2ePressed: watch });
  });
  return () =>
    button.evaluate((node) => {
      const watch = (node as unknown as { __e2ePressed?: PressedWatch }).__e2ePressed;
      if (watch === undefined) {
        return [];
      }
      for (const record of watch.observer.takeRecords()) {
        watch.old.push(record.oldValue ?? "");
      }
      return watch.old.length === 0 ? [] : [...watch.old.slice(1), node.getAttribute("aria-pressed") ?? ""];
    });
}

/** Launches the app on the feed as the bot does, in the project's mode, and waits for the session and the cards. */
async function openFeed(page: Page): Promise<LaunchedApp> {
  const app = await launchApp(page);
  await expect(html(page)).toHaveAttribute("data-session", "ready");
  await expect(cards(page).first()).toBeVisible();
  return app;
}

test.describe(
  "source unavailable @journey",
  {
    annotation: [
      { type: "screen", description: "SCR-007" },
      { type: "screen", description: "SCR-008" },
      { type: "screen", description: "SCR-011" },
      { type: "screen", description: "SCR-015" },
      { type: "screen", description: "SCR-018" },
      { type: "screen", description: "SCR-019" },
      { type: "screen", description: "SCR-042" },
    ],
  },
  () => {
    test.beforeEach(async ({ page }) => {
      await stubMedia(page);
    });

    test("the rooms sheet keeps its last count; the search applied under the failure shows «Не загрузилось», «Повторить» shows it", async ({ page }) => {
      await openFeed(page);

      const firstCount = page.waitForResponse((response) => isCount(new URL(response.url())) && response.ok());
      await chip(page, "rooms").click();
      const rooms = sheet(page, "filters/rooms");
      await expect(rooms).toBeVisible();
      const label = applyLabel(((await (await firstCount).json()) as { data: { count: number } }).data.count);
      await expect.poll(() => shownText(apply(page))).toBe(label);

      // The next count fails (`503 source_unavailable` through the pass-through); the label keeps the last answer's.
      await setScenario(page, "source_unavailable");
      const refused = page.waitForResponse((response) => isCount(new URL(response.url())) && hasRooms(new URL(response.url()), "2", "2"));
      await roomButton(rooms, "2").click();
      await expect(roomButton(rooms, "2")).toHaveAttribute("aria-pressed", "true");
      const refusal = await refused;
      expect(refusal.status()).toBe(503);
      // The whole answer has reached the page and been handled before the label is read again.
      await refusal.finished();
      await nextFrames(page);
      expect(await shownText(apply(page))).toBe(label);

      // The applied search's page one fails as well: in cookie mode on the server, in header mode through `/bff`.
      const pageOnes = recordStatuses(page, isPageOne);
      await apply(page).click();
      await expect.poll(() => ({ pathname: new URL(page.url()).pathname, search: searchOf(page) })).toEqual({
        pathname: "/ru",
        search: { city: "tashkent", rooms_min: "2", rooms_max: "2" },
      });
      await expect(visible(page, "[data-layer]")).toHaveCount(0);
      await expect(chip(page, "rooms")).toHaveAttribute("data-state", "on");
      const state = feedError(page);
      await expect(state).toHaveAttribute("data-kind", "server");
      await expect(state.locator('[data-slot="error-state-title"]')).toHaveText("Не загрузилось");
      await expect(state.locator('[data-slot="error-state-text"]')).toHaveText(SERVER_TEXT);
      await expect(state.getByRole("button")).toHaveText("Повторить");
      await expect(cards(page)).toHaveCount(0);
      const header = projectSessionMode(test.info()) === "header";
      await expect.poll(() => [...pageOnes]).toEqual(header ? [503] : []);

      // The source is back: «Повторить» asks the browser for page one and shows the cards.
      await setScenario(page, null);
      await state.getByRole("button", { name: "Повторить" }).click();
      await expect(cards(page).first()).toBeVisible();
      await expect(feedError(page)).toHaveCount(0);
      await expect.poll(() => [...pageOnes]).toEqual(header ? [503, 200] : [200]);
      await expect(html(page)).toHaveAttribute("data-session", "ready");
    });

    test("the map shows «Не загрузилось» with «Повторить» over an empty map; the retry draws the points", async ({ page }) => {
      await openFeed(page);

      await setScenario(page, "source_unavailable");
      const refused = page.waitForResponse((response) => isMapRead(new URL(response.url())));
      await expect(visible(page, "[data-view-toggle]")).toHaveText("Карта");
      await visible(page, "[data-view-toggle]").click();
      await expect(page).toHaveURL(/\/ru\/map\?/);
      await expect(visible(page, "[data-map-screen]")).toBeVisible();
      expect((await refused).status()).toBe(503);

      // The first map of a page loads its library: slow on a loaded machine.
      await expect(pill(page)).toHaveAttribute("data-map-status", "error", { timeout: 15_000 });
      await expect(pill(page)).toHaveAttribute("data-error", "source_unavailable");
      await expect(pill(page)).toContainText("Не загрузилось");
      await expect(visible(page, "[data-marker]")).toHaveCount(0);

      await setScenario(page, null);
      const read = page.waitForResponse((response) => isMapRead(new URL(response.url())));
      await pill(page).getByRole("button", { name: "Повторить" }).click();
      expect((await read).status()).toBe(200);
      await expect(stacks(page)).toHaveCount(STACKS, { timeout: 15_000 });
      await expect(visible(page, `[data-marker="stack"][data-count="${STACK_SIZE}"]`)).toHaveCount(STACKS);
      await expect(pill(page)).toHaveCount(0);
    });

    test("a listing shows «Не загрузилось» and «Повторить» shows it; its heart under the failure flips back with the error haptic", async ({ page }) => {
      const app = await openFeed(page);
      // On page one and not the user's own (an own listing has no heart); its card's `favorite` is false.
      const number = LISTING;

      await setScenario(page, "source_unavailable");
      await card(page, number).locator("a").click();
      await expect(stateOf(page, number)).toHaveAttribute("data-listing-state", "server");
      const failure = layer(page, number).locator('[data-slot="error-state"]').filter({ visible: true }).first();
      await expect(failure).toHaveAttribute("data-kind", "server");
      await expect(failure.locator('[data-slot="error-state-title"]')).toHaveText("Не загрузилось");
      await expect(failure.locator('[data-slot="error-state-text"]')).toHaveText(SERVER_TEXT);
      await expect(layer(page, number).locator("[data-hero], [data-cta]")).toHaveCount(0);

      await setScenario(page, null);
      const reads = recordRequests(page, (request) => isListingRead(number)(new URL(request.url())));
      await failure.getByRole("button", { name: "Повторить" }).click();
      await expect(stateOf(page, number)).toHaveAttribute("data-listing-state", "loaded");
      await expect(layer(page, number).locator('[data-section="author"]').filter({ visible: true }).first()).toBeVisible();
      expect(reads).toHaveLength(1);

      // A save under the failure (`503 source_unavailable` of the stub's PUT): the heart flips at the tap and back once
      // the Server Action answers, with the error haptic and the toast. Its `favorite` is false: each tap adds, with the
      // medium impact.
      const before = "false";
      const flipped = "true";
      const heart = layer(page, number).locator('[data-fav="plain"]').filter({ visible: true }).first();
      await expect(heart).toBeVisible();
      await expect(heart).toHaveAttribute("aria-pressed", before);
      const pressed = await watchPressed(heart);
      const errorsBefore = await errorHaptics(app);
      await setScenario(page, "source_unavailable");
      const answered = page.waitForResponse((response) => isFavSave(response.request(), number, true));
      await heart.click();
      await answered;
      await expect(heart).toHaveAttribute("aria-pressed", before);
      await expect(appToast(page)).toHaveText("Не получилось сохранить");
      await expect.poll(() => errorHaptics(app)).toBe(errorsBefore + 1);
      expect(await pressed()).toEqual([flipped, before]);

      // The source is back: the next tap keeps its state. The answer's headers come before the client has handled
      // it, so the whole body is awaited and the history read after it has rendered.
      await setScenario(page, null);
      const impactsBefore = await impacts(app, "medium");
      const saved = page.waitForResponse((response) => isFavSave(response.request(), number, true));
      await heart.click();
      const answer = await saved;
      await answer.finished();
      await nextFrames(page);
      expect(await pressed()).toEqual([flipped, before, flipped]);
      expect(await impacts(app, "medium")).toBe(impactsBefore + 1);

      // Back on the feed, the card's heart shows the same state; by then a rollback of the second save would have
      // shown, so no second error haptic means it kept its state.
      await press(page, "backButtonClicked");
      await expect(visible(page, '[data-route="listing"]')).toHaveCount(0);
      await expect(card(page, number).locator("[data-fav]")).toHaveAttribute("aria-pressed", flipped);
      expect(await errorHaptics(app)).toBe(errorsBefore + 1);
    });
  },
);
