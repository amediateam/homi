import { expect as baseExpect, launchApp, type LaunchAppOptions, type LaunchedApp, setScenario, stubMedia, test as base } from "@homi/testing/playwright";
import type { Locator, Page, Request, Route } from "@playwright/test";

/**
 * The subscribe flow of WP-30 (BR-APP-041, BR-APP-042, TMA-033) from the search tab against the API on stubs with
 * radars switched on, in cookie and header mode: the filters footer shows ✓ «Радар включён» for a search equal to the
 * active fixture radar and «Включить радар» for another draft; «Включить радар» re-reads the list and creates the radar
 * for the draft, closing the sheet with the created toast; the client finds an identical radar on the re-read (active:
 * «…уже включён» without a request; paused: switched on again, «Радар снова включён»); the scenario `existing` answers
 * «…уже включён»; the few-results note's «Включить радар по этому поиску» with the few toast and «Расширить»; the
 * scenarios `radar_limit` and `no_chat` with the chat-access flow — write access declined, granted, and a client
 * without the method. A failure keeps the filters sheet open with its toast inside it. The stub list never changes
 * after a write, so a stored radar is shown by answering `/bff/radars` (`page.route`), as the search tab reads it
 * through `/bff` in both modes; a scenario that would break the sign-in is set once the session is ready. The nudges are
 * silenced before every launch (`homi-nudge`). Every photo is answered by `stubMedia`; each test launches once, as the
 * full run shares one stub user's API limit (KI-32).
 */

/**
 * The local servers are shared with the other spec runs of the session, and the stub API answers one request at a
 * time, so a screen may wait several seconds for its answer: each check waits up to 20 s, each test 90 s.
 */
const expect = baseExpect.configure({ timeout: 20_000 });

const test = base.extend<{ photos: readonly string[] }>({
  /** The stub photos answered so far: every test answers them itself, as CI has no `cdn.homi.loc`. */
  photos: [async ({ page }, use) => use(await stubMedia(page)), { auto: true }],
});

test.describe.configure({ timeout: 90_000 });

type Mode = "cookie" | "header";

/** How long a launch may take to sign in and show its first screen. */
const LAUNCH_MS = 30_000;

/** The fixture radars (`radars/list.json`): `…0001` on, `…0002` paused. */
const ACTIVE = "01JD0000000000000000000001";
const PAUSED = "01JD0000000000000000000002";
/** The radar every stub create answers (`radars/created.json`, `few.json`); the stateless list never holds it. */
const CREATED = "01JD0000000000000000000004";
/** The searches of the two fixture radars, as the address spells them (`toSearchParams`). */
const ACTIVE_SEARCH = "/?districts=yunusobod&districts=mirobod&rooms_min=2&rooms_max=2&price_max=700";
const PAUSED_SEARCH = "/?near_metro=1&owner=owners";
/** A search no fixture radar has. */
const OWN_SEARCH = "/?rooms_min=3&rooms_max=3";

/** The default search of Tashkent (long rent, apartments), with all 25 keys, as a radar of the API carries it. */
const DEFAULT_FILTERS = {
  city: "tashkent",
  deal: "rent_long",
  types: ["apartment"],
  districts: [],
  rooms_min: null,
  rooms_max: null,
  price_min: null,
  price_max: null,
  zones: [],
  near_metro: false,
  below_median: false,
  owner: "any",
  tenant: null,
  pets: false,
  pets_only: false,
  furnished: null,
  renovation: [],
  floor_not_first: false,
  floor_not_last: false,
  area_min: null,
  area_max: null,
  market: null,
  appliances: [],
  posted_days: null,
  polygon: null,
};

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const html = (page: Page) => page.locator("html");
const cards = (page: Page) => visible(page, "article[data-listing]");
const chip = (page: Page, key: string) => visible(page, `[data-topbar="search-list"] [data-chip="${key}"]`);
const filtersSheet = (page: Page) => visible(page, '[data-slot="bottom-sheet"] [data-route="filters"][data-layer="sheet"]');
/** The footer's radar button, or its ✓ «Радар включён» in its place. */
const subscribeButton = (page: Page) => visible(page, '[data-slot="bottom-sheet"] [data-slot="filters-footer"] [data-action="subscribe"]');
const radarOn = (page: Page) => visible(page, '[data-slot="bottom-sheet"] [data-slot="filters-footer"] [data-state="radar-on"]');
const appToast = (page: Page) => visible(page, '[data-toast-host="app"] [data-toast]');
const sheetToast = (page: Page) => visible(page, '[data-toast-host="sheet"] [data-toast]');
const roomButton = (scope: Locator, label: string) => scope.getByRole("button", { name: label, exact: true });
const address = (page: Page) => {
  const url = new URL(page.url());
  return url.pathname + url.search;
};

