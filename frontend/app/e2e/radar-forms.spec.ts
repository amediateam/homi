import { expect as baseExpect, launchApp, type LaunchedApp, setScenario, shownText, stubMedia, test as base } from "@homi/testing/playwright";
import type { Locator, Page, Request } from "@playwright/test";

/**
 * The new-radar sheet, the radar editor and the survey «Нашли жильё?» of WP-30 (SCR-029, SCR-030, SCR-031,
 * BR-APP-049) against the API on stubs with radars switched on, in cookie and header mode: «+» of the radar tab opens
 * «Новый радар» with the last search, its «Сейчас подходит: N» and «Включить радар», whose success closes it with the
 * created toast; «Изменить условия» opens «Условия радара» over the radar sheet, Back closes the editor, then the
 * sheet, and «Сохранить» closes it with the updated toast; the survey after a pause on a tile, after a pause in the
 * radar sheet and after a delete (the stub scenario `ask_found`, set once the session is ready): every answer of both
 * steps with its closing toast and the body of its Server Action, the congratulations and «Готово». The stub list is
 * stateless, so a radar paused for the survey is switched on again before the next pause. The nudges are silenced
 * before every launch (`homi-nudge`). Every photo is answered by `stubMedia`; each test launches once, as the full run
 * shares one stub user's API limit (KI-32).
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

interface Fake {
  webApp: { BackButton: { isVisible: boolean } };
  emit(eventType: string): void;
}

type Mode = "cookie" | "header";

/** How long a launch may take to sign in and show its first screen. */
const LAUNCH_MS = 30_000;

/** The fixture radars (`radars/list.json`): on, «2-комн. · до $700»; on, sale and digest. */
const ACTIVE = "01JD0000000000000000000001";
const DIGEST = "01JD0000000000000000000003";

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const html = (page: Page) => page.locator("html");
const tab = (page: Page, key: "search" | "radars") => visible(page, `[data-tab="${key}"]`);
const tile = (page: Page, id: string) => visible(page, `[data-radar-tile="${id}"]`);
const tileSwitch = (page: Page, id: string) => tile(page, id).getByRole("switch");
const radarSheet = (page: Page, id: string) => visible(page, `[data-route="radar"][data-layer="sheet"][data-radar-id="${id}"]`);
/** A form's content in its bottom sheet (`radars/new`, `radar/edit`). */
const form = (page: Page, name: string) => visible(page, `[data-slot="bottom-sheet"] [data-route="${name}"][data-layer="sheet"]`);
/** A footer button of the open form (outside the `data-route` content). */
const action = (page: Page, name: "subscribe" | "save") => visible(page, `[data-slot="bottom-sheet"] [data-action="${name}"]`);
const matchingNow = (page: Page) => visible(page, '[data-slot="bottom-sheet"] [data-slot="matching-now"]');
const survey = (page: Page) => visible(page, '[data-route="radars/found"][data-layer="sheet"]');
const appToast = (page: Page) => visible(page, '[data-toast-host="app"] [data-toast]');
const press = (page: Page, eventType: "backButtonClicked") =>
  page.evaluate((type) => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit(type), eventType);
const roomButton = (scope: Locator, label: string) => scope.getByRole("button", { name: label, exact: true });
const address = (page: Page) => {
  const url = new URL(page.url());
  return url.pathname + url.search;
};

/** A Server Action call: a POST to the page's address carrying the `Next-Action` header. */
const isServerAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;
const isCount = (url: URL) => url.pathname === "/bff/listings/count";

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

/** Launches the app as the bot does, in a session mode, and waits for the session. */
async function open(page: Page, mode: Mode, path = "/radars"): Promise<LaunchedApp> {
  await silenceNudges(page);
  const app = await launchApp(page, { mode, path });
  // The servers are shared with other spec runs: a sign-in may queue behind them, and the boot retry covers a refusal.
  await expect(html(page)).toHaveAttribute("data-session", "ready", { timeout: LAUNCH_MS });
  return app;
}

