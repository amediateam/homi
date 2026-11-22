import { filtersHash, fromSearchParams, type SearchFilters } from "@homi/search";
import { expect, launchApp, stubMedia, test as base, type LaunchedApp } from "@homi/testing/playwright";
import type { Locator, Page, Request } from "@playwright/test";

/**
 * The follow nudge of WP-30 (SCR-040, BR-APP-043, BR-APP-046) against the API on stubs with radars switched on, in
 * cookie and header mode. An apply of custom filters (the rooms quick sheet of WP-25, 2 rooms) shows «Включить радар
 * по этому поиску?» 1.8 s after it, with the flow line of `GET /listings/flow` read only after the wait; «Включить»
 * turns a radar on through a Server Action with `entry: "prompt"` and the subscribe flow's success toast; default
 * filters get no nudge and no flow request; the card hides itself after 10 s; × counts one close, and within the 8 h
 * cooldown no other nudge follows; with the cooldown over the same filters are never offered again while other ones
 * are; the third × in a row silences the nudges for 14 days; an empty flow answer shows the card without a flow line
 * (LB-APP-006). No fixture radar has the filters of these searches (`sameFilters`), so the stub radar list is kept.
 *
 * `homi-nudge` is seeded before the launch where a test needs a close streak, and its `lastShown` is set back in the
 * page where a test needs the cooldown over (the app reads the store on every rule check). A `MutationObserver`
 * installed before the launch logs when a nudge card appears and goes, in page time, so the waits are measured where
 * they run. `track()` keeps the journal events in module memory only (until WP-32), so the `follow_prompt_*` events
 * are not observable here; the storage marks of the first render are. Every photo is answered by `stubMedia`.
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

interface NudgeLogEntry {
  kind: string | null;
  shownAt: number;
  hiddenAt: number | null;
}

interface ProbeWindow {
  __nudgeLog: NudgeLogEntry[];
  __applyAt: number | null;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** `FOLLOW_DELAY_MS` and `FOLLOW_SHOW_MS` of `features/nudges/constants.ts`. */
const FOLLOW_DELAY_MS = 1_800;
const FOLLOW_SHOW_MS = 10_000;
/**
 * The bound of a wait on the stub API: locally it is one `php -S` process that parallel runs share, so a sign-in, a
 * server render or a Server Action can take seconds. The waits the app times itself are measured in the page.
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
const chip = (page: Page, key: string) => visible(page, `[data-topbar="search-list"] [data-chip="${key}"]`);
/** The intercepted copy of a sheet address, inside its bottom sheet. */
const sheet = (page: Page, name: string) => visible(page, `[data-slot="bottom-sheet"] [data-route="${name}"][data-layer="sheet"]`);
const applyButton = (page: Page) => visible(page, '[data-slot="bottom-sheet"] [data-action="apply"]');
const roomButton = (scope: Locator, label: string) => scope.getByRole("button", { name: label, exact: true });
const nudge = (page: Page) => visible(page, '[data-nudge="follow"]');
const anyNudge = (page: Page) => page.locator("[data-nudge]");
const appToast = (page: Page) => visible(page, '[data-toast-host="app"] [data-toast]');
/** The search keys of the current address. */
const searchOf = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams);

/** The filters of a search address, the way the app reads them (the stub user's city is Tashkent). */
const filtersOf = (query: string): SearchFilters => fromSearchParams(new URLSearchParams(query), { fallbackCity: "tashkent" }).filters;

const isFlow = (url: URL) => url.pathname === "/bff/listings/flow";
const hasRooms = (url: URL, min: string, max: string) => url.searchParams.get("rooms_min") === min && url.searchParams.get("rooms_max") === max;
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

/** Fails if the page asks for anything that `match`es within `ms`: a bounded window for "nothing more follows". */
const nothingAsked = (page: Page, match: (request: Request) => boolean, ms: number) =>
  expect(page.waitForRequest(match, { timeout: ms })).rejects.toThrow(/Timeout/);

/** Medium impacts the page asked the fake Telegram for so far (TMA-025). */
async function impacts(app: LaunchedApp, style: "light" | "medium"): Promise<number> {
  return (await app.calls()).filter((call) => call.member === "HapticFeedback.impactOccurred" && call.args[0] === style).length;
}