/** A Server Action call: a POST to the page's address carrying the `Next-Action` header. */
const isServerAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;
/** The plain list read of the search tab and of the subscribe flow (no previews). */
const isRadarRead = (request: Request) => new URL(request.url()).pathname === "/bff/radars";

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

/** Fails if the page asks for anything that `match`es within `ms`: a bounded window for "nothing more follows". */
const nothingAsked = (page: Page, match: (request: Request) => boolean, ms = 1_000) =>
  expect(page.waitForRequest(match, { timeout: ms })).rejects.toThrow(/Timeout/);

async function impacts(app: LaunchedApp, style: "light" | "medium"): Promise<number> {
  return (await app.calls()).filter((call) => call.member === "HapticFeedback.impactOccurred" && call.args[0] === style).length;
}
async function notifications(app: LaunchedApp, type: "success" | "error"): Promise<number> {
  return (await app.calls()).filter((call) => call.member === "HapticFeedback.notificationOccurred" && call.args[0] === type).length;
}
async function called(app: LaunchedApp, member: string): Promise<number> {
  return (await app.calls()).filter((call) => call.member === member).length;
}

/** A gate a route handler waits on: `release()` lets the held requests go on. */
function gate(): { held: Promise<void>; release: () => void } {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { held, release };
}

/** Holds every Server Action of the page until the returned function is called; each is then sent on unchanged. */
async function holdActions(page: Page): Promise<() => void> {
  const slow = gate();
  await page.route("**/*", async (handled) => {
    if (isServerAction(handled.request())) {
      await slow.held;
    }
    await handled.fallback();
  });
  return slow.release;
}

/** Answers a radar list read with `radars`, in the API's envelope, as a stub that stored them would. */
const answerRadars = (route: Route, radars: unknown[]) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: radars, meta: { source: "stub" } }) });

/** Silences the nudges before the launch (`homi-nudge`), so none of them shows over the screens these tests tap. */
async function silenceNudges(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const far = Date.now() + 30 * 24 * 3_600_000;
    try {
      localStorage.setItem("homi-nudge", JSON.stringify({ asked: [], closed: 0, quietUntil: far, lastShown: 0, back: {}, feedOff: far }));
    } catch {
      // No storage on this document (about:blank): nothing to silence there.
    }
  });
}

/** Launches the app as the bot does, in a session mode, and waits for the session and the first cards. */
async function open(page: Page, mode: Mode, path: string, options: Omit<LaunchAppOptions, "mode" | "path"> = {}): Promise<LaunchedApp> {
  await silenceNudges(page);
  const app = await launchApp(page, { ...options, mode, path });
  // The servers are shared with other spec runs: a sign-in may queue behind them, and the boot retry covers a refusal.
  await expect(html(page)).toHaveAttribute("data-session", "ready", { timeout: LAUNCH_MS });
  await expect(cards(page).first()).toBeVisible({ timeout: LAUNCH_MS });
  return app;
}

/**
 * The filters chip opens the full filters sheet over the feed. The footer shows its radar state once the search tab's
 * list read (`/bff/radars`) answered; until then it offers the button, so the caller waits for the state it expects.
 */