/** The tab with its three tiles on screen and no layer over it. */
async function onTab(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/ru\/radars$/);
  await expect(visible(page, "[data-radar-tile]")).toHaveCount(3);
  await expect(visible(page, "[data-layer]")).toHaveCount(0);
}

/** A tap on the tile opens the radar's sheet over the tab. */
async function openSheet(page: Page, id: string): Promise<void> {
  await tile(page, id).locator("[data-radar-open]").click();
  await expect(page).toHaveURL(new RegExp(`/ru/radars/${id}$`));
  await expect(radarSheet(page, id)).toBeVisible();
}

/** «Изменить условия» of the open radar sheet opens the editor over it, with the radar's filters. */
async function openEditor(page: Page, id: string): Promise<void> {
  await radarSheet(page, id).locator("[data-radar-edit]").click();
  await expect(page).toHaveURL(new RegExp(`/ru/radars/${id}/edit$`));
  await expect(form(page, "radar/edit")).toBeVisible();
}

/**
 * Pauses the radar from its tile for the survey (scenario `ask_found`): a paused tile is switched on first — the stub
 * keeps its list, so the pause of an earlier round is all the app knows — then off, which pushes «Нашли жильё?».
 */
async function pauseForSurvey(page: Page, id: string): Promise<void> {
  const switched = (active: boolean) =>
    page.waitForResponse((response) => isServerAction(response.request()) && (response.request().postData() ?? "").includes(`{"id":"${id}","active":${active}}`));
  for (let attempt = 1; (await tileSwitch(page, id).getAttribute("aria-checked")) === "false"; attempt += 1) {
    // Set-up only: a switch-on lost to the shared API's load (the app reverts it) is tried again.
    expect(attempt, "the radar could not be switched on again").toBeLessThanOrEqual(3);
    const resumed = switched(true);
    await tileSwitch(page, id).click();
    const answer = await resumed;
    const failed = (await answer.text()).includes('"ok":false');
    await expect(tileSwitch(page, id)).toHaveAttribute("aria-checked", failed ? "false" : "true");
  }
  const paused = switched(false);
  await tileSwitch(page, id).click();
  await paused;
  await expect.poll(() => address(page)).toBe("/ru/radars/found?trigger=pause");
  await expect(survey(page)).toHaveAttribute("data-step", "ask");
  await expect(page.getByRole("dialog", { name: "Нашли жильё?" })).toBeVisible();
}

/** The survey closed to the tab and showed `text`; the last Server Action carried `body`. */
async function closedWith(page: Page, text: string, actions: Request[], body: string): Promise<void> {
  await expect(appToast(page)).toHaveText(text);
  await onTab(page);
  await expect.poll(() => actions.at(-1)?.postData() ?? "").toContain(body);
}

