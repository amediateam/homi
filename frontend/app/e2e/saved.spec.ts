import { expect, launchApp, type LaunchedApp, setScenario, stubMedia, test as base } from "@homi/testing/playwright";
import type { Page, Request, Route } from "@playwright/test";

/**
 * The saved tab of WP-29 (SCR-024, SCR-025, BR-APP-067) against the API on stubs, whose favourites and history each
 * hold 25 listings in pages of 20 (WP-13): the Heart tab and the title tabs with no Back button; page one from the
 * server in cookie mode, through `/bff` in header mode; the pages to the end and an answer that repeats its cursor;
 * the un-favourite and its failure; pull-to-refresh; «Очистить» with Cancel, a failure and OK; the return to history
 * after a listing was opened (the page entered again, or Back from a card not yet seen in this launch); the Heart tab
 * entered again from the search tab; the empty states of the scenario `empty`; the demo marker. Every case runs in
 * both modes, as each one reads or writes with the session; the first read is where they differ, so the request
 * checks name the mode. A launch that needs no feed starts on the radars placeholder, which reads nothing: the full
 * run shares one stub user's API limit (120 a minute, KI-32). Every photo is answered by `stubMedia`.
 */

const test = base.extend<{ photos: readonly string[] }>({
  /** The stub photos answered so far: every test answers them itself, as CI has no `cdn.homi.loc`. */
  photos: [async ({ page }, use) => use(await stubMedia(page)), { auto: true }],
});

interface Fake {
  webApp: { BackButton: { isVisible: boolean } };
  answers: { confirm: boolean };
  emit(eventType: string): void;
}

type Mode = "cookie" | "header";
type Source = "favorites" | "history";

/**
 * The visible copy only: with `cacheComponents` the router keeps earlier routes hidden in `<Activity>`
 * (`preserving-ui-state.md`), so the same element can be in the document twice.
 */
const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const route = (page: Page, name: string) => visible(page, `[data-route="${name}"]`);
const html = (page: Page) => page.locator("html");
const cards = (page: Page) => visible(page, "article[data-listing]");
const card = (page: Page, number: number) => visible(page, `article[data-listing="${number}"]`);
const tab = (page: Page, key: "search" | "saved" | "radars") => visible(page, `[data-tab="${key}"]`);
const titleTab = (page: Page, label: "Избранное" | "Смотрели") =>
  visible(page, '[data-topbar="saved"] [data-slot="title-tab"]').filter({ hasText: label });
const tools = (page: Page) => visible(page, '[data-tools="history"]');
const clearButton = (page: Page) => tools(page).locator("[data-clear-history]");
const listingLayer = (page: Page, number: number) =>
  visible(page, `[data-route="listing"][data-layer="overlay"][data-listing-number="${number}"]`);
const press = (page: Page, eventType: "backButtonClicked") =>
  page.evaluate((type) => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit(type), eventType);
const backVisible = (page: Page) =>
  page.evaluate(() => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.webApp.BackButton.isVisible);
/** What the simulated user answers to the next `showConfirm` (`fake.answers`, the live object). */
const answerConfirm = (page: Page, confirm: boolean) =>
  page.evaluate((value) => {
    (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.answers.confirm = value;
  }, confirm);
const historyLength = (page: Page) => page.evaluate(() => history.length);

/** Any read of a saved list through `/bff`. */
const isList = (source: Source) => (url: URL) => url.pathname === `/bff/${source}`;
/** Page one of a saved list through `/bff`: no cursor. */
const isPageOne = (source: Source) => (url: URL) => isList(source)(url) && !url.searchParams.has("cursor");
/** A later page of a saved list through `/bff`: the cursor of the page before. */
const isLaterPage = (source: Source) => (url: URL) => isList(source)(url) && url.searchParams.has("cursor");
const requestTo = (match: (url: URL) => boolean) => (request: Request) => match(new URL(request.url()));
/** A Server Action call: a POST to the page's address carrying the `Next-Action` header. */
const isServerAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;
/** A server render the router asks for: an RSC request (`RSC: 1`) that is neither a prefetch nor a Server Action. */
const isRender = (request: Request) => {
  const headers = request.headers();
  return (
    headers.rsc === "1" &&
    headers["next-router-prefetch"] === undefined &&
    headers["next-router-segment-prefetch"] === undefined &&
    headers["next-action"] === undefined
  );
};
const isRenderOf = (pathname: string) => (request: Request) => isRender(request) && new URL(request.url()).pathname === pathname;

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

interface ListAnswer {
  cursor: string | null;
  numbers: number[];
  next: string | null | undefined;
  source: string | undefined;
}

/** Collects the answers of `/bff/<source>` from now on, as the app received them (a fulfilled answer included). */
function recordAnswers(page: Page, source: Source): ListAnswer[] {
  const seen: ListAnswer[] = [];
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (!isList(source)(url) || !response.ok()) {
      return;
    }
    const body = (await response.json()) as { data: { number: number }[]; meta: { next_cursor?: string | null; source?: string } };
    seen.push({
      cursor: url.searchParams.get("cursor"),
      numbers: body.data.map((item) => item.number),
      next: body.meta.next_cursor,
      source: body.meta.source,
    });
  });
  return seen;
}

