import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { defaultFilters, resolveRules, type SearchFilters, toRadarFilters } from "@homi/search";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { type ComponentProps, createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BffOptions } from "@/lib/api/browser";
import type { UiError } from "@/lib/api/errors";
import type { ApiResult } from "@/lib/api/types";

/** The Server Actions the flow calls; each test answers them. `invoke` of the fake deps calls them with the input. */
const actions = vi.hoisted(() => ({
  createRadar: vi.fn(),
  replaceRadar: vi.fn(),
  patchRadar: vi.fn(),
  relaxRadar: vi.fn(),
  deleteRadar: vi.fn(),
}));
/** The `GET /radars` answers of the hook's `fetchRadarList`, in turn; `[]` when none is queued. */
const lists = vi.hoisted(() => ({ answers: [] as ApiResult<unknown>[], sent: [] as { path: string; query: BffOptions["query"] }[] }));

vi.mock("@/lib/actions/radars", () => actions);
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string, options: BffOptions = {}) => {
    lists.sent.push({ path, query: options.query });
    return Promise.resolve(lists.answers.shift() ?? { ok: true, data: [], meta: { source: "stub" } });
  },
}));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn(async () => false) }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: "ready", renewed: false }) }));
vi.mock("@/lib/data/sources", () => ({ reportSource: vi.fn() }));
/** The real chat-access flow (tested in `tests/telegram/chatAccess.test.ts`), watched: which writes go through it. */
vi.mock("@/lib/telegram/chatAccess", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/telegram/chatAccess")>();
  return { ...real, withChatAccess: vi.fn(real.withChatAccess) };
});

import { normalizeRadar, type Radar } from "@/features/radars/normalize";
import {
  resetSubscribes,
  runRelax,
  runSaveEdit,
  runSubscribe,
  type SubscribeDeps,
  useSubscribe,
} from "@/features/radars/subscribe";
import * as toasts from "@/features/radars/toasts";
import { RADARS_KEY } from "@/features/radars/useRadars";
import { readResource, resetResources, seedResource } from "@/lib/data/useResource";
import type { DevFlags } from "@/lib/flags";
import { resetReference } from "@/lib/reference/useReference";
import { withChatAccess } from "@/lib/telegram/chatAccess";
import { currentToast, dismissToast, type ToastMessage } from "@/lib/ui/toast";

import { withDevFlags } from "../helpers/flags";
import { translator } from "../helpers/listing";
import { feedReference } from "../helpers/reference";

const A = "01JD0000000000000000000001";
const B = "01JD0000000000000000000002";
/** The radar `POST /radars` creates on stubs (`radars/created.json`). */
const NEW = "01JD0000000000000000000004";
const RESTART = "Перезапустите бота";
const LOCALES: readonly Locale[] = ["ru", "uz", "en"];

/** The search of most cases: two-room long-term rent in Tashkent, published within 7 days. */
const SEARCH: SearchFilters = { ...defaultFilters("rent_long"), rooms_min: 2, rooms_max: 2, posted_days: 7 };
const OTHER: SearchFilters = { ...defaultFilters("sale"), rooms_min: 3 };

const PRICE_MORE = { code: "price_more", label: "до $700", rate: "≈5 в день", count: 12 };
const DISTRICTS_ALL = { code: "districts_all", label: "все районы", rate: "≈12 в день", count: null };

function raw(id: string, filters: unknown, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, active: true, mode: "instant", hidden: 0, created_at: "2026-11-10T06:00:00+00:00", filters, ...overrides };
}

const radarOf = (id: string, filters: unknown, overrides: Record<string, unknown> = {}): Radar => normalizeRadar(raw(id, filters, overrides))!;
const ok = (data: unknown): ApiResult<unknown> => ({ ok: true, data, meta: { source: "stub" } });
const failed = (error: UiError, status: number, code?: string): ApiResult<unknown> => ({
  ok: false,
  error,
  status,
  ...(code === undefined ? {} : { code }),
  method: "ACTION",
  path: "radars",
});
const NO_CHAT = failed("conflict", 409, "no_chat");
/** `POST /radars` / `PUT /radars/{id}` answers: a created radar with nothing found yet, unless overridden. */
const mutation = (overrides: Record<string, unknown> = {}) => ({ radar: raw(NEW, SEARCH), kind: "created", starter: 0, options: [], relaxed: [], ...overrides });

type FakeDeps = SubscribeDeps & {
  listRadars: ReturnType<typeof vi.fn<() => Promise<Radar[] | null>>>;
  cached: ReturnType<typeof vi.fn<() => Radar[] | undefined>>;
  onSuccess: ReturnType<typeof vi.fn<() => void>>;
  relax: ReturnType<typeof vi.fn<(id: string, code: string) => Promise<unknown>>>;
};

/** The deps `useSubscribe()` binds, as fakes: an empty fresh list, no cache, the ru catalogue, the default rules. */
function depsOf(overrides: Partial<SubscribeDeps> = {}): FakeDeps {
  return {
    invoke: (action, input) => action(input),
    listRadars: vi.fn(async () => [] as Radar[] | null),
    cached: vi.fn(() => undefined as Radar[] | undefined),
    t: translator("ru"),
    locale: "ru",
    rules: resolveRules(),
    limit: 10,
    restartText: RESTART,
    onSuccess: vi.fn(),
    relax: vi.fn(async () => ({ ok: true })),
    ...overrides,
  } as FakeDeps;
}

