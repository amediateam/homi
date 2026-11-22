import { filtersHash, fromSearchParams, type SearchFilters } from "@homi/search";
import { expect, launchApp, type LaunchedApp, setScenario, shownText, stubMedia, test as base } from "@homi/testing/playwright";
import type { Page, Request, Response } from "@playwright/test";

/**
 * The return banner of WP-30 (SCR-046, BR-APP-070, BR-APP-071) against the API on stubs with radars switched on, in
 * cookie and header mode. `homi-visits` is seeded before the launch with the last visit of a search (the key is
 * `filtersHash` of `@homi/search`, the app's own hash); the launch records the visit of the search on screen, and when
 * the seeded one is at least 6 h old the app asks `GET /listings/new` for what came since, 1.8 s after the visit, and
 * shows «С вашего прошлого захода — N новых»: «Настроить» for default filters opens «Новый радар» with the search
 * (`entry=return`), «Включить» for custom filters turns a radar on through a Server Action with `entry: "return"`.
 * The scenario `new_none` (count 0) shows nothing; × hides it, counts one close and keeps the banner away from these
 * filters for 2 days; it hides itself after 15 s; a visit 1 h ago asks for nothing.
 *
 * The fixture radars of WP-13 cover every Tashkent default search (the same base deal and city), so the default-filter
 * cases answer the radar list (`/bff/radars`, read in the browser in both modes) with an empty one; the one case that
 * keeps the fixtures checks that no request is sent then. The custom search (2 rooms) has no fixture radar with the
 * same filters. `track()` keeps the journal events in module memory only (until WP-32), so `return_prompt_*` events
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

const HOUR_MS = 60 * 60 * 1000;
/** `RETURN_DELAY_MS` and `RETURN_SHOW_MS` of `features/nudges/constants.ts`. */
const RETURN_DELAY_MS = 1_800;
const RETURN_SHOW_MS = 15_000;
/** Long enough for the check to have run: the 1.8 s wait, the request, and a margin for the shared stub API. */
const CHECK_WINDOW_MS = RETURN_DELAY_MS + 2_500;
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
const banner = (page: Page) => visible(page, '[data-nudge="return"]');
const anyNudge = (page: Page) => page.locator("[data-nudge]");
const appToast = (page: Page) => visible(page, '[data-toast-host="app"] [data-toast]');
/** The search keys of the current address. */
const searchOf = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams);

/** The filters of a search address, the way the app reads them (the stub user's city is Tashkent). */
const filtersOf = (query: string): SearchFilters => fromSearchParams(new URLSearchParams(query), { fallbackCity: "tashkent" }).filters;
const DEFAULT_HASH = filtersHash(filtersOf(""));
const ROOMS_QUERY = "rooms_min=2&rooms_max=2";
const ROOMS_HASH = filtersHash(filtersOf(ROOMS_QUERY));

const isNew = (url: URL) => url.pathname === "/bff/listings/new";
const isRadarList = (url: URL) => url.pathname === "/bff/radars";
const isCount = (url: URL) => url.pathname === "/bff/listings/count";
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