/** The listing numbers of the visible cards, in their order. */
const numbersOf = (page: Page) => cards(page).evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("data-listing"))));

/** The texts of the `showConfirm` questions the page asked the fake Telegram so far (TMA-026). */
async function confirms(app: LaunchedApp): Promise<unknown[]> {
  return (await app.calls()).filter((call) => call.member === "showConfirm").map((call) => call.args[0]);
}

/** Notification haptics of `type` the page asked the fake Telegram for so far (TMA-025). */
async function notifications(app: LaunchedApp, type: "error" | "success"): Promise<number> {
  return (await app.calls()).filter((call) => call.member === "HapticFeedback.notificationOccurred" && call.args[0] === type).length;
}

/** Two animation frames: the shell has read the scroll position of the last scroll event by then. */
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

/** Scrolls the window and waits until the shell has read the position. */
async function scrollTo(page: Page, y: number): Promise<void> {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await nextFrames(page);
}

/** Scrolls to the end of the list, so its sentinel is in reach. */
const scrollToEnd = (page: Page) => scrollTo(page, Number.MAX_SAFE_INTEGER);

/** A one-finger touch drag through the CDP, as a finger on a phone (pull-to-refresh). */
async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 10): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let step = 1; step <= steps; step += 1) {
    const point = { x: from.x + ((to.x - from.x) * step) / steps, y: from.y + ((to.y - from.y) * step) / steps };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** 200 px of finger travel from the top of the page: past the 72 px trigger of the shell's pull (WP-23). */
async function pull(page: Page): Promise<void> {
  await scrollTo(page, 0);
  await touchDrag(page, { x: 195, y: 300 }, { x: 195, y: 500 });
}

/** A gate a route handler waits on: `release()` lets the held requests go on. */
function gate(): { held: Promise<void>; release: () => void } {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { held, release };
}

/** Holds the Server Action calls posted to `pathname` until the returned gate is released; other requests pass. */
async function holdActions(page: Page, pathname: string): Promise<{ release: () => void; held: () => number }> {
  const slow = gate();
  let held = 0;
  await page.route(
    (url) => url.pathname === pathname,
    async (handled: Route) => {
      if (isServerAction(handled.request())) {
        held += 1;
        await slow.held;
      }
      await handled.fallback();
    },
  );
  return { release: slow.release, held: () => held };
}

/**
 * Launches the app as the bot does, in a session mode, and waits for the session. In cookie mode the sign-in then
 * refreshes the router once (WP-21): its render of the launch page has answered before the test goes on, so the
 * saved pages the test enters are rendered with the cookie and no refresh lands on them. The radars tab is a
 * placeholder that reads nothing.
 */
async function open(page: Page, mode: Mode, path: "/" | "/radars" = "/radars"): Promise<LaunchedApp> {
  const refreshes = recordRequests(page, isRenderOf(path === "/" ? "/ru" : `/ru${path}`));
  const app = await launchApp(page, { mode, path });
  await expect(html(page)).toHaveAttribute("data-session", "ready");
  if (mode === "cookie") {
    await expect.poll(() => refreshes.length).toBe(1);
    await (await refreshes[0].response())?.finished();
  }
  await expect(route(page, path === "/" ? "feed" : "radars")).toBeVisible();
  return app;
}

/** The Heart tab from another tab: favourites, the saved tab current, no Back button. */
async function enterFavorites(page: Page): Promise<void> {
  await tab(page, "saved").click();
  await expect(page).toHaveURL(/\/ru\/saved$/);
  await expect(route(page, "saved")).toBeVisible();
  await expect(tab(page, "saved")).toHaveAttribute("aria-current", "page");
}

/** The title tab «Смотрели» from favourites: the address is replaced, history shows, no Back button. */
async function enterHistory(page: Page): Promise<void> {
  const entries = await historyLength(page);
  await titleTab(page, "Смотрели").click();
  await expect(page).toHaveURL(/\/ru\/saved\/history$/);
  await expect(route(page, "saved/history")).toBeVisible();
  await expect(titleTab(page, "Смотрели")).toHaveAttribute("aria-current", "page");
  expect(await historyLength(page)).toBe(entries);
}

/** Opens the listing of a visible card over the list and returns to the list with Telegram's BackButton. */
async function openAndBack(page: Page, number: number, back: RegExp): Promise<void> {
  await card(page, number).locator("a").click();
  await expect(page).toHaveURL(new RegExp(`/ru/listing/${number}$`));
  await expect(listingLayer(page, number)).toBeVisible();
  await press(page, "backButtonClicked");
  await expect(page).toHaveURL(back);
  await expect(visible(page, '[data-route="listing"]')).toHaveCount(0);
}

for (const mode of ["cookie", "header"] as const) {
  test.describe(`saved (${mode} mode)`, { annotation: [{ type: "screen", description: "SCR-024" }, { type: "screen", description: "SCR-025" }] }, () => {
    test("the Heart tab shows 20 favourites, the end adds the last 5 with one request; an un-favourite drops a card, a failed one returns it; the tab entered again re-creates the list", async ({
      page,
    }) => {
      await open(page, mode);
      const firstPages = recordRequests(page, requestTo(isPageOne("favorites")));
      const laterPages = recordRequests(page, requestTo(isLaterPage("favorites")));
      const renders = recordRequests(page, isRenderOf("/ru/saved"));
      const answers = recordAnswers(page, "favorites");

      await enterFavorites(page);
      await expect(cards(page)).toHaveCount(20);
      await expect(titleTab(page, "Избранное")).toHaveAttribute("aria-current", "page");
      await expect.poll(() => backVisible(page)).toBe(false);
      await expect(page.locator("[data-demo-marker]")).toBeVisible();
      if (mode === "cookie") {
        // Page one is in the server's render of the page, read with the cookie; the browser asks for none.
        expect(renders).toHaveLength(1);
        const rendered = (await (await renders[0].response())?.text()) ?? "";
        expect(rendered).toContain('"source":"stub"');
        for (const number of await numbersOf(page)) {
          expect(rendered).toContain(`"number":${number}`);
        }
        await nothingAsked(page, requestTo(isList("favorites")));
        expect(firstPages).toEqual([]);
      } else {
        await expect.poll(() => answers.length).toBe(1);
        expect(firstPages).toHaveLength(1);
        expect(firstPages[0].headers().authorization ?? "").toMatch(/^Bearer \S+$/);
        expect(answers[0].source).toBe("stub");
        expect(await numbersOf(page)).toEqual(answers[0].numbers);
      }
      const pageOne = await numbersOf(page);

      // The end of the list asks for the last page once with the cursor; the stub's last cursor is `null`.
      await scrollToEnd(page);
      await expect.poll(() => laterPages.length).toBe(1);
      await expect(cards(page)).toHaveCount(25);
      if (mode === "header") {
        expect(new URL(laterPages[0].url()).searchParams.get("cursor")).toBe(answers[0].next);
      }
      await expect.poll(() => answers.at(-1)?.cursor ?? null).not.toBeNull();
      expect(answers.at(-1)?.next ?? null).toBeNull();
      const shown = await numbersOf(page);
      expect(new Set(shown).size).toBe(25);
      expect(shown.slice(0, 20)).toEqual(pageOne);
      await scrollTo(page, 0);
      await scrollToEnd(page);
      await nothingAsked(page, requestTo(isLaterPage("favorites")));
      expect(laterPages).toHaveLength(1);

      // Un-favouriting drops the card at once and it stays dropped (BR-APP-039, `03` §1.11).
      await scrollTo(page, 0);
      const actions = recordRequests(page, isServerAction);
      const dropped = pageOne[0];
      const heart = card(page, dropped).locator("[data-fav]");
      await expect(heart).toHaveAttribute("aria-pressed", "true");
      await expect(heart).toHaveAccessibleName("Убрать из избранного");
      let saved = page.waitForResponse((response) => isServerAction(response.request()));
      await heart.click();
      await expect(card(page, dropped)).toHaveCount(0);
      await expect(cards(page)).toHaveCount(24);
      await saved;
      expect(actions).toHaveLength(1);
      expect(actions[0].postData() ?? "").toContain(`{"number":${dropped},"on":false}`);
      await expect(card(page, dropped)).toHaveCount(0);
      await expect(cards(page)).toHaveCount(24);

      // The save fails on the API (`503 source_unavailable` of the stub's DELETE); held until the drop is seen.
      const kept = pageOne[1];
      await setScenario(page, "source_unavailable");
      const slow = await holdActions(page, "/ru/saved");
      saved = page.waitForResponse((response) => isServerAction(response.request()));
      await card(page, kept).locator("[data-fav]").click();
      await expect.poll(() => slow.held()).toBe(1);
      await expect(card(page, kept)).toHaveCount(0);
      await expect(cards(page)).toHaveCount(23);
      slow.release();
      await saved;
      await expect(card(page, kept)).toBeVisible();
      await expect(cards(page)).toHaveCount(24);
      await expect(card(page, kept).locator("[data-fav]")).toHaveAttribute("aria-pressed", "true");
      expect(actions).toHaveLength(2);
      await setScenario(page, null);
      await page.unroute((url) => url.pathname === "/ru/saved");

      // The Heart tab entered again from search re-creates the list from page one: cookie mode adopts the new server
      // render, header mode asks `/bff` once. The card un-favourited in this launch stays out of it.
      await tab(page, "search").click();
      await expect(page).toHaveURL(/\/ru(\?|$)/);
      await expect(route(page, "feed")).toBeVisible();
      const firstPagesAgain = recordRequests(page, requestTo(isPageOne("favorites")));
      const rendersAgain = recordRequests(page, isRenderOf("/ru/saved"));
      await enterFavorites(page);
      await expect(cards(page)).toHaveCount(19);
      expect(await numbersOf(page)).toEqual(pageOne.filter((number) => number !== dropped));
      if (mode === "cookie") {
        await expect.poll(() => rendersAgain.length).toBe(1);
        await nothingAsked(page, requestTo(isList("favorites")));
        expect(firstPagesAgain).toEqual([]);
      } else {
        await expect.poll(() => firstPagesAgain.length).toBe(1);
        await nothingAsked(page, requestTo(isList("favorites")));
        expect(firstPagesAgain).toHaveLength(1);
      }
    });

    test("pull-to-refresh asks for page one again; a later page that repeats its cursor ends the list after one request", { annotation: [{ type: "screen", description: "SCR-010" }] }, async ({ page }) => {
      await open(page, mode);
      await enterFavorites(page);
      await expect(cards(page)).toHaveCount(20);
      if (mode === "header") {
        // The first read answered; nothing of it is still in flight when the recording starts.
        await page.waitForLoadState("networkidle");
      }
      const firstPages = recordRequests(page, requestTo(isPageOne("favorites")));
      const laterPages = recordRequests(page, requestTo(isLaterPage("favorites")));
      const answers = recordAnswers(page, "favorites");
      // Every later page answers with the cursor it was asked with as its next one (LB-APP-022).
      await page.route(isLaterPage("favorites"), async (handled) => {
        const response = await handled.fetch();
        const body = (await response.json()) as { meta: Record<string, unknown> };
        body.meta.next_cursor = new URL(handled.request().url()).searchParams.get("cursor");
        await handled.fulfill({ response, json: body });
      });

      // In cookie mode page one came with the server's render: the pull is the list's first read through `/bff`.
      await pull(page);
      await expect.poll(() => firstPages.length).toBe(1);
      await expect.poll(() => answers.length).toBe(1);
      expect(answers[0].next).toEqual(expect.any(String));
      await expect(cards(page)).toHaveCount(20);

      await scrollToEnd(page);
      await expect.poll(() => laterPages.length).toBe(1);
      expect(new URL(laterPages[0].url()).searchParams.get("cursor")).toBe(answers[0].next);
      await expect.poll(() => answers.length).toBe(2);
      expect(answers[1].next).toBe(answers[1].cursor);
      await expect(cards(page)).toHaveCount(25);

      // The repeated cursor ended the list: no loop, and another scroll to the end asks for nothing.
      await nothingAsked(page, requestTo(isList("favorites")));
      await scrollTo(page, 0);
      await scrollToEnd(page);
      await nothingAsked(page, requestTo(isList("favorites")));
      expect(laterPages).toHaveLength(1);
      expect(firstPages).toHaveLength(1);
      await expect(cards(page)).toHaveCount(25);
    });

    test("«Смотрели» shows history without the eye under «Очистить»; Cancel sends nothing, a failed clear keeps the list, OK empties it and a pull brings it back", { annotation: [{ type: "screen", description: "SCR-010" }, { type: "screen", description: "SCR-043" }] }, async ({
      page,
    }) => {
      const app = await open(page, mode);
      await enterFavorites(page);
      await expect(cards(page)).toHaveCount(20);
      const firstPages = recordRequests(page, requestTo(isPageOne("history")));
      const renders = recordRequests(page, isRenderOf("/ru/saved/history"));
      const answers = recordAnswers(page, "history");

      await enterHistory(page);
      await expect(cards(page)).toHaveCount(20);
      await expect.poll(() => backVisible(page)).toBe(false);
      await expect(page.locator("[data-demo-marker]")).toBeVisible();
      if (mode === "cookie") {
        expect(renders).toHaveLength(1);
        const rendered = (await (await renders[0].response())?.text()) ?? "";
        expect(rendered).toContain('"source":"stub"');
        for (const number of await numbersOf(page)) {
          expect(rendered).toContain(`"number":${number}`);
        }
        await nothingAsked(page, requestTo(isList("history")));
        expect(firstPages).toEqual([]);
      } else {
        await expect.poll(() => answers.length).toBe(1);
        expect(firstPages).toHaveLength(1);
        expect(answers[0].source).toBe("stub");
      }
      // Every stub history item is `viewed`; the list never shows the eye (BR-APP-040).
      await expect(visible(page, "article[data-listing] [data-viewed]")).toHaveCount(0);
      // The tool row stands first in the list, above the first card.
      await expect(clearButton(page)).toHaveText("Очистить");
      await expect(clearButton(page)).toBeEnabled();
      const row = await tools(page).boundingBox();
      const first = await cards(page).first().boundingBox();
      expect(row !== null && first !== null && row.y + row.height <= first.y).toBe(true);

      // Cancel: the question, then nothing is sent.
      const actions = recordRequests(page, isServerAction);
      await answerConfirm(page, false);
      await clearButton(page).click();
      await expect.poll(() => confirms(app)).toEqual(["Очистить историю просмотров?"]);
      await nothingAsked(page, isServerAction);
      expect(actions).toEqual([]);
      await expect(cards(page)).toHaveCount(20);
      await expect(clearButton(page)).toBeEnabled();

      // A failed clear (`503 source_unavailable` of the stub's DELETE): disabled while it runs, then the list stays,
      // the error haptic plays and the button works again.
      await answerConfirm(page, true);
      await setScenario(page, "source_unavailable");
      const slow = await holdActions(page, "/ru/saved/history");
      let cleared = page.waitForResponse((response) => isServerAction(response.request()));
      await clearButton(page).click();
      await expect.poll(() => slow.held()).toBe(1);
      await expect(clearButton(page)).toBeDisabled();
      slow.release();
      await cleared;
      await expect.poll(() => notifications(app, "error")).toBe(1);
      await setScenario(page, null);
      await page.unroute((url) => url.pathname === "/ru/saved/history");
      expect(actions).toHaveLength(1);
      await expect(clearButton(page)).toBeEnabled();
      await expect(cards(page)).toHaveCount(20);

      // OK: `DELETE /history` answers 204, the list gives way to the empty state with no read and no tool row.
      cleared = page.waitForResponse((response) => isServerAction(response.request()));
      await clearButton(page).click();
      await cleared;
      expect(actions).toHaveLength(2);
      expect(await confirms(app)).toHaveLength(3);
      const empty = visible(page, '[data-feed="history"] [data-empty="history"]');
      await expect(empty.locator('[data-slot="empty-state-title"]')).toHaveText("Вы ещё ничего не открывали");
      await expect(tools(page)).toHaveCount(0);
      await expect(cards(page)).toHaveCount(0);
      await expect.poll(() => notifications(app, "success")).toBe(1);
      await nothingAsked(page, requestTo(isList("history")));

      // A pull re-creates the list from page one; the stubs are static, so the 20 come back with their tool row.
      const pulled = recordRequests(page, requestTo(isList("history")));
      await pull(page);
      await expect.poll(() => pulled.length).toBe(1);
      expect(new URL(pulled[0].url()).searchParams.has("cursor")).toBe(false);
      await expect(cards(page)).toHaveCount(20);
      await expect(clearButton(page)).toBeVisible();
    });

    test("«Смотрели» after a listing opened from the feed is read again; Back from a history card not seen in this launch asks once, from a seen one not", async ({
      page,
    }) => {
      await open(page, mode, "/");
      await expect(cards(page).first()).toBeVisible();
      await enterFavorites(page);
      await expect(cards(page)).toHaveCount(20);
      await enterHistory(page);
      await expect(cards(page)).toHaveCount(20);
      const historyNumbers = await numbersOf(page);

      // A listing opened from the feed: the launch's `seen` map grows.
      await tab(page, "search").click();
      await expect(page).toHaveURL(/\/ru$/);
      await expect(route(page, "feed")).toBeVisible();
      await expect(cards(page).first()).toBeVisible();
      const opened = Number(await cards(page).first().getAttribute("data-listing"));
      await openAndBack(page, opened, /\/ru$/);

      // The Heart tab enters the page again: cookie mode adopts the server's render, header mode asks `/bff` once.
      const reads = recordRequests(page, requestTo(isList("history")));
      const renders = recordRequests(page, isRenderOf("/ru/saved/history"));
      await tab(page, "saved").click();
      await expect(page).toHaveURL(/\/ru\/saved\/history$/);
      await expect(route(page, "saved/history")).toBeVisible();
      await expect(cards(page)).toHaveCount(20);
      if (mode === "cookie") {
        await expect.poll(() => renders.length).toBe(1);
        await nothingAsked(page, requestTo(isList("history")));
        expect(reads).toEqual([]);
      } else {
        await expect.poll(() => reads.length).toBe(1);
        await nothingAsked(page, requestTo(isList("history")));
        expect(reads).toHaveLength(1);
      }

      // A history card not seen in this launch: nothing while its listing covers the list, one read on Back.
      const unseen = historyNumbers.find((number) => number !== opened) ?? 0;
      const readsBack = recordRequests(page, requestTo(isList("history")));
      const rendersBack = recordRequests(page, isRenderOf("/ru/saved/history"));
      await card(page, unseen).locator("a").click();
      await expect(page).toHaveURL(new RegExp(`/ru/listing/${unseen}$`));
      await expect(listingLayer(page, unseen)).toBeVisible();
      await nothingAsked(page, requestTo(isList("history")));
      expect(readsBack).toEqual([]);
      await press(page, "backButtonClicked");
      await expect(page).toHaveURL(/\/ru\/saved\/history$/);
      await expect(visible(page, '[data-route="listing"]')).toHaveCount(0);
      await expect.poll(() => readsBack.length).toBe(1);
      expect(new URL(readsBack[0].url()).searchParams.has("cursor")).toBe(false);
      await expect(cards(page)).toHaveCount(20);
      await nothingAsked(page, requestTo(isList("history")));
      expect(readsBack).toHaveLength(1);
      expect(rendersBack).toEqual([]);

      // The same card again: already seen, so Back keeps the list.
      const readsSeen = recordRequests(page, requestTo(isList("history")));
      await openAndBack(page, unseen, /\/ru\/saved\/history$/);
      await expect(cards(page)).toHaveCount(20);
      await nothingAsked(page, requestTo(isList("history")));
      expect(readsSeen).toEqual([]);
    });

    test("the scenario `empty`: favourites show the mascot and «Здесь пока пусто», history «Вы ещё ничего не открывали» and no «Очистить»", async ({
      page,
    }) => {
      await setScenario(page, "empty");
      await open(page, mode);

      await enterFavorites(page);
      const favorites = visible(page, '[data-feed="favorites"] [data-empty="favorites"]');
      await expect(favorites.locator('[data-slot="empty-state-title"]')).toHaveText("Здесь пока пусто");
      await expect(favorites.locator('[data-slot="empty-state-hint"]')).toHaveText("Нажмите ♡ на объявлении, чтобы сохранить его");
      await expect(favorites.locator('[data-slot="empty-state-image"]')).toHaveAttribute("src", /\/brand\/empty-shrug\.svg$/);
      await expect(cards(page)).toHaveCount(0);

      await enterHistory(page);
      const history = visible(page, '[data-feed="history"] [data-empty="history"]');
      await expect(history.locator('[data-slot="empty-state-title"]')).toHaveText("Вы ещё ничего не открывали");
      await expect(history.locator('[data-slot="empty-state-hint"]')).toHaveText("Здесь будут объявления, которые вы смотрели");
      await expect(history.locator('[data-slot="empty-state-image"]')).toHaveAttribute("src", /\/brand\/empty-shrug\.svg$/);
      await expect(cards(page)).toHaveCount(0);
      await expect(tools(page)).toHaveCount(0);
      await expect.poll(() => backVisible(page)).toBe(false);
      await setScenario(page, null);
    });
  });
}