/** What a toast reads in `locale`: a ready text as it is, a key through the catalogue. */
function textOf(message: ToastMessage | null | undefined, locale: Locale = "ru"): string {
  if (message === null || message === undefined) {
    return "";
  }
  if (typeof message === "string") {
    return message;
  }
  return "text" in message ? message.text : translator(locale)(message.key, message.values);
}

/** The «Расширить» of an action toast. */
function actionOf(message: ToastMessage | null | undefined): { action: string; run: () => void | Promise<unknown> } {
  if (message === null || message === undefined || typeof message !== "object" || !("action" in message)) {
    throw new Error(`no action toast: ${JSON.stringify(message)}`);
  }
  return message;
}

/** Every Server Action the flow called, with its input, in order. */
function written(): [string, unknown][] {
  return Object.entries(actions).flatMap(([name, spy]) => spy.mock.calls.map((call): [string, unknown] => [name, call[0]]));
}

/** Writes that went through the chat-access flow, by the restart text they carried. */
const throughChatAccess = () => vi.mocked(withChatAccess).mock.calls.map(([, options]) => options);

let fake: FakeTelegram | null = null;
const haptics = () =>
  (fake?.calls ?? []).filter((entry) => entry.member === "HapticFeedback.notificationOccurred").map((entry) => entry.args[0]);

beforeEach(() => {
  resetSubscribes();
  resetResources();
  lists.answers.length = 0;
  lists.sent.length = 0;
  fake = fakeTelegram({ version: "8.0", answers: { writeAccess: false } });
});

afterEach(() => {
  cleanup();
  dismissToast("app");
  dismissToast("sheet");
  resetReference();
  fake?.uninstall();
  fake = null;
});

describe("toasts.ts: one function per outcome of the table (BR-APP-041, BR-APP-042)", () => {
  const t = translator("ru");
  const run = vi.fn();

  it("ru: the texts of the spec, the placeholders filled", () => {
    expect(textOf(toasts.alreadyOnToast())).toBe("Радар по этому поиску уже включён");
    expect(textOf(toasts.alertOnToast())).toBe("Радар снова включён");
    expect(textOf(toasts.savedToast(3, "ru", t))).toBe("Радар включён. 3 объявления уже в чате с ботом");
    expect(textOf(toasts.savedFewToast(PRICE_MORE, t, run))).toBe("Радар включён, но таких объявлений мало. до $700: ≈5 в день");
    expect(textOf(toasts.savedEmptyToast([{ text: "обычно 2 в день" }]))).toBe(
      "Радар включён — новые придут в чат, как только появятся — обычно 2 в день",
    );
    expect(textOf(toasts.savedEmptyToast([]))).toBe("Радар включён — новые придут в чат, как только появятся");
    expect(textOf(toasts.updatedToast(21, "ru", t))).toBe("Радар обновлён. 21 объявление под новые условия — в чате с ботом");
    expect(textOf(toasts.updatedFewToast(DISTRICTS_ALL, t, run))).toBe("Радар обновлён, но таких объявлений мало. все районы: ≈12 в день");
    expect(textOf(toasts.updatedEmptyToast([{ text: "обычно 2 в день" }]))).toBe("Радар обновлён. Пока пусто — обычно 2 в день");
    expect(textOf(toasts.updatedEmptyToast([]))).toBe("Радар обновлён. Пока пусто");
    expect(textOf(toasts.relaxedEmptyToast())).toBe("Радар расширен — новые придут в чат, как только появятся");
    expect(textOf(toasts.noChatToast())).toBe("Радар не включён — боту нужно разрешение писать вам в чат");
    expect(textOf(toasts.soonToast())).toBe("Радар скоро заработает");
    expect(textOf(toasts.limitToast(10))).toBe("Уже 10 радаров — удалите ненужный во вкладке «Радар»");
    expect(textOf(toasts.saveFailedToast())).toBe("Не получилось сохранить");
  });

  it("the few toasts carry «Расширить» with the run they were given, and ready text without one", () => {
    const few = actionOf(toasts.savedFewToast(PRICE_MORE, t, run));
    expect(few.action).toBe("Расширить");
    expect(few.run).toBe(run);
    expect(actionOf(toasts.updatedFewToast(PRICE_MORE, t, run)).action).toBe("Расширить");
    expect(toasts.savedFewToast(PRICE_MORE, t, null)).toBe("Радар включён, но таких объявлений мало. до $700: ≈5 в день");
  });

  it.each(LOCALES)("%s: every outcome has a text and no placeholder is left", (locale) => {
    const tl = translator(locale);
    const messages = [
      toasts.alreadyOnToast(),
      toasts.alertOnToast(),
      toasts.savedToast(5, locale, tl),
      toasts.savedFewToast(PRICE_MORE, tl, run),
      toasts.savedEmptyToast([{ text: "x" }]),
      toasts.updatedToast(5, locale, tl),
      toasts.updatedFewToast(PRICE_MORE, tl, run),
      toasts.updatedEmptyToast([]),
      toasts.relaxedEmptyToast(),
      toasts.noChatToast(),
      toasts.soonToast(),
      toasts.limitToast(7),
      toasts.saveFailedToast(),
    ];
    for (const message of messages) {
      const text = textOf(message, locale);
      expect(text, JSON.stringify(message)).not.toBe("");
      expect(text, JSON.stringify(message)).not.toMatch(/[{}]|toast\.|radar\.|common\./);
    }
    expect(textOf(toasts.savedToast(5, locale, tl), locale)).toContain(`5 ${tl("listings", { n: 5 })}`);
    expect(textOf(toasts.limitToast(7), locale)).toContain("7");
  });
});