/** Success notifications the page asked the fake Telegram for so far. */
async function successes(app: LaunchedApp): Promise<number> {
  return (await app.calls()).filter((call) => call.member === "HapticFeedback.notificationOccurred" && call.args[0] === "success").length;
}

/**
 * Before the launch: the nudge log (every `[data-nudge]` card that appears and goes, in page time) and the time of
 * each tap on a sheet's apply button (`__applyAt`), in the capture phase, before the app reacts.
 */
async function watchNudges(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe = window as unknown as ProbeWindow;
    probe.__nudgeLog = [];
    probe.__applyAt = null;
    const check = () => {
      const node = document.querySelector("[data-nudge]");
      const last = probe.__nudgeLog.at(-1);
      if (node !== null && (last === undefined || last.hiddenAt !== null)) {
        probe.__nudgeLog.push({ kind: node.getAttribute("data-nudge"), shownAt: Date.now(), hiddenAt: null });
      } else if (node === null && last !== undefined && last.hiddenAt === null) {
        last.hiddenAt = Date.now();
      }
    };
    new MutationObserver(check).observe(document, { childList: true, subtree: true });
    document.addEventListener(
      "click",
      (event) => {
        if (event.target instanceof Element && event.target.closest('[data-action="apply"]') !== null) {
          probe.__applyAt = Date.now();
        }
      },
      true,
    );
  });
}

const nudgeLog = (page: Page) => page.evaluate(() => (window as unknown as ProbeWindow).__nudgeLog);
const applyAt = async (page: Page): Promise<number> => {
  const at = await page.evaluate(() => (window as unknown as ProbeWindow).__applyAt);
  expect(at).not.toBeNull();
  return at as number;
};

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

/** Ends the 8 h cooldown in the store the app reads on every rule check. */
const endCooldown = (page: Page) =>
  page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("homi-nudge") ?? "{}") as Record<string, unknown>;
    localStorage.setItem("homi-nudge", JSON.stringify({ ...state, lastShown: 0 }));
  });

/** Launches the app as the bot does, in a session mode, and waits for the session and the first cards. */
async function open(page: Page, mode: Mode, path = "/"): Promise<LaunchedApp> {
  const app = await launchApp(page, { mode, path });
  await expect(html(page)).toHaveAttribute("data-session", "ready", { timeout: API_MS });
  await expect(cards(page).first()).toBeVisible({ timeout: API_MS });
  return app;
}

/**
 * Waits for the address an apply lands on. `closeThen` steps back first, so the page below shows its old address
 * for a moment before the replace.
 */
const landed = (page: Page, search: Record<string, string>) =>
  expect
    .poll(() => ({ pathname: new URL(page.url()).pathname, search: searchOf(page) }), { timeout: API_MS })
    .toEqual({ pathname: "/ru", search });

/** The rooms chip → the quick sheet → each room button in turn → «Показать …»; waits for the sheet to close. */
async function applyRooms(page: Page, labels: string[]): Promise<void> {
  await chip(page, "rooms").click();
  const rooms = sheet(page, "filters/rooms");
  await expect(rooms).toBeVisible({ timeout: API_MS });
  for (const label of labels) {
    await roomButton(rooms, label).click();
  }
  await expect(applyButton(page)).toBeEnabled({ timeout: API_MS });
  await applyButton(page).click();
  await expect(visible(page, "[data-layer]")).toHaveCount(0, { timeout: API_MS });
}

/** The flow line the card shows for a `GET /listings/flow` answer (`formatFlow(…, "nudge")` with every flag off). */
function flowLine(flow: { week: number; days: number }): string {
  if (flow.week === 0) {
    return "Таких пока нет — радар пришлёт, как появятся";
  }
  const perDay = flow.week / flow.days;
  return perDay < 1 ? `${flow.week} за неделю` : `≈${Math.round(perDay)} в день`;
}