for (const mode of ["cookie", "header"] as const) {
  test.describe(`new radar (${mode} mode)`, { annotation: [{ type: "screen", description: "SCR-030" }] }, () => {
    test("«+» opens «Новый радар» with the last search and «Сейчас подходит»; «Включить радар» closes it with the created toast", async ({ page }) => {
      const app = await open(page, mode, "/?rooms_min=2&rooms_max=2");
      await expect(visible(page, "article[data-listing]").first()).toBeVisible();
      await tab(page, "radars").click();
      await onTab(page);
      const counted = page.waitForResponse((response) => isCount(new URL(response.url())));

      const plus = visible(page, '[data-topbar="radars"]').getByRole("link", { name: "Новый радар" });
      const light = await impacts(app, "light");
      await plus.click();
      await expect.poll(() => address(page)).toBe("/ru/radars/new?rooms_min=2&rooms_max=2");
      await expect(page.getByRole("dialog", { name: "Новый радар" })).toBeVisible();
      expect(await impacts(app, "light")).toBe(light + 1);
      const sheet = form(page, "radars/new");
      await expect(roomButton(sheet.locator('[data-section="rooms"]'), "2")).toHaveAttribute("aria-pressed", "true");
      // No «Опубликовано» and no «Показать» in a radar mode.
      await expect(sheet.locator('[data-section="posted"]')).toHaveCount(0);
      await expect(sheet.locator('[data-section="rooms"]')).toBeVisible();
      await expect(visible(page, '[data-slot="bottom-sheet"] [data-action="apply"]')).toHaveCount(0);
      const count = ((await (await counted).json()) as { data: { count: number } }).data.count;
      await expect.poll(() => shownText(matchingNow(page)), { timeout: 20_000 }).toBe(`Сейчас подходит: ${count}`);
      await expect(action(page, "subscribe")).toHaveText("Включить радар");

      const actions = recordRequests(page, isServerAction);
      const release = await holdActions(page);
      const medium = await impacts(app, "medium");
      const success = await notifications(app, "success");
      await action(page, "subscribe").click();
      // The flow re-reads the list, then creates: the button is disabled until the answer.
      await expect.poll(() => actions.length).toBe(1);
      await expect(action(page, "subscribe")).toBeDisabled();
      expect(await impacts(app, "medium")).toBe(medium + 1);
      expect(actions[0].postData() ?? "").toContain('"entry":"empty"');
      expect(actions[0].postData() ?? "").toContain('"rooms_min":2,"rooms_max":2');
      release();

      // The stub's create answers no starter and the relaxed condition «обычно 2 в день» (`radars/created.json`).
      await expect(appToast(page)).toHaveText("Радар включён — новые придут в чат, как только появятся — обычно 2 в день");
      await onTab(page);
      expect(actions).toHaveLength(1);
      expect(await notifications(app, "success")).toBe(success + 1);
    });
  });

  test.describe(`radar editor (${mode} mode)`, { annotation: [{ type: "screen", description: "SCR-029" }] }, () => {
    test("«Изменить условия» opens «Условия радара» with the radar's filters over the sheet; Back closes the editor, then the sheet", async ({ page }) => {
      await open(page, mode);
      await onTab(page);
      await openSheet(page, ACTIVE);
      await openEditor(page, ACTIVE);
      await expect(page.getByRole("dialog", { name: "Условия радара" })).toBeVisible();
      const editor = form(page, "radar/edit");
      await expect(roomButton(editor.locator('[data-section="rooms"]'), "2")).toHaveAttribute("aria-pressed", "true");
      await expect(editor.locator('[data-section="posted"]')).toHaveCount(0);
      await expect.poll(() => shownText(matchingNow(page)), { timeout: 20_000 }).toMatch(/^Сейчас подходит: \d+$/);
      await expect(action(page, "save")).toHaveText("Сохранить");
      await expect(visible(page, '[data-slot="bottom-sheet"] [data-action="subscribe"]')).toHaveCount(0);
      // The editor is portalled next to the radar sheet, which stays mounted under it.
      await expect(page.locator(`[data-route="radar"][data-layer="sheet"][data-radar-id="${ACTIVE}"]`)).toBeAttached();

      await press(page, "backButtonClicked");
      await expect(page).toHaveURL(new RegExp(`/ru/radars/${ACTIVE}$`));
      await expect(visible(page, '[data-route="radar/edit"]')).toHaveCount(0);
      await expect(radarSheet(page, ACTIVE)).toBeVisible();

      await press(page, "backButtonClicked");
      await onTab(page);
    });

    test("«Сохранить» replaces the radar's filters and closes the editor to the sheet with «Радар обновлён. Пока пусто»", async ({ page }) => {
      const app = await open(page, mode);
      await onTab(page);
      await openSheet(page, ACTIVE);
      await openEditor(page, ACTIVE);
      const editor = form(page, "radar/edit");
      await roomButton(editor.locator('[data-section="rooms"]'), "3").click();
      await expect(roomButton(editor.locator('[data-section="rooms"]'), "3")).toHaveAttribute("aria-pressed", "true");

      const actions = recordRequests(page, isServerAction);
      const release = await holdActions(page);
      const medium = await impacts(app, "medium");
      await action(page, "save").click();
      await expect.poll(() => actions.length).toBe(1);
      await expect(action(page, "save")).toBeDisabled();
      expect(await impacts(app, "medium")).toBe(medium + 1);
      const body = actions[0].postData() ?? "";
      expect(body).toContain(`"id":"${ACTIVE}"`);
      expect(body).toContain('"districts":["yunusobod","mirobod"]');
      // A second room button widens the range (`RoomsPicker`): 2–3.
      expect(body).toContain('"rooms_min":2,"rooms_max":3');
      expect(body).toContain('"price_max":700');
      expect(body).not.toContain('"entry"');
      release();

      // The stub's replace answers no starter, no options and no relaxed condition (`radars/updated.json`).
      await expect(appToast(page)).toHaveText("Радар обновлён. Пока пусто");
      await expect(page).toHaveURL(new RegExp(`/ru/radars/${ACTIVE}$`));
      await expect(visible(page, '[data-route="radar/edit"]')).toHaveCount(0);
      await expect(radarSheet(page, ACTIVE)).toBeVisible();
      expect(actions).toHaveLength(1);

      await press(page, "backButtonClicked");
      await onTab(page);
    });
  });

  test.describe(`survey «Нашли жильё?» (${mode} mode)`, { annotation: [{ type: "screen", description: "SCR-031" }] }, () => {
    test("a pause on a tile answered ask_found pushes the survey: «Ещё ищу», «Больше не ищу», «Да, через HOMI» → «Готово»", async ({ page }) => {
      const app = await open(page, mode);
      await onTab(page);
      await setScenario(page, "ask_found");
      const actions = recordRequests(page, isServerAction);

      await pauseForSurvey(page, ACTIVE);
      await expect(survey(page)).toContainText("Подскажите одной кнопкой — так мы поймём, помогает ли HOMI искать.");
      await expect(survey(page).locator("[data-found]")).toHaveText(["Да, через HOMI", "Да, в другом месте", "Ещё ищу", "Больше не ищу"]);
      // No × on the survey.
      await expect(visible(page, '[data-slot="bottom-sheet-close"]')).toHaveCount(0);
      await survey(page).locator('[data-found="searching"]').click();
      await closedWith(page, "Удачи в поиске! Радар можно снова включить в любой момент", actions, '{"answer":"searching","trigger":"pause"}');

      await pauseForSurvey(page, ACTIVE);
      await survey(page).locator('[data-found="stopped"]').click();
      await closedWith(page, "Понятно, спасибо! Радар можно снова включить в любой момент", actions, '{"answer":"stopped","trigger":"pause"}');

      await pauseForSurvey(page, ACTIVE);
      const success = await notifications(app, "success");
      await survey(page).locator('[data-found="homi"]').click();
      await expect(survey(page)).toHaveAttribute("data-step", "done");
      await expect(page.getByRole("dialog", { name: "Поздравляем с новосельем!" })).toBeVisible();
      await expect(survey(page)).toContainText("Спасибо, что рассказали. Если HOMI помог — расскажите друзьям, им тоже пригодится.");
      expect(await notifications(app, "success")).toBe(success + 1);
      await expect.poll(() => actions.at(-1)?.postData() ?? "").toContain('{"answer":"homi","trigger":"pause"}');
      // «Рассказать друзьям» needs HOMI's bot (`NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`), which the e2e build leaves empty.
      await expect(survey(page).locator('[data-action="share"]')).toHaveCount(0);
      const sent = actions.length;
      await survey(page).locator('[data-action="done"]').click();
      await onTab(page);
      await nothingAsked(page, isServerAction);
      expect(actions).toHaveLength(sent);
    });

    test("«Да, в другом месте» → «Где нашли?»: each of the seven places shows «Поздравляем!» without a toast; «Готово» closes to the tab (WP-39)", async ({ page }) => {
      // Seven rounds of pause, survey and answer.
      test.setTimeout(120_000);
      await open(page, mode);
      await onTab(page);
      await setScenario(page, "ask_found");
      const actions = recordRequests(page, isServerAction);
      const places = [
        ["telegram", "Другой Telegram-канал"],
        ["olx", "OLX"],
        ["site", "Другой сайт (Uybor, Uysot…)"],
        ["agent", "Через риелтора"],
        ["friends", "Знакомые подсказали"],
        ["street", "Объявление на доме или на улице"],
        ["other", "Другое"],
      ] as const;

      for (const [index, [code, label]] of places.entries()) {
        await pauseForSurvey(page, index % 2 === 0 ? ACTIVE : DIGEST);
        await survey(page).locator('[data-found="elsewhere"]').click();
        await expect(survey(page)).toHaveAttribute("data-step", "where");
        await expect(page.getByRole("dialog", { name: "Где нашли?" })).toBeVisible();
        await expect.poll(() => actions.at(-1)?.postData() ?? "").toContain('{"answer":"elsewhere","trigger":"pause"}');
        await expect(survey(page).locator("[data-where]")).toHaveCount(7);
        await expect(survey(page).locator(`[data-where="${code}"]`)).toHaveText(label);
        await survey(page).locator(`[data-where="${code}"]`).click();
        await expect(survey(page)).toHaveAttribute("data-step", "moved");
        await expect(page.getByRole("dialog", { name: "Поздравляем!" })).toBeVisible();
        await expect(survey(page)).toContainText("Спасибо, что рассказали — это помогает нам стать лучше.");
        await expect.poll(() => actions.at(-1)?.postData() ?? "").toContain(`{"where":"${code}"}`);
        await expect(appToast(page)).toHaveCount(0);
        await survey(page).locator('[data-action="done"]').click();
        await onTab(page);
        await expect(appToast(page)).toHaveCount(0);
      }
    });

    test("a pause in the radar sheet replaces it with the survey; Telegram's Back closes the survey to the tab and sends nothing", async ({ page }) => {
      await open(page, mode);
      await onTab(page);
      await openSheet(page, ACTIVE);
      await setScenario(page, "ask_found");
      const actions = recordRequests(page, isServerAction);

      await radarSheet(page, ACTIVE).getByRole("switch").click();
      await expect.poll(() => address(page)).toBe("/ru/radars/found?trigger=pause");
      await expect(survey(page)).toHaveAttribute("data-step", "ask");
      await expect(visible(page, '[data-route="radar"]')).toHaveCount(0);
      expect(actions).toHaveLength(1);
      expect(actions[0].postData() ?? "").toContain(`{"id":"${ACTIVE}","active":false}`);

      await press(page, "backButtonClicked");
      await onTab(page);
      await nothingAsked(page, isServerAction);
      expect(actions).toHaveLength(1);
    });

    test("a delete answered ask_found replaces the sheet with the survey of the trigger delete", async ({ page }) => {
      await open(page, mode);
      await onTab(page);
      await openSheet(page, DIGEST);
      await setScenario(page, "ask_found");
      const actions = recordRequests(page, isServerAction);

      await radarSheet(page, DIGEST).locator("[data-radar-delete]").click();
      await expect.poll(() => address(page)).toBe("/ru/radars/found?trigger=delete");
      await expect(survey(page)).toHaveAttribute("data-step", "ask");
      await expect(visible(page, '[data-route="radar"]')).toHaveCount(0);
      expect(actions[0].postData() ?? "").toContain(`{"id":"${DIGEST}"}`);

      await survey(page).locator('[data-found="stopped"]').click();
      await expect(appToast(page)).toHaveText("Понятно, спасибо! Радар можно снова включить в любой момент");
      await expect(page).toHaveURL(/\/ru\/radars$/);
      await expect(visible(page, "[data-layer]")).toHaveCount(0);
      // The deleted radar left the list; the stub keeps it on the server.
      await expect(tile(page, DIGEST)).toHaveCount(0);
      await expect.poll(() => actions.at(-1)?.postData() ?? "").toContain('{"answer":"stopped","trigger":"delete"}');
    });
  });
}