describe("runSubscribe: the twins of the list (steps 1–3)", () => {
  it("an active twin (posted_days ignored) sends nothing: «…уже включён», ok, no haptic, no re-read after", async () => {
    const twin = radarOf(A, { ...SEARCH, posted_days: null });
    const deps = depsOf({ listRadars: vi.fn(async () => [radarOf(B, OTHER), twin]) });

    const outcome = await runSubscribe(deps, SEARCH, "filters");

    expect(outcome).toEqual({ ok: true, toast: { key: "toast.alreadyOn" }, haptic: null, radar: twin });
    expect(written()).toEqual([]);
    expect(deps.listRadars).toHaveBeenCalledTimes(1);
    expect(deps.onSuccess).not.toHaveBeenCalled();
  });

  it("a paused twin sends one patch through the chat-access flow: «Радар снова включён», the success haptic", async () => {
    const deps = depsOf({ listRadars: vi.fn(async () => [radarOf(B, SEARCH, { active: false })]) });
    actions.patchRadar.mockResolvedValueOnce(ok({ radar: raw(B, SEARCH, { active: true }), starter: 2 }));

    const outcome = await runSubscribe(deps, SEARCH, "few");

    expect(written()).toEqual([["patchRadar", { id: B, active: true }]]);
    expect(throughChatAccess()).toEqual([{ restartText: RESTART }]);
    expect(outcome).toMatchObject({ ok: true, toast: { key: "toast.alertOn" }, haptic: "success" });
    expect(outcome.radar).toMatchObject({ id: B, active: true });
    expect(deps.onSuccess).toHaveBeenCalledTimes(1);
  });

  it("a patch answer without a radar still ends on the twin, switched on", async () => {
    const deps = depsOf({ listRadars: vi.fn(async () => [radarOf(B, SEARCH, { active: false, mode: "digest" })]) });
    actions.patchRadar.mockResolvedValueOnce(ok(null));

    const outcome = await runSubscribe(deps, SEARCH, "few");

    expect(outcome).toMatchObject({ ok: true, toast: { key: "toast.alertOn" }, radar: { id: B, active: true, mode: "digest" } });
  });

  it("a paused twin at the limit: the patch's failure is mapped like a create's", async () => {
    const deps = depsOf({ listRadars: vi.fn(async () => [radarOf(B, SEARCH, { active: false })]), limit: 3 });
    actions.patchRadar.mockResolvedValueOnce(failed("conflict", 409, "radar_limit"));

    await expect(runSubscribe(deps, SEARCH, "filters")).resolves.toEqual({
      ok: false,
      toast: { key: "toast.subLimit", values: { max: 3 } },
      haptic: "error",
    });
    expect(deps.onSuccess).not.toHaveBeenCalled();
  });

  it("a failed re-read falls back to the cached list: an active twin there sends nothing", async () => {
    const twin = radarOf(A, SEARCH);
    const deps = depsOf({ listRadars: vi.fn(async () => null), cached: vi.fn(() => [twin]) });

    await expect(runSubscribe(deps, SEARCH, "filters")).resolves.toMatchObject({ ok: true, toast: { key: "toast.alreadyOn" } });
    expect(deps.cached).toHaveBeenCalledTimes(1);
    expect(written()).toEqual([]);
  });

  it("a failed re-read without a cached list creates", async () => {
    const deps = depsOf({ listRadars: vi.fn(async () => null) });
    actions.createRadar.mockResolvedValueOnce(ok(mutation()));

    await expect(runSubscribe(deps, SEARCH, "filters")).resolves.toMatchObject({ ok: true });
    expect(written().map(([name]) => name)).toEqual(["createRadar"]);
  });

  it("a fresh list wins over the cache: no twin there means a create, whatever the cache holds", async () => {
    const deps = depsOf({ cached: vi.fn(() => [radarOf(A, SEARCH)]) });
    actions.createRadar.mockResolvedValueOnce(ok(mutation()));

    await runSubscribe(deps, SEARCH, "filters");

    expect(deps.cached).not.toHaveBeenCalled();
    expect(written().map(([name]) => name)).toEqual(["createRadar"]);
  });
});