/** Before the launch: every `[data-nudge]` card that appears and goes, in page time. */
async function watchNudges(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe = window as unknown as { __nudgeLog: NudgeLogEntry[] };
    probe.__nudgeLog = [];
    new MutationObserver(() => {
      const node = document.querySelector("[data-nudge]");
      const last = probe.__nudgeLog.at(-1);
      if (node !== null && (last === undefined || last.hiddenAt !== null)) {
        probe.__nudgeLog.push({ kind: node.getAttribute("data-nudge"), shownAt: Date.now(), hiddenAt: null });
      } else if (node === null && last !== undefined && last.hiddenAt === null) {
        last.hiddenAt = Date.now();
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

const nudgeLog = (page: Page) => page.evaluate(() => (window as unknown as { __nudgeLog: NudgeLogEntry[] }).__nudgeLog);

/**
 * Writes `homi-visits` (and `homi-nudge` when given) before the app's first script, once per tab: a reload keeps
 * what the app stored since.
 */
async function seed(page: Page, visits: Record<string, number>, nudge?: Partial<NudgeState>): Promise<void> {
  const values: Record<string, string> = { "homi-visits": JSON.stringify(visits) };
  if (nudge !== undefined) {
    values["homi-nudge"] = JSON.stringify({ asked: [], closed: 0, quietUntil: 0, lastShown: 0, back: {}, feedOff: 0, ...nudge });
  }
  await page.addInitScript((entries) => {
    try {
      if (sessionStorage.getItem("e2e-seeded") === null) {
        sessionStorage.setItem("e2e-seeded", "1");
        for (const [key, value] of Object.entries(entries)) {
          localStorage.setItem(key, value);
        }
      }
    } catch {
      // about:blank has no storage.
    }
  }, values);
}

const readJson = <T>(page: Page, key: string) => page.evaluate((name) => JSON.parse(localStorage.getItem(name) ?? "null") as unknown, key) as Promise<T | null>;
const readNudge = (page: Page) => readJson<NudgeState>(page, "homi-nudge");
const readVisits = (page: Page) => readJson<Record<string, number>>(page, "homi-visits");

/**
 * No radar for any search: the radar list answers `[]` in the API's envelope (a bare array would read as a failed
 * read, and the banner waits for a loaded list). Registered before the launch, so the first read is answered.
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

/** The count of a `GET /listings/new` answer. */
const countOf = async (response: Response) => ((await response.json()) as { data: { count: number } }).data.count;

/** «С вашего прошлого захода — {count}» with the plural `back.new` of Russian («новое», «новых»). */
const bannerTitle = (count: number) => `С вашего прошлого захода — ${count} ${new Intl.PluralRules("ru").select(count) === "one" ? "новое" : "новых"}`;

for (const mode of ["cookie", "header"] as const) {
  test.describe(`return banner (${mode} mode)`, () => {
    test("default filters, last visit 7 h ago: 1.8 s after the visit «… — N новых» with «Настроить» → «Новый радар» with the search", async ({ page }) => {
      const visited = Date.now() - 7 * HOUR_MS;
      // One close in a row before: «Настроить» starts the streak again.
      await seed(page, { [DEFAULT_HASH]: visited }, { closed: 1 });
      await noRadars(page);
      await watchNudges(page);
      const checks = recordRequests(page, (request) => isNew(new URL(request.url())));
      const answer = page.waitForResponse((response) => isNew(new URL(response.url())));
      const app = await open(page, mode);

      await expect(banner(page)).toBeVisible({ timeout: API_MS });
      const count = await countOf(await answer);
      expect(count).toBeGreaterThan(0);

      // One check of the search on screen, since the seeded visit in whole seconds, 1.8 s after this launch's visit.
      expect(checks).toHaveLength(1);
      const query = new URL(checks[0].url()).searchParams;
      expect(query.get("since")).toBe(String(Math.floor(visited / 1000)));
      expect(query.get("city")).toBe("tashkent");
      expect(query.get("deal")).toBe("rent_long");
      expect(query.getAll("types[]")).toEqual(["apartment"]);
      expect(query.has("rooms_min")).toBe(false);
      const thisVisit = (await readVisits(page))?.[DEFAULT_HASH] ?? 0;
      expect(thisVisit).toBeGreaterThan(visited + 6 * HOUR_MS);
      expect(checks[0].timing().startTime).toBeGreaterThanOrEqual(thisVisit + RETURN_DELAY_MS);

      await expect(banner(page)).toHaveAttribute("role", "status");
      await expect(banner(page).locator("b")).toHaveText(bannerTitle(count));
      await expect(banner(page)).toContainText("Радар пришлёт следующие сразу — узнаете о них первыми");
      await expect(banner(page).locator('[data-action="enable"]')).toHaveText("Настроить");
      await expect(banner(page).locator('[data-action="close"]')).toHaveAccessibleName("Закрыть");
      const [shown] = await nudgeLog(page);
      expect(shown.kind).toBe("return");

      // Shown means rendered (LB-APP-050): `back[hash]`, `lastShown` and the hash first in `asked`.
      const marked = await readNudge(page);
      expect(marked?.back[DEFAULT_HASH]).toBeGreaterThanOrEqual(shown.shownAt - 1_000);
      expect(marked?.lastShown).toBe(marked?.back[DEFAULT_HASH]);
      expect(marked?.asked[0]).toBe(DEFAULT_HASH);

      const counts = recordRequests(page, (request) => isCount(new URL(request.url())));
      const medium = await impacts(app, "medium");
      await banner(page).locator('[data-action="enable"]').click();
      await expect(anyNudge(page)).toHaveCount(0);
      expect(await impacts(app, "medium")).toBe(medium + 1);
      expect((await readNudge(page))?.closed).toBe(0);

      await expect(page).toHaveURL(/\/ru\/radars\/new\?/, { timeout: API_MS });
      expect(searchOf(page)).toEqual({ city: "tashkent", entry: "return" });
      await expect(page.getByRole("dialog", { name: "Новый радар" })).toBeVisible({ timeout: API_MS });
      await expect(visible(page, '[data-route="radars/new"]')).toBeVisible();
      await expect(visible(page, '[data-slot="bottom-sheet"] [data-action="subscribe"]')).toHaveText("Включить радар");
      // The sheet counts the search it was opened with: the default one.
      await expect.poll(() => counts.length, { timeout: API_MS }).toBeGreaterThan(0);
      const asked = new URL(counts[0].url()).searchParams;
      expect([asked.get("city"), asked.get("deal"), asked.has("rooms_min")]).toEqual(["tashkent", "rent_long", false]);
      const total = ((await (await counts[0].response())?.json()) as { data: { count: number } }).data.count;
      await expect
        .poll(() => shownText(visible(page, '[data-slot="bottom-sheet"] [data-slot="matching-now"]')), { timeout: API_MS })
        .toBe(`Сейчас подходит: ${total}`);
    });

    test("custom filters, last visit 7 h ago: «Включить» turns a radar on with `entry: return` and the success toast", async ({ page }) => {
      const visited = Date.now() - 7 * HOUR_MS;
      await seed(page, { [ROOMS_HASH]: visited });
      const checks = recordRequests(page, (request) => isNew(new URL(request.url())));
      const answer = page.waitForResponse((response) => isNew(new URL(response.url())));
      const app = await open(page, mode, `/?${ROOMS_QUERY}`);

      await expect(banner(page)).toBeVisible({ timeout: API_MS });
      const count = await countOf(await answer);
      expect(checks).toHaveLength(1);
      const query = new URL(checks[0].url()).searchParams;
      expect([query.get("rooms_min"), query.get("rooms_max"), query.get("since")]).toEqual(["2", "2", String(Math.floor(visited / 1000))]);
      await expect(banner(page).locator("b")).toHaveText(bannerTitle(count));
      await expect(banner(page).locator('[data-action="enable"]')).toHaveText("Включить");

      const actions = recordRequests(page, isServerAction);
      const medium = await impacts(app, "medium");
      await banner(page).locator('[data-action="enable"]').click();
      await expect(anyNudge(page)).toHaveCount(0);
      expect(await impacts(app, "medium")).toBe(medium + 1);
      await expect(appToast(page)).toHaveText("Радар включён — новые придут в чат, как только появятся — обычно 2 в день", { timeout: API_MS });
      expect(new URL(page.url()).pathname).toBe("/ru");
      expect(actions).toHaveLength(1);
      const body = actions[0].postData() ?? "";
      expect(body).toContain('"entry":"return"');
      expect(body).toContain('"rooms_min":2');
    });

    test("a fixture radar of the same base deal and city covers the default search: no check is sent, no banner", async ({ page }) => {
      await seed(page, { [DEFAULT_HASH]: Date.now() - 7 * HOUR_MS });
      await watchNudges(page);
      const listed = page.waitForResponse((response) => isRadarList(new URL(response.url())) && response.ok());
      await open(page, mode);

      const radars = ((await (await listed).json()) as { data: { id: string }[] }).data;
      expect(radars.length).toBeGreaterThan(0);
      await nothingAsked(page, (request) => isNew(new URL(request.url())), CHECK_WINDOW_MS);
      await expect(anyNudge(page)).toHaveCount(0);
      expect(await nudgeLog(page)).toEqual([]);
    });

    test("the scenario new_none: the check answers 0 and no banner shows", async ({ page }) => {
      await seed(page, { [DEFAULT_HASH]: Date.now() - 7 * HOUR_MS });
      await noRadars(page);
      await watchNudges(page);
      await setScenario(page, "new_none");
      const answer = page.waitForResponse((response) => isNew(new URL(response.url())));
      await open(page, mode);

      expect(await countOf(await answer)).toBe(0);
      await page.waitForTimeout(1_500);
      await expect(anyNudge(page)).toHaveCount(0);
      expect(await nudgeLog(page)).toEqual([]);
      expect((await readNudge(page))?.back ?? {}).toEqual({});
      await setScenario(page, null);
    });

    test("× hides it and counts one close; with the cooldown over it stays away from these filters for 2 days", async ({ page }) => {
      await seed(page, { [DEFAULT_HASH]: Date.now() - 7 * HOUR_MS });
      await noRadars(page);
      await watchNudges(page);
      await open(page, mode);

      await expect(banner(page)).toBeVisible({ timeout: API_MS });
      await banner(page).locator('[data-action="close"]').click();
      await expect(anyNudge(page)).toHaveCount(0);
      const closed = await readNudge(page);
      expect(closed?.closed).toBe(1);
      expect(closed?.quietUntil).toBe(0);
      const back = closed?.back[DEFAULT_HASH] ?? 0;
      expect(back).toBeGreaterThan(0);
      await page.waitForTimeout(1_000);
      await expect(anyNudge(page)).toHaveCount(0);

      // The next launch finds a visit 7 h old again and no cooldown; only the banner shown a moment ago remains.
      await page.addInitScript((hash) => {
        const nudge = JSON.parse(localStorage.getItem("homi-nudge") ?? "{}") as Record<string, unknown>;
        localStorage.setItem("homi-nudge", JSON.stringify({ ...nudge, lastShown: 0 }));
        const visits = JSON.parse(localStorage.getItem("homi-visits") ?? "{}") as Record<string, number>;
        localStorage.setItem("homi-visits", JSON.stringify({ ...visits, [hash]: Date.now() - 7 * 60 * 60 * 1000 }));
      }, DEFAULT_HASH);
      const listed = page.waitForResponse((response) => isRadarList(new URL(response.url())));
      await page.reload();
      await expect(html(page)).toHaveAttribute("data-session", "ready", { timeout: API_MS });
      await expect(cards(page).first()).toBeVisible({ timeout: API_MS });
      await listed;
      expect((await readNudge(page))?.back[DEFAULT_HASH]).toBe(back);
      await nothingAsked(page, (request) => isNew(new URL(request.url())), CHECK_WINDOW_MS);
      await expect(anyNudge(page)).toHaveCount(0);

      // The control: the same reload without that banner's time sends the check, so the 2 days held it back.
      await page.addInitScript((hash) => {
        const nudge = JSON.parse(localStorage.getItem("homi-nudge") ?? "{}") as { back?: Record<string, number> };
        const kept = { ...nudge.back };
        delete kept[hash];
        localStorage.setItem("homi-nudge", JSON.stringify({ ...nudge, back: kept }));
      }, DEFAULT_HASH);
      const checked = page.waitForRequest((request) => isNew(new URL(request.url())), { timeout: 2 * API_MS });
      await page.reload();
      await expect(html(page)).toHaveAttribute("data-session", "ready", { timeout: API_MS });
      await checked;
      await expect(banner(page)).toBeVisible({ timeout: API_MS });
    });

    test("an apply of filters last visited 7 h ago: the return banner takes the slot and the follow nudge never shows", async ({ page }) => {
      await seed(page, { [ROOMS_HASH]: Date.now() - 7 * HOUR_MS });
      await watchNudges(page);
      await open(page, mode);
      const flows = recordRequests(page, (request) => new URL(request.url()).pathname === "/bff/listings/flow");
      const checks = recordRequests(page, (request) => isNew(new URL(request.url())));

      // The rooms quick sheet of WP-25: 2 rooms, custom filters — a follow-nudge candidate and a visit of them at once.
      await visible(page, '[data-topbar="search-list"] [data-chip="rooms"]').click();
      const rooms = visible(page, '[data-slot="bottom-sheet"] [data-route="filters/rooms"][data-layer="sheet"]');
      await expect(rooms).toBeVisible({ timeout: API_MS });
      await rooms.getByRole("button", { name: "2", exact: true }).click();
      const apply = visible(page, '[data-slot="bottom-sheet"] [data-action="apply"]');
      await expect(apply).toBeEnabled({ timeout: API_MS });
      await apply.click();
      await expect
        .poll(() => ({ pathname: new URL(page.url()).pathname, search: searchOf(page) }), { timeout: API_MS })
        .toEqual({ pathname: "/ru", search: { city: "tashkent", rooms_min: "2", rooms_max: "2" } });

      await expect(banner(page)).toBeVisible({ timeout: API_MS });
      expect(checks).toHaveLength(1);
      // The follow nudge's wait was held while the return check of the same filters ran, and the banner dropped it.
      await page.waitForTimeout(RETURN_DELAY_MS + 1_000);
      expect(flows).toEqual([]);
      expect((await nudgeLog(page)).map((entry) => entry.kind)).toEqual(["return"]);
      await expect(visible(page, '[data-nudge="follow"]')).toHaveCount(0);
    });

    test("left alone, the banner hides itself 15 s after it appeared; no close is counted", async ({ page }) => {
      await seed(page, { [ROOMS_HASH]: Date.now() - 7 * HOUR_MS });
      await watchNudges(page);
      await open(page, mode, `/?${ROOMS_QUERY}`);

      await expect(banner(page)).toBeVisible({ timeout: API_MS });
      await expect(anyNudge(page)).toHaveCount(0, { timeout: RETURN_SHOW_MS + 3_000 });
      const log = await nudgeLog(page);
      expect(log).toHaveLength(1);
      const hiddenAfter = (log[0].hiddenAt ?? 0) - log[0].shownAt;
      expect(hiddenAfter).toBeGreaterThanOrEqual(RETURN_SHOW_MS);
      expect(hiddenAfter).toBeLessThan(RETURN_SHOW_MS + 1_500);
      expect((await readNudge(page))?.closed).toBe(0);
    });

    test("last visit 1 h ago: no check is sent and no banner shows", async ({ page }) => {
      await seed(page, { [DEFAULT_HASH]: Date.now() - HOUR_MS });
      await noRadars(page);
      await watchNudges(page);
      const listed = page.waitForResponse((response) => isRadarList(new URL(response.url())));
      await open(page, mode);

      await listed;
      await nothingAsked(page, (request) => isNew(new URL(request.url())), CHECK_WINDOW_MS);
      await expect(anyNudge(page)).toHaveCount(0);
      expect(await nudgeLog(page)).toEqual([]);
      // The launch moved the stored visit to now.
      expect((await readVisits(page))?.[DEFAULT_HASH]).toBeGreaterThan(Date.now() - 60_000);
    });
  });
}