for (const mode of ["cookie", "header"] as const) {
  test.describe(`follow nudge (${mode} mode)`, { annotation: [{ type: "screen", description: "SCR-040" }] }, () => {
    test("custom filters: the card 1.8 s after the apply, the flow read after the wait; «Включить» turns a radar on with the success toast", async ({ page }) => {
      await watchNudges(page);
      // One close in a row before: «Включить» starts the streak again.
      await seedNudge(page, { closed: 1 });
      const app = await open(page, mode);
      const flows = recordRequests(page, (request) => isFlow(new URL(request.url())));
      const flowAnswer = page.waitForResponse((response) => isFlow(new URL(response.url())));

      await applyRooms(page, ["2"]);
      await landed(page, { city: "tashkent", rooms_min: "2", rooms_max: "2" });
      await expect(nudge(page)).toBeVisible({ timeout: API_MS });
      const appliedAt = await applyAt(page);
      const [shown] = await nudgeLog(page);
      expect(shown.kind).toBe("follow");
      expect(shown.shownAt - appliedAt).toBeGreaterThanOrEqual(FOLLOW_DELAY_MS);

      // Step 4: one flow read of the applied filters, sent only after the wait.
      expect(flows).toHaveLength(1);
      expect(hasRooms(new URL(flows[0].url()), "2", "2")).toBe(true);
      expect(flows[0].timing().startTime).toBeGreaterThanOrEqual(appliedAt + FOLLOW_DELAY_MS);
      const flow = ((await (await flowAnswer).json()) as { data: { week: number; days: number } }).data;

      await expect(nudge(page)).toHaveAttribute("role", "status");
      await expect(nudge(page)).toContainText("Включить радар по этому поиску?");
      await expect(nudge(page)).toContainText("Новые — сразу в чат");
      await expect(nudge(page).locator('[data-slot="nudge-flow"]')).toHaveText(flowLine(flow));
      await expect(nudge(page).locator('[data-action="enable"]')).toHaveText("Включить");
      await expect(nudge(page).locator('[data-action="close"]')).toHaveAccessibleName("Закрыть");

      // Shown means rendered (LB-APP-050): the hash first in `asked`, `lastShown` at the render.
      const marked = await readNudge(page);
      expect(marked?.asked[0]).toBe(filtersHash(filtersOf("rooms_min=2&rooms_max=2")));
      expect(marked?.lastShown).toBeGreaterThanOrEqual(appliedAt);
      expect(marked?.closed).toBe(1);

      const actions = recordRequests(page, isServerAction);
      const medium = await impacts(app, "medium");
      const success = await successes(app);
      await nudge(page).locator('[data-action="enable"]').click();
      await expect(anyNudge(page)).toHaveCount(0);
      expect(await impacts(app, "medium")).toBe(medium + 1);
      await expect(appToast(page)).toHaveText("Радар включён — новые придут в чат, как только появятся — обычно 2 в день", { timeout: API_MS });
      await expect.poll(() => successes(app), { timeout: API_MS }).toBe(success + 1);
      expect((await readNudge(page))?.closed).toBe(0);

      // The create is one Server Action whose input carries `entry: "prompt"` and the applied rooms.
      expect(actions).toHaveLength(1);
      const body = actions[0].postData() ?? "";
      expect(body).toContain('"entry":"prompt"');
      expect(body).toContain('"rooms_min":2');
      expect(body).toContain('"rooms_max":2');
    });

    test("default filters: an apply that lands on them shows no nudge and sends no flow request", async ({ page }) => {
      await watchNudges(page);
      await open(page, mode, "/?rooms_min=3&rooms_max=3");

      await applyRooms(page, ["Любые"]);
      await landed(page, { city: "tashkent" });
      // The wait is 1.8 s, the flow read follows it: twice that without a request.
      await nothingAsked(page, (request) => isFlow(new URL(request.url())), 2 * FOLLOW_DELAY_MS + 500);
      await expect(anyNudge(page)).toHaveCount(0);
      expect(await nudgeLog(page)).toEqual([]);
      expect((await readNudge(page))?.asked ?? []).toEqual([]);
    });

    test("left alone, the card hides itself 10 s after it appeared; no close is counted", async ({ page }) => {
      await watchNudges(page);
      await open(page, mode);

      await applyRooms(page, ["2"]);
      await landed(page, { city: "tashkent", rooms_min: "2", rooms_max: "2" });
      await expect(nudge(page)).toBeVisible({ timeout: API_MS });
      await expect(anyNudge(page)).toHaveCount(0, { timeout: FOLLOW_SHOW_MS + 3_000 });

      const log = await nudgeLog(page);
      expect(log).toHaveLength(1);
      const hiddenAfter = (log[0].hiddenAt ?? 0) - log[0].shownAt;
      expect(hiddenAfter).toBeGreaterThanOrEqual(FOLLOW_SHOW_MS);
      expect(hiddenAfter).toBeLessThan(FOLLOW_SHOW_MS + 1_500);
      expect((await readNudge(page))?.closed).toBe(0);
    });

    test("× hides it and counts one close; no other nudge within the 8 h; after them the same filters never again, other ones yes", async ({ page }) => {
      await watchNudges(page);
      await open(page, mode);
      const flows = recordRequests(page, (request) => isFlow(new URL(request.url())));

      await applyRooms(page, ["2"]);
      await landed(page, { city: "tashkent", rooms_min: "2", rooms_max: "2" });
      await expect(nudge(page)).toBeVisible({ timeout: API_MS });
      await nudge(page).locator('[data-action="close"]').click();
      await expect(anyNudge(page)).toHaveCount(0);
      const closed = await readNudge(page);
      expect(closed?.closed).toBe(1);
      expect(closed?.quietUntil).toBe(0);
      expect(flows).toHaveLength(1);

      // Other custom filters within the cooldown of the nudge just shown: nothing is offered, nothing read.
      await applyRooms(page, ["3"]);
      await landed(page, { city: "tashkent", rooms_min: "2", rooms_max: "3" });
      await nothingAsked(page, (request) => isFlow(new URL(request.url())), 2 * FOLLOW_DELAY_MS + 500);
      await expect(anyNudge(page)).toHaveCount(0);

      // The cooldown over: the filters already offered stay silent …
      await endCooldown(page);
      await applyRooms(page, ["2"]);
      await landed(page, { city: "tashkent", rooms_min: "2", rooms_max: "2" });
      await nothingAsked(page, (request) => isFlow(new URL(request.url())), 2 * FOLLOW_DELAY_MS + 500);
      await expect(anyNudge(page)).toHaveCount(0);

      // … while filters never offered get the nudge (2–3 was applied during the cooldown only).
      await applyRooms(page, ["3"]);
      await landed(page, { city: "tashkent", rooms_min: "2", rooms_max: "3" });
      await expect(nudge(page)).toBeVisible({ timeout: API_MS });
      expect(flows).toHaveLength(2);
      expect(hasRooms(new URL(flows[1].url()), "2", "3")).toBe(true);
      expect((await nudgeLog(page)).map((entry) => entry.kind)).toEqual(["follow", "follow"]);
    });

    test("the third × in a row silences the nudges for 14 days", async ({ page }) => {
      await watchNudges(page);
      // Two closes in a row before this launch.
      await seedNudge(page, { closed: 2 });
      await open(page, mode);

      await applyRooms(page, ["2"]);
      await landed(page, { city: "tashkent", rooms_min: "2", rooms_max: "2" });
      await expect(nudge(page)).toBeVisible({ timeout: API_MS });
      const before = Date.now();
      await nudge(page).locator('[data-action="close"]').click();
      await expect(anyNudge(page)).toHaveCount(0);
      const after = Date.now();
      const silenced = await readNudge(page);
      expect(silenced?.closed).toBe(0);
      expect(silenced?.quietUntil).toBeGreaterThanOrEqual(before + 14 * DAY_MS - 1_000);
      expect(silenced?.quietUntil).toBeLessThanOrEqual(after + 14 * DAY_MS);

      // With the 8 h cooldown taken away only the silence is left, and it holds new custom filters back.
      await endCooldown(page);
      await applyRooms(page, ["3"]);
      await landed(page, { city: "tashkent", rooms_min: "2", rooms_max: "3" });
      await nothingAsked(page, (request) => isFlow(new URL(request.url())), 2 * FOLLOW_DELAY_MS + 500);
      await expect(anyNudge(page)).toHaveCount(0);
      expect(await nudgeLog(page)).toHaveLength(1);
    });

    test("an empty flow answer shows the card without a flow line and no crash (LB-APP-006)", async ({ page }) => {
      await watchNudges(page);
      await page.route(
        (url) => isFlow(url),
        (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: {}, meta: {} }) }),
      );
      await open(page, mode);

      await applyRooms(page, ["2"]);
      await landed(page, { city: "tashkent", rooms_min: "2", rooms_max: "2" });
      await expect(nudge(page)).toBeVisible({ timeout: API_MS });
      await expect(nudge(page)).toContainText("Включить радар по этому поиску?");
      await expect(nudge(page).locator('[data-slot="nudge-flow"]')).toHaveCount(0);
      await expect(visible(page, '[data-route="error"]')).toHaveCount(0);
      await expect(cards(page).first()).toBeVisible({ timeout: API_MS });
    });
  });
}