describe("runSubscribe: the create (steps 4–6, 9)", () => {
  it.each(["filters", "empty", "few", "prompt", "feed", "return"] as const)(
    "entry %s reaches the body with the radar filters; no relaxed key without a chosen chip",
    async (entry) => {
      const deps = depsOf();
      actions.createRadar.mockResolvedValueOnce(ok(mutation()));

      await runSubscribe(deps, SEARCH, entry);

      expect(written()).toEqual([["createRadar", { filters: toRadarFilters(SEARCH), entry }]]);
      expect(Object.keys(actions.createRadar.mock.calls[0][0] as object)).toEqual(["filters", "entry"]);
      expect(throughChatAccess()).toEqual([{ restartText: RESTART }]);
    },
  );

  it("the chosen relax chip reaches the body; null and an empty code are left out", async () => {
    actions.createRadar.mockResolvedValue(ok(mutation()));

    await runSubscribe(depsOf(), SEARCH, "filters", "price_more");
    await runSubscribe(depsOf(), SEARCH, "filters", null);
    await runSubscribe(depsOf(), SEARCH, "filters", "");

    expect(actions.createRadar.mock.calls.map(([input]) => (input as { relaxed?: string }).relaxed)).toEqual(["price_more", undefined, undefined]);
    expect(Object.keys(actions.createRadar.mock.calls[1][0] as object)).toEqual(["filters", "entry"]);
  });

  it("posted_days is sent as in the search by default and null with dev005RadarDropsPostedDays", async () => {
    actions.createRadar.mockResolvedValue(ok(mutation()));

    await runSubscribe(depsOf(), SEARCH, "filters");
    await runSubscribe(depsOf({ rules: resolveRules({ dev005RadarDropsPostedDays: true }) }), SEARCH, "filters");

    const sent = actions.createRadar.mock.calls.map(([input]) => (input as { filters: SearchFilters }).filters);
    expect(sent[0].posted_days).toBe(7);
    expect(sent[1].posted_days).toBeNull();
    expect(sent[1]).toEqual(toRadarFilters(SEARCH, { dev005RadarDropsPostedDays: true }));
  });

  it.each([
    ["existing", { key: "toast.alreadyOn" }, null],
    ["reactivated", { key: "toast.alertOn" }, "success"],
  ] as const)("the server's kind %s gives its toast, and the lists are read again", async (kind, toast, haptic) => {
    const deps = depsOf();
    actions.createRadar.mockResolvedValueOnce(ok(mutation({ kind, radar: raw(A, SEARCH) })));

    const outcome = await runSubscribe(deps, SEARCH, "feed");

    expect(outcome).toMatchObject({ ok: true, toast, haptic, radar: { id: A } });
    expect(deps.onSuccess).toHaveBeenCalledTimes(1);
  });

  it.each(LOCALES)("%s: starter > 0 → «Радар включён. {count} уже в чате с ботом» with the plural noun", async (locale) => {
    const t = translator(locale);
    const deps = depsOf({ t, locale });
    actions.createRadar.mockResolvedValueOnce(ok(mutation({ starter: 3, options: [PRICE_MORE] })));

    const outcome = await runSubscribe(deps, SEARCH, "filters");

    expect(outcome).toMatchObject({ ok: true, haptic: "success", radar: { id: NEW } });
    expect(outcome.toast).toEqual({ key: "toast.subSaved", values: { count: `3 ${t("listings", { n: 3 })}` } });
    expect(deps.onSuccess).toHaveBeenCalledTimes(1);
  });

  it("a starter sent as a numeric string still counts (normalizeMutation)", async () => {
    actions.createRadar.mockResolvedValueOnce(ok(mutation({ starter: "12" })));

    expect(textOf((await runSubscribe(depsOf(), SEARCH, "filters")).toast)).toBe("Радар включён. 12 объявлений уже в чате с ботом");
  });

  it("few: the first option with count ≥ 7 is offered, and «Расширить» widens this radar with its code", async () => {
    const deps = depsOf();
    const options = [
      { ...PRICE_MORE, code: "rooms_any", count: 6 },
      { ...DISTRICTS_ALL, count: 7 },
      { ...PRICE_MORE, count: 40 },
    ];
    actions.createRadar.mockResolvedValueOnce(ok(mutation({ options, relaxed: [{ text: "обычно 2 в день" }] })));

    const outcome = await runSubscribe(deps, SEARCH, "filters");
    const toast = actionOf(outcome.toast);

    expect(outcome).toMatchObject({ ok: true, haptic: "success" });
    expect(textOf(outcome.toast)).toBe("Радар включён, но таких объявлений мало. все районы: ≈12 в день");
    expect(toast.action).toBe("Расширить");
    expect(deps.relax).not.toHaveBeenCalled();
    await toast.run();
    expect(deps.relax).toHaveBeenCalledExactlyOnceWith(NEW, "districts_all");
  });

  it("few: without an option of 7 or more, the last one is offered", async () => {
    const deps = depsOf();
    actions.createRadar.mockResolvedValueOnce(ok(mutation({ options: [{ ...PRICE_MORE, count: 6 }, DISTRICTS_ALL] })));

    const outcome = await runSubscribe(deps, SEARCH, "filters");

    expect(textOf(outcome.toast)).toBe("Радар включён, но таких объявлений мало. все районы: ≈12 в день");
    await actionOf(outcome.toast).run();
    expect(deps.relax).toHaveBeenCalledExactlyOnceWith(NEW, "districts_all");
  });

  it("few without a radar in the answer: the text alone, nothing to widen", async () => {
    actions.createRadar.mockResolvedValueOnce(ok(mutation({ radar: null, options: [PRICE_MORE] })));

    const outcome = await runSubscribe(depsOf(), SEARCH, "filters");

    expect(outcome).toEqual({ ok: true, toast: "Радар включён, но таких объявлений мало. до $700: ≈5 в день", haptic: "success" });
  });

  it("empty: the first relaxed condition is the hint, else no hint", async () => {
    actions.createRadar
      .mockResolvedValueOnce(ok(mutation({ relaxed: [{ text: "обычно 2 в день" }, { text: "второе" }] })))
      .mockResolvedValueOnce(ok(mutation({ relaxed: [] })));

    const withHint = await runSubscribe(depsOf(), SEARCH, "filters");
    const without = await runSubscribe(depsOf(), SEARCH, "filters");

    expect(withHint.toast).toEqual({ key: "toast.subSavedEmpty", values: { hint: " — обычно 2 в день" } });
    expect(textOf(without.toast)).toBe("Радар включён — новые придут в чат, как только появятся");
  });

  it.each([
    ["no options and no relaxed", { radar: raw(NEW, SEARCH), kind: "created", starter: 0 }],
    ["options and relaxed null", mutation({ options: null, relaxed: null, starter: null })],
    ["an empty answer", null],
    ["an unknown kind", mutation({ kind: "made" })],
  ])("a success with %s still ends ok with the empty toast (regression of LB-APP-005)", async (_, data) => {
    const deps = depsOf();
    actions.createRadar.mockResolvedValueOnce(ok(data));

    const outcome = await runSubscribe(deps, SEARCH, "filters");

    expect(outcome).toMatchObject({ ok: true, toast: { key: "toast.subSavedEmpty", values: { hint: "" } }, haptic: "success" });
    expect(deps.onSuccess).toHaveBeenCalledTimes(1);
  });
});