async function openFilters(page: Page): Promise<void> {
  await chip(page, "filters").click();
  await expect(filtersSheet(page)).toBeVisible();
}

/** The sheet closed without applying: the feed of the same address, no layer left. */
async function closedTo(page: Page, before: string): Promise<void> {
  await expect(visible(page, "[data-layer]")).toHaveCount(0);
  await expect.poll(() => address(page)).toBe(before);
}

for (const mode of ["cookie", "header"] as const) {
  test.describe(`filters footer (${mode} mode)`, { annotation: [{ type: "screen", description: "SCR-014" }] }, () => {
    test("a search equal to the active fixture radar shows ✓ «Радар включён»; another draft offers «Включить радар»", async ({ page }) => {
      await open(page, mode, ACTIVE_SEARCH);
      await openFilters(page);
      await expect(radarOn(page)).toHaveText("Радар включён");
      await expect(subscribeButton(page)).toHaveCount(0);

      await roomButton(filtersSheet(page).locator('[data-section="rooms"]'), "3").click();
      await expect(subscribeButton(page)).toHaveText("Включить радар");
      await expect(radarOn(page)).toHaveCount(0);
    });

    test("«Включить радар» re-reads the list, creates the radar for the draft and closes the sheet with the created toast", async ({ page }) => {
      const app = await open(page, mode, OWN_SEARCH);
      const before = address(page);
      await openFilters(page);
      await expect(subscribeButton(page)).toBeEnabled();
      const reads = recordRequests(page, isRadarRead);
      const actions = recordRequests(page, isServerAction);
      const release = await holdActions(page);
      const success = await notifications(app, "success");

      await subscribeButton(page).click();
      await expect.poll(() => actions.length).toBe(1);
      await expect(subscribeButton(page)).toBeDisabled();
      // Step 1: the list is read again before the create.
      expect(reads.map((request) => new URL(request.url()).search)).toEqual([""]);
      const body = actions[0].postData() ?? "";
      expect(body).toContain('"entry":"filters"');
      expect(body).toContain('"rooms_min":3,"rooms_max":3');
      expect(body).not.toContain('"relaxed"');
      release();

      await expect(appToast(page)).toHaveText("Радар включён — новые придут в чат, как только появятся — обычно 2 в день");
      // The sheet closes without applying anything.
      await closedTo(page, before);
      expect(actions).toHaveLength(1);
      expect(await notifications(app, "success")).toBe(success + 1);
    });

    test("the scenario existing answers «Радар по этому поиску уже включён» and closes the sheet", async ({ page }) => {
      const app = await open(page, mode, OWN_SEARCH);
      const before = address(page);
      await openFilters(page);
      await expect(subscribeButton(page)).toBeEnabled();
      await setScenario(page, "existing");
      const actions = recordRequests(page, isServerAction);
      const success = await notifications(app, "success");

      await subscribeButton(page).click();
      await expect(appToast(page)).toHaveText("Радар по этому поиску уже включён");
      await closedTo(page, before);
      expect(actions).toHaveLength(1);
      // Already on plays no haptic (legacy).
      expect(await notifications(app, "success")).toBe(success);
    });

    test("an identical active radar found on the re-read: «Радар по этому поиску уже включён» without a request", async ({ page }) => {
      // The search tab's first read answers no radar, so the footer offers the button; the flow's re-read is the stub's.
      let reads = 0;
      await page.route("**/bff/radars*", (route) => (reads++ === 0 ? answerRadars(route, []) : route.fallback()));
      await open(page, mode, ACTIVE_SEARCH);
      await openFilters(page);
      await expect.poll(() => reads).toBeGreaterThan(0);
      await expect(subscribeButton(page)).toBeEnabled();
      const actions = recordRequests(page, isServerAction);

      await subscribeButton(page).click();
      await expect(appToast(page)).toHaveText("Радар по этому поиску уже включён");
      await expect(visible(page, "[data-layer]")).toHaveCount(0);
      await nothingAsked(page, isServerAction);
      expect(actions).toEqual([]);
      expect(reads).toBe(2);
    });

    test("the paused fixture radar's search: «Включить радар» switches it on again with «Радар снова включён»", async ({ page }) => {
      const app = await open(page, mode, PAUSED_SEARCH);
      await openFilters(page);
      // A paused radar with these filters is not «on»: the footer offers the button.
      await expect(subscribeButton(page)).toBeEnabled();
      const actions = recordRequests(page, isServerAction);
      const success = await notifications(app, "success");

      await subscribeButton(page).click();
      await expect(appToast(page)).toHaveText("Радар снова включён");
      await expect(visible(page, "[data-layer]")).toHaveCount(0);
      expect(actions).toHaveLength(1);
      expect(actions[0].postData() ?? "").toContain(`{"id":"${PAUSED}","active":true}`);
      expect(await notifications(app, "success")).toBe(success + 1);
    });

    test("the scenario radar_limit keeps the sheet open with «Уже 10 радаров — удалите ненужный во вкладке «Радар»»", async ({ page }) => {
      const app = await open(page, mode, OWN_SEARCH);
      await openFilters(page);
      await expect(subscribeButton(page)).toBeEnabled();
      await setScenario(page, "radar_limit");
      const error = await notifications(app, "error");

      await subscribeButton(page).click();
      await expect(sheetToast(page)).toHaveText("Уже 10 радаров — удалите ненужный во вкладке «Радар»");
      await expect(filtersSheet(page)).toBeVisible();
      await expect(subscribeButton(page)).toBeEnabled();
      await expect(roomButton(filtersSheet(page).locator('[data-section="rooms"]'), "3")).toHaveAttribute("aria-pressed", "true");
      expect(await notifications(app, "error")).toBe(error + 1);
      // No write-access question for a limit.
      expect(await called(app, "requestWriteAccess")).toBe(0);
    });
  });

  test.describe(`chat access (${mode} mode)`, { annotation: [{ type: "screen", description: "SCR-044" }] }, () => {
    test("no_chat, write access declined: «Радар не включён — боту нужно разрешение писать вам в чат», no second try", async ({ page }) => {
      const app = await open(page, mode, OWN_SEARCH, { answers: { writeAccess: false } });
      await openFilters(page);
      await expect(subscribeButton(page)).toBeEnabled();
      await setScenario(page, "no_chat");
      const actions = recordRequests(page, isServerAction);

      await subscribeButton(page).click();
      await expect(sheetToast(page)).toHaveText("Радар не включён — боту нужно разрешение писать вам в чат");
      await expect(filtersSheet(page)).toBeVisible();
      expect(await called(app, "requestWriteAccess")).toBe(1);
      expect(await called(app, "showConfirm")).toBe(0);
      await nothingAsked(page, isServerAction);
      expect(actions).toHaveLength(1);
    });

    test("no_chat, write access granted: the create runs once more and the radar turns on", async ({ page }) => {
      const app = await open(page, mode, OWN_SEARCH, { answers: { writeAccess: true } });
      const before = address(page);
      await openFilters(page);
      await expect(subscribeButton(page)).toBeEnabled();
      await setScenario(page, "no_chat");
      // The bot may write once the user allowed it: the stub's `no_chat` is left out of every later Server Action.
      let sent = 0;
      await page.route("**/*", async (route) => {
        if (isServerAction(route.request()) && sent++ === 1) {
          await setScenario(page, null);
        }
        await route.fallback();
      });
      const actions = recordRequests(page, isServerAction);

      await subscribeButton(page).click();
      await expect(appToast(page)).toHaveText("Радар включён — новые придут в чат, как только появятся — обычно 2 в день");
      await closedTo(page, before);
      expect(await called(app, "requestWriteAccess")).toBe(1);
      expect(await called(app, "showConfirm")).toBe(0);
      expect(actions).toHaveLength(2);
      expect(actions[1].postData()).toBe(actions[0].postData());
    });

    test("no_chat on a client without requestWriteAccess (6.8): no question to Telegram, «Радар не включён…»", async ({ page }) => {
      const app = await open(page, mode, OWN_SEARCH, { version: "6.8" });
      await openFilters(page);
      await expect(subscribeButton(page)).toBeEnabled();
      await setScenario(page, "no_chat");
      const actions = recordRequests(page, isServerAction);

      await subscribeButton(page).click();
      await expect(sheetToast(page)).toHaveText("Радар не включён — боту нужно разрешение писать вам в чат");
      expect(await called(app, "requestWriteAccess")).toBe(0);
      // The restart question needs HOMI's bot (`NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`), which the e2e build leaves empty.
      expect(await called(app, "showConfirm")).toBe(0);
      expect(actions).toHaveLength(1);
    });
  });

  test.describe(`few-results note (${mode} mode)`, { annotation: [{ type: "screen", description: "SCR-009" }] }, () => {
    test("«Включить радар по этому поиску» creates the radar with the few toast; «Расширить» widens it; the button leaves once the radar exists", async ({ page }) => {
      // The stub's `few` feed has five listings of the default search: the note shows under them.
      await setScenario(page, "few");
      // A stub that stored the write: once the create was sent, the list holds the new radar of this search. Until
      // then the list is the stub's own, which has no radar for the default search.
      let stored = false;
      const relaxes: string[] = [];
      const created = { id: CREATED, active: true, mode: "instant", hidden: 0, created_at: "2026-11-18T00:00:00+00:00", filters: DEFAULT_FILTERS };
      await page.route("**/bff/radars*", (route) => (stored ? answerRadars(route, [created]) : route.fallback()));
      await page.route("**/*", async (route) => {
        const request = route.request();
        const body = request.postData() ?? "";
        if (isServerAction(request) && body.includes('"entry":"few"')) {
          stored = true;
        }
        // The stateless stub does not know the created radar, so «Расширить» widens the active fixture radar instead.
        if (isServerAction(request) && body.includes(`{"id":"${CREATED}","code":"price_more"}`)) {
          relaxes.push(body);
          await route.fallback({ postData: body.replace(CREATED, ACTIVE) });
          return;
        }
        await route.fallback();
      });
      const app = await open(page, mode, "/");
      await expect(cards(page)).toHaveCount(5);
      const note = visible(page, '[data-slot="few-note"]');
      const button = note.locator('[data-few="radar"]');
      await expect(button).toHaveText("Включить радар по этому поиску");
      const actions = recordRequests(page, isServerAction);
      const light = await impacts(app, "light");

      await button.click();
      // The stub's `few` create offers «до $700: ≈5 в день» (12 listings, the first option with at least 7).
      const toast = appToast(page);
      await expect(toast).toContainText("Радар включён, но таких объявлений мало. до $700: ≈5 в день");
      await expect(toast.getByRole("button")).toHaveText("Расширить");
      expect(actions).toHaveLength(1);
      expect(actions[0].postData() ?? "").toContain('"entry":"few"');
      expect(await impacts(app, "light")).toBe(light + 1);
      // The list read after the success holds the radar: the note no longer offers it.
      await expect(button).toHaveCount(0);
      await expect(note).toBeVisible();

      await toast.getByRole("button", { name: "Расширить" }).click();
      // The stub's widen answers `starter: 3` (`radars/relaxed.json`).
      await expect(appToast(page)).toHaveText("Радар обновлён. 3 объявления под новые условия — в чате с ботом");
      expect(actions).toHaveLength(2);
      // What the app sent: the created radar and the offered option's code.
      expect(relaxes).toHaveLength(1);
      expect(relaxes[0]).toContain(`{"id":"${CREATED}","code":"price_more"}`);
    });
  });
}