describe("runSubscribe: failures (step 7)", () => {
  it.each([
    ["radar_limit", failed("conflict", 409, "radar_limit"), { key: "toast.subLimit", values: { max: 5 } }],
    ["radar_duplicate", failed("conflict", 409, "radar_duplicate"), { key: "toast.alreadyOn" }],
    ["radars_disabled", failed("radars_disabled", 403, "radars_disabled"), { key: "radar.soon.title" }],
    ["another conflict", failed("conflict", 409), { key: "common.saveFailed" }],
    ["offline", failed("offline", 0), { key: "common.saveFailed" }],
    ["a server error", failed("server", 500), { key: "common.saveFailed" }],
    ["a validation error", failed("validation", 422, "validation_failed"), { key: "common.saveFailed" }],
    ["unauthorized", failed("unauthorized", 401, "unauthenticated"), { key: "common.saveFailed" }],
  ])("%s → its toast, ok false, the error haptic; the lists are not read again", async (_, answer, toast) => {
    const deps = depsOf({ limit: 5 });
    actions.createRadar.mockResolvedValueOnce(answer);

    await expect(runSubscribe(deps, SEARCH, "filters")).resolves.toEqual({ ok: false, toast, haptic: "error" });
    expect(deps.onSuccess).not.toHaveBeenCalled();
  });

  it("no_chat, declined in Telegram: «Радар не включён — …» after one request", async () => {
    actions.createRadar.mockResolvedValue(NO_CHAT);

    await expect(runSubscribe(depsOf(), SEARCH, "filters")).resolves.toEqual({ ok: false, toast: { key: "toast.noChat" }, haptic: "error" });
    expect(actions.createRadar).toHaveBeenCalledTimes(1);
    expect(fake?.calls.filter((entry) => entry.member === "requestWriteAccess")).toHaveLength(1);
  });

  it("no_chat, granted in Telegram: the create runs once more and its success is the outcome", async () => {
    fake?.uninstall();
    fake = fakeTelegram({ version: "8.0", answers: { writeAccess: true } });
    actions.createRadar.mockResolvedValueOnce(NO_CHAT).mockResolvedValueOnce(ok(mutation({ starter: 2 })));

    await expect(runSubscribe(depsOf(), SEARCH, "filters")).resolves.toMatchObject({ ok: true, toast: { key: "toast.subSaved" } });
    expect(actions.createRadar).toHaveBeenCalledTimes(2);
  });
});

describe("runSubscribe: one request per search in flight (step 8)", () => {
  it("two calls with one filtersKey (posted_days apart) share the read, the create and the outcome", async () => {
    let answer!: (result: ApiResult<unknown>) => void;
    actions.createRadar.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const deps = depsOf();

    const first = runSubscribe(deps, SEARCH, "filters");
    const second = runSubscribe(deps, { ...SEARCH, posted_days: null }, "few");
    expect(second).toBe(first);
    await act(async () => undefined);
    answer(ok(mutation()));
    const [one, two] = await Promise.all([first, second]);

    expect(two).toBe(one);
    expect(deps.listRadars).toHaveBeenCalledTimes(1);
    expect(actions.createRadar).toHaveBeenCalledTimes(1);
  });

  it("another search is not shared, and a settled one is asked again", async () => {
    actions.createRadar.mockResolvedValue(ok(mutation()));
    const deps = depsOf();

    await Promise.all([runSubscribe(deps, SEARCH, "filters"), runSubscribe(deps, OTHER, "filters")]);
    await runSubscribe(deps, SEARCH, "filters");

    expect(actions.createRadar).toHaveBeenCalledTimes(3);
  });

  it("a failed flow is not kept either", async () => {
    actions.createRadar.mockResolvedValueOnce(failed("server", 500)).mockResolvedValueOnce(ok(mutation()));

    await expect(runSubscribe(depsOf(), SEARCH, "filters")).resolves.toMatchObject({ ok: false });
    await expect(runSubscribe(depsOf(), SEARCH, "filters")).resolves.toMatchObject({ ok: true });
  });
});

describe("runSaveEdit: «Сохранить» of the editor (SCR-029)", () => {
  it("one replace through the chat-access flow with the radar filters, no list read; the relax chip when chosen", async () => {
    const deps = depsOf();
    actions.replaceRadar.mockResolvedValue(ok(mutation({ kind: "updated", radar: raw(A, SEARCH) })));

    await runSaveEdit(deps, A, SEARCH);
    await runSaveEdit(deps, A, SEARCH, "price_more");

    expect(written()).toEqual([
      ["replaceRadar", { id: A, filters: toRadarFilters(SEARCH) }],
      ["replaceRadar", { id: A, filters: toRadarFilters(SEARCH), relaxed: "price_more" }],
    ]);
    expect(throughChatAccess()).toEqual([{ restartText: RESTART }, { restartText: RESTART }]);
    expect(deps.listRadars).not.toHaveBeenCalled();
    expect(deps.onSuccess).toHaveBeenCalledTimes(2);
  });

  it("posted_days null with dev005RadarDropsPostedDays", async () => {
    actions.replaceRadar.mockResolvedValueOnce(ok(mutation({ kind: "updated" })));

    await runSaveEdit(depsOf({ rules: resolveRules({ dev005RadarDropsPostedDays: true }) }), A, SEARCH);

    expect((actions.replaceRadar.mock.calls[0][0] as { filters: SearchFilters }).filters.posted_days).toBeNull();
  });

  it("starter > 0 → «Радар обновлён. {count} под новые условия — в чате с ботом»", async () => {
    actions.replaceRadar.mockResolvedValueOnce(ok(mutation({ kind: "updated", radar: raw(A, SEARCH), starter: 4 })));

    const outcome = await runSaveEdit(depsOf(), A, SEARCH);

    expect(outcome).toMatchObject({ ok: true, haptic: "success", radar: { id: A } });
    expect(textOf(outcome.toast)).toBe("Радар обновлён. 4 объявления под новые условия — в чате с ботом");
  });

  it("few → «Радар обновлён, но …» and «Расширить» widens this radar, also when the answer names none", async () => {
    const deps = depsOf();
    actions.replaceRadar
      .mockResolvedValueOnce(ok(mutation({ kind: "updated", radar: raw(A, SEARCH), options: [PRICE_MORE] })))
      .mockResolvedValueOnce(ok(mutation({ kind: "updated", radar: null, options: [PRICE_MORE] })));

    const named = await runSaveEdit(deps, A, SEARCH);
    const unnamed = await runSaveEdit(deps, B, SEARCH);

    expect(textOf(named.toast)).toBe("Радар обновлён, но таких объявлений мало. до $700: ≈5 в день");
    await actionOf(named.toast).run();
    await actionOf(unnamed.toast).run();
    expect(deps.relax.mock.calls).toEqual([
      [A, "price_more"],
      [B, "price_more"],
    ]);
  });

  it("empty → «Радар обновлён. Пока пусто{hint}»", async () => {
    actions.replaceRadar
      .mockResolvedValueOnce(ok(mutation({ kind: "updated", relaxed: [{ text: "обычно 2 в день" }] })))
      .mockResolvedValueOnce(ok(mutation({ kind: "updated" })));

    expect(textOf((await runSaveEdit(depsOf(), A, SEARCH)).toast)).toBe("Радар обновлён. Пока пусто — обычно 2 в день");
    expect(textOf((await runSaveEdit(depsOf(), A, SEARCH)).toast)).toBe("Радар обновлён. Пока пусто");
  });

  it.each([
    ["radar_duplicate", failed("conflict", 409, "radar_duplicate"), { key: "toast.alreadyOn" }],
    ["no_chat", NO_CHAT, { key: "toast.noChat" }],
    ["radars_disabled", failed("radars_disabled", 403, "radars_disabled"), { key: "radar.soon.title" }],
    ["a server error", failed("server", 500), { key: "common.saveFailed" }],
  ])("%s → its toast, ok false, the error haptic", async (_, answer, toast) => {
    const deps = depsOf();
    actions.replaceRadar.mockResolvedValueOnce(answer);

    await expect(runSaveEdit(deps, A, SEARCH)).resolves.toEqual({ ok: false, toast, haptic: "error" });
    expect(deps.onSuccess).not.toHaveBeenCalled();
  });

  it("an unknown radar → «Не получилось сохранить» and the lists are read again", async () => {
    const deps = depsOf();
    actions.replaceRadar.mockResolvedValueOnce(failed("not_found", 404, "not_found"));

    await expect(runSaveEdit(deps, A, SEARCH)).resolves.toEqual({ ok: false, toast: { key: "common.saveFailed" }, haptic: "error" });
    expect(deps.onSuccess).toHaveBeenCalledTimes(1);
  });
});

describe("runRelax: «Расширить» (widen)", () => {
  it("one relax through the chat-access flow; starter > 0 → «Радар обновлён. {count} …»", async () => {
    const deps = depsOf();
    actions.relaxRadar.mockResolvedValueOnce(ok({ radar: raw(NEW, SEARCH), starter: 3 }));

    const outcome = await runRelax(deps, NEW, "price_more");

    expect(written()).toEqual([["relaxRadar", { id: NEW, code: "price_more" }]]);
    expect(throughChatAccess()).toEqual([{ restartText: RESTART }]);
    expect(outcome).toMatchObject({ ok: true, haptic: "success", radar: { id: NEW } });
    expect(textOf(outcome.toast)).toBe("Радар обновлён. 3 объявления под новые условия — в чате с ботом");
    expect(deps.onSuccess).toHaveBeenCalledTimes(1);
  });

  it("without starter → «Радар расширен — …»", async () => {
    actions.relaxRadar.mockResolvedValueOnce(ok({ radar: raw(NEW, SEARCH) }));

    await expect(runRelax(depsOf(), NEW, "districts_all")).resolves.toMatchObject({
      ok: true,
      toast: { key: "toast.relaxedEmpty" },
      haptic: "success",
    });
  });

  it.each([
    ["radar_duplicate", failed("conflict", 409, "radar_duplicate"), { key: "toast.alreadyOn" }, 0],
    ["no_chat", NO_CHAT, { key: "toast.noChat" }, 0],
    ["radars_disabled", failed("radars_disabled", 403, "radars_disabled"), { key: "radar.soon.title" }, 0],
    ["an unknown radar", failed("not_found", 404, "not_found"), { key: "common.saveFailed" }, 1],
    ["offline", failed("offline", 0), { key: "common.saveFailed" }, 0],
  ])("%s → its toast, ok false, the error haptic", async (_, answer, toast, reloads) => {
    const deps = depsOf();
    actions.relaxRadar.mockResolvedValueOnce(answer);

    await expect(runRelax(deps, NEW, "price_more")).resolves.toEqual({ ok: false, toast, haptic: "error" });
    expect(deps.onSuccess).toHaveBeenCalledTimes(reloads);
  });
});

describe("useSubscribe(): the flow bound to the page", () => {
  function wrapperOf(locale: Locale) {
    // `.ts` without JSX: the provider's props without `children`, which `createElement` passes as its third argument.
    const props = { locale, messages: getMessages(locale), timeZone: "Asia/Tashkent" } as ComponentProps<typeof NextIntlClientProvider>;
    return function Intl({ children }: { children: ReactNode }) {
      return createElement(NextIntlClientProvider, props, children);
    };
  }

  function subscriber(locale: Locale = "ru", flags?: DevFlags) {
    return renderHook(() => useSubscribe(flags === undefined ? undefined : { flags }), { wrapper: wrapperOf(locale) }).result;
  }

  beforeEach(() => {
    feedReference({ reference: { radars_enabled: true, limits: { radars: 4 } } });
  });

  it("ok: the success haptic, then the toast in the app's host — also when the caller passed the sheet", async () => {
    actions.createRadar.mockResolvedValueOnce(ok(mutation({ starter: 3 })));
    const result = subscriber();

    await expect(act(() => result.current.subscribe(SEARCH, "filters", null, { scope: "sheet" }))).resolves.toEqual({ ok: true });

    expect(haptics()).toEqual(["success"]);
    expect(currentToast("app")?.message).toEqual({ key: "toast.subSaved", values: { count: "3 объявления" } });
    expect(currentToast("sheet")).toBeNull();
    expect(lists.sent).toEqual([{ path: "radars", query: undefined }]);
  });

  it("the page's locale reaches the action and the texts; the restart question is the catalogue's", async () => {
    actions.createRadar.mockResolvedValueOnce(ok(mutation({ starter: 3 })));
    const result = subscriber("uz");

    await act(() => result.current.subscribe(SEARCH, "few"));

    expect(actions.createRadar).toHaveBeenCalledExactlyOnceWith({ filters: toRadarFilters(SEARCH), entry: "few" }, undefined, "uz");
    expect(textOf(currentToast("app")?.message, "uz")).toBe(translator("uz")("toast.subSaved", { count: `3 ${translator("uz")("listings", { n: 3 })}` }));
    expect(throughChatAccess()).toEqual([{ restartText: translator("uz")("chat.restart") }]);
  });

  it("a failure: the error haptic and the toast in the caller's scope, the app's by default", async () => {
    actions.createRadar.mockResolvedValue(failed("conflict", 409, "radar_limit"));
    const result = subscriber();

    await expect(act(() => result.current.subscribe(SEARCH, "filters", null, { scope: "sheet" }))).resolves.toEqual({ ok: false });
    expect(currentToast("sheet")?.message).toEqual({ key: "toast.subLimit", values: { max: 4 } });
    expect(currentToast("app")).toBeNull();
    dismissToast("sheet");

    await act(() => result.current.subscribe(SEARCH, "few"));
    expect(currentToast("app")?.message).toEqual({ key: "toast.subLimit", values: { max: 4 } });
    expect(currentToast("sheet")).toBeNull();
    expect(haptics()).toEqual(["error", "error"]);
  });

  it("radar_limit without a usable limits.radars in the reference says 10", async () => {
    feedReference({ reference: { radars_enabled: true, limits: { radars: 0 } } });
    actions.createRadar.mockResolvedValueOnce(failed("conflict", 409, "radar_limit"));
    const result = subscriber();

    await act(() => result.current.subscribe(SEARCH, "filters"));

    expect(textOf(currentToast("app")?.message)).toBe("Уже 10 радаров — удалите ненужный во вкладке «Радар»");
  });

  it("already on: the toast without a haptic (legacy)", async () => {
    lists.answers.push(ok([raw(A, SEARCH)]));
    const result = subscriber();

    await expect(act(() => result.current.subscribe(SEARCH, "filters", null, { scope: "sheet" }))).resolves.toEqual({ ok: true });

    expect(currentToast("app")?.message).toEqual({ key: "toast.alreadyOn" });
    expect(haptics()).toEqual([]);
    expect(written()).toEqual([]);
  });

  it("the rules come from the flags: posted_days null with dev005RadarDropsPostedDays", async () => {
    actions.createRadar.mockResolvedValue(ok(mutation()));

    const dropping = subscriber("ru", withDevFlags({ dev005RadarDropsPostedDays: true }, (flags) => flags));
    const keeping = subscriber("ru");

    await act(() => dropping.current.subscribe(SEARCH, "filters"));
    await act(() => keeping.current.subscribe(SEARCH, "filters"));

    const sent = actions.createRadar.mock.calls.map(([input]) => (input as { filters: SearchFilters }).filters.posted_days);
    expect(sent).toEqual([null, 7]);
  });

  it("callers that share one subscribe get one request, one haptic and one toast", async () => {
    let answer!: (result: ApiResult<unknown>) => void;
    actions.createRadar.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const result = subscriber();
    let shown = 0;
    const { subscribeToasts } = await import("@/lib/ui/toast");
    const stop = subscribeToasts(() => {
      if (currentToast("app") !== null) {
        shown += 1;
      }
    });

    const both = Promise.all([result.current.subscribe(SEARCH, "filters"), result.current.subscribe(SEARCH, "few")]);
    await act(async () => undefined);
    answer(ok(mutation({ starter: 2 })));
    await expect(act(() => both)).resolves.toEqual([{ ok: true }, { ok: true }]);
    stop();

    expect(actions.createRadar).toHaveBeenCalledTimes(1);
    expect(haptics()).toEqual(["success"]);
    expect(shown).toBe(1);
  });

  it("«Расширить» of the few toast widens through the hook and shows the widen's outcome in the app", async () => {
    actions.createRadar.mockResolvedValueOnce(ok(mutation({ options: [PRICE_MORE] })));
    actions.relaxRadar.mockResolvedValueOnce(ok({ radar: raw(NEW, SEARCH), starter: 3 }));
    const result = subscriber();
    await act(() => result.current.subscribe(SEARCH, "filters", null, { scope: "sheet" }));

    await act(async () => {
      await actionOf(currentToast("app")?.message).run();
    });

    expect(actions.relaxRadar).toHaveBeenCalledExactlyOnceWith({ id: NEW, code: "price_more" }, undefined, "ru");
    expect(currentToast("app")?.message).toEqual({ key: "toast.subUpdated", values: { count: "3 объявления" } });
    expect(haptics()).toEqual(["success", "success"]);
  });

  it("saveEdit and relax present their outcomes the same way", async () => {
    actions.replaceRadar.mockResolvedValueOnce(failed("not_found", 404, "not_found"));
    actions.relaxRadar.mockResolvedValueOnce(failed("conflict", 409, "radar_duplicate"));
    const result = subscriber();

    await expect(act(() => result.current.saveEdit(A, SEARCH, null, { scope: "sheet" }))).resolves.toEqual({ ok: false });
    expect(currentToast("sheet")?.message).toEqual({ key: "common.saveFailed" });

    await expect(act(() => result.current.relax(A, "price_more"))).resolves.toEqual({ ok: false });
    expect(currentToast("app")?.message).toEqual({ key: "toast.alreadyOn" });
    expect(haptics()).toEqual(["error", "error"]);
  });

  it("after a success the radar lists are read again; after a failure the fresh read stays", async () => {
    seedResource(RADARS_KEY, [radarOf(B, OTHER)]);
    lists.answers.push(ok([raw(B, OTHER)]), ok([raw(B, OTHER)]));
    actions.createRadar.mockResolvedValueOnce(failed("server", 500)).mockResolvedValueOnce(ok(mutation()));
    const result = subscriber();

    await act(() => result.current.subscribe(SEARCH, "filters"));
    expect(readResource<Radar[]>(RADARS_KEY)?.map((radar) => radar.id)).toEqual([B]);

    await act(() => result.current.subscribe(SEARCH, "filters"));
    // `refreshRadars()`: no list is on screen here, so the entry is forgotten and the next user reads it again.
    expect(readResource(RADARS_KEY)).toBeUndefined();
    expect(lists.sent).toHaveLength(2);
  });
});
