import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ListingPreview } from "@/features/feed/types";
import type { ActionResult } from "@/lib/actions/run";
import type { BffOptions } from "@/lib/api/browser";
import type { UiError } from "@/lib/api/errors";
import type { ApiResult } from "@/lib/api/types";

type Answer = ApiResult<ListingPreview[]>;
type Cleared = ActionResult<null>;

/** One `bffFetch` the list sent; the test answers it when it wants. */
interface Sent {
  path: string;
  query: URLSearchParams;
  resolve: (answer: Answer) => void;
}

const state = vi.hoisted(() => ({
  sent: [] as Sent[],
  status: "ready" as string,
  /** The locale-less address the screen is mounted at. */
  pathname: "/saved/history",
  onForbidden: vi.fn(),
  clearHistory: vi.fn<(input?: undefined, auth?: { token?: string }, locale?: string) => Promise<Cleared>>(),
}));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string, options: BffOptions) =>
    new Promise<Answer>((resolve) => {
      state.sent.push({ path, query: options.query as URLSearchParams, resolve });
    }),
}));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: () => state.onForbidden(), reauthenticate: vi.fn() }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: state.status, renewed: false }) }));
vi.mock("@/lib/actions/favorites", () => ({ setFavorite: vi.fn() }));
vi.mock("@/lib/actions/history", () => ({ clearHistory: state.clearHistory }));
/** The empty state's radar button (WP-30) is tested on its own; here no radar has the search. */
vi.mock("@/features/radars/subscribe", () => ({ useSubscribe: () => ({ subscribe: vi.fn(), saveEdit: vi.fn(), relax: vi.fn() }) }));
vi.mock("@/features/radars/match", () => ({ useHasActiveRadar: () => false }));
vi.mock("next/navigation", () => ({ usePathname: () => `/ru${state.pathname}` }));
/** The counted `Link` needs the App Router: a plain anchor that never navigates. */
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => state.pathname,
  Link: ({ href, prefetch, scroll, ...props }: ComponentProps<"a"> & { href: string; prefetch?: boolean; scroll?: boolean }) => (
    <a {...props} href={href} data-prefetch={String(prefetch)} data-scroll={String(scroll)} />
  ),
}));

import { resetPendingFavorites } from "@/features/feed/FavButton";
import { FIRST_VERSION } from "@/features/feed/feedQuery";
import { HistoryScreen, type HistoryScreenProps } from "@/features/saved/HistoryScreen";
import { savedListKey } from "@/features/saved/listKey";
import { hide, markSeen, resetSessionMaps, useSessionMap } from "@/lib/data/sessionMaps";
import { resetSources } from "@/lib/data/sources";
import { clearAuth, setHeaderAuth } from "@/lib/session/store";
import { refreshHandlerFor } from "@/lib/ui/shellState";
import { currentToast, dismissToast } from "@/lib/ui/toast";

import { withDevFlags } from "../helpers/flags";
import { previewOf } from "../helpers/listing";

/** jsdom has no `IntersectionObserver`; the sentinel is `ListingFeed.test.tsx`'s concern. */
class QuietObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function page(numbers: number[], nextCursor: string | null = null, overrides: (number: number) => Partial<ListingPreview> = () => ({})): Answer {
  return { ok: true, data: numbers.map((number) => previewOf({ number, ...overrides(number) })), meta: { source: "stub", next_cursor: nextCursor } };
}

function failed(error: UiError, status: number): Answer {
  return { ok: false, error, status, method: "GET", path: "history" };
}

const CLEARED: Cleared = { ok: true, data: null, meta: { source: "stub" } };
const NOT_CLEARED: Cleared = { ok: false, error: "source_unavailable", status: 503, code: "source_unavailable", method: "DELETE", path: "history" };

/** The server's page one of the render `renderId`, as `readSaved` keys it. */
const adopted = (answer: Answer, renderId = "r1") => ({ initial: { key: savedListKey("history", renderId, FIRST_VERSION), result: answer } });

const intl = (props: HistoryScreenProps) => (
  <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
    <HistoryScreen {...props} />
  </NextIntlClientProvider>
);

/** The screen as the page renders it; `rerender` keeps the props given so far and adds `next`. */
function screen(props: Partial<HistoryScreenProps> = {}) {
  let all: HistoryScreenProps = { initial: null, renderId: "r1", serverSmallOnly: false, ...props };
  const view = render(intl(all));
  return {
    rerender: (next: Partial<HistoryScreenProps> = {}) => {
      all = { ...all, ...next };
      view.rerender(intl(all));
    },
  };
}

/** The address changes to `pathname`, as the router's render shows it to the screen. */
function goTo(view: ReturnType<typeof screen>, pathname: string) {
  state.pathname = pathname;
  view.rerender();
}

const answer = (index: number, value: Answer) => act(async () => state.sent[index].resolve(value));
/** Lets the confirm's answer and the action's result handler run. */
const settle = () => act(async () => {});
const cards = () => [...document.querySelectorAll<HTMLElement>("article[data-listing]")].map((card) => Number(card.dataset.listing));
const skeletons = () => document.querySelectorAll("[data-card-skeleton]").length;
const tools = () => document.querySelector<HTMLElement>("[data-tools='history']");
const clearButton = () => document.querySelector<HTMLButtonElement>("button[data-clear-history]");
const empty = () => document.querySelector<HTMLElement>("[data-empty='history']");
const pull = () => refreshHandlerFor("/saved/history")?.();
const status = () => document.querySelector<HTMLElement>("[data-cleared-status]")?.textContent ?? null;
const list = () => document.querySelector<HTMLElement>("[data-feed='history']");

let fake: FakeTelegram | null = null;
const haptics = () =>
  (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);
const confirms = () => (fake?.calls ?? []).filter((entry) => entry.member === "showConfirm").map((entry) => entry.args[0]);
const SUCCESS = "HapticFeedback.notificationOccurred(success)";
const ERROR = "HapticFeedback.notificationOccurred(error)";

let scrolls: unknown[][] = [];

beforeEach(() => {
  state.sent.length = 0;
  state.status = "ready";
  state.pathname = "/saved/history";
  state.onForbidden.mockReset();
  state.clearHistory.mockReset();
  scrolls = [];
  fake = fakeTelegram({ version: "8.0", answers: { confirm: true } });
  vi.stubGlobal("IntersectionObserver", QuietObserver);
  vi.spyOn(window, "scrollTo").mockImplementation((...args: unknown[]) => void scrolls.push(args));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  dismissToast("app");
  resetSessionMaps();
  resetSources();
  resetPendingFavorites();
  clearAuth();
  fake?.uninstall();
  fake = null;
});

describe("HistoryScreen: the list (SCR-025)", () => {
  it("adopts the server's page one of its render and asks for nothing; without it, one /bff/history request with no limit", async () => {
    screen(adopted(page([1, 2])));
    expect(cards()).toEqual([1, 2]);
    expect(state.sent).toHaveLength(0);

    cleanup();
    screen({ renderId: "r2" });
    expect(skeletons()).toBe(3);
    expect(tools()).toBeNull();
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].path).toBe("history");
    expect(state.sent[0].query.toString()).toBe("");
    await answer(0, page([3]));
    expect(cards()).toEqual([3]);
  });

  it("never shows the «viewed» eye, and shows the listings hidden in this launch (BR-APP-040, legacy)", () => {
    screen(adopted(page([1, 2], null, () => ({ viewed: true }))));
    act(() => {
      hide([1]);
      markSeen(2);
    });

    expect(cards()).toEqual([1, 2]);
    expect(document.querySelector("[data-viewed]")).toBeNull();
  });

  it("the tool row stands above the first card, right-aligned, with the trash icon and «Очистить»", () => {
    screen(adopted(page([1, 2])));

    expect(tools()?.nextElementSibling?.getAttribute("data-listing")).toBe("1");
    expect(tools()?.className).toContain("justify-end");
    expect(clearButton()?.type).toBe("button");
    expect(clearButton()?.textContent).toBe("Очистить");
    expect(clearButton()?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(clearButton()?.getAttribute("aria-disabled")).toBeNull();
  });

  it("an empty list shows the shrug, «Вы ещё ничего не открывали» and its hint, and no tool row", () => {
    screen(adopted(page([])));

    expect(empty()?.querySelector("[data-slot=empty-state-image]")).not.toBeNull();
    expect(empty()?.querySelector("[data-slot=empty-state-title]")?.textContent).toBe("Вы ещё ничего не открывали");
    expect(empty()?.querySelector("[data-slot=empty-state-hint]")?.textContent).toBe("Здесь будут объявления, которые вы смотрели");
    expect(tools()).toBeNull();
  });

  it.each([
    [false, "the inline «Нет доступа — повторить»", 0],
    [true, "the access screen", 1],
  ] as const)("403 with dev001AnyForbiddenShowsAccess %s: %s", async (on, _what, calls) => {
    screen({ flags: withDevFlags({ dev001AnyForbiddenShowsAccess: on }, (flags) => flags) });
    await answer(0, failed("forbidden", 403));

    expect(document.querySelector("button[data-retry]")?.textContent).toBe("Нет доступа — повторить");
    expect(state.onForbidden).toHaveBeenCalledTimes(calls);
  });
});

describe("HistoryScreen: a listing opened in this launch (SCR-025, D-3)", () => {
  it("re-creates the list once when its address comes back after seen grew: one request, the stale initial ignored", async () => {
    const view = screen(adopted(page([1, 2])));

    // The card's tap marks the listing seen before the listing's layer opens: the list under it stays.
    act(() => markSeen(7));
    expect(state.sent).toHaveLength(0);
    goTo(view, "/listing/7");
    expect(state.sent).toHaveLength(0);
    expect(cards()).toEqual([1, 2]);
    expect(scrolls).toEqual([]);

    goTo(view, "/saved/history");
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].query.has("cursor")).toBe(false);
    expect(cards()).toEqual([]);
    expect(skeletons()).toBe(3);
    expect(scrolls).toEqual([[0, 0]]);
    await answer(0, page([7, 1, 2]));
    expect(cards()).toEqual([7, 1, 2]);

    // Back again with nothing new opened: the list stays.
    goTo(view, "/listing/1");
    goTo(view, "/saved/history");
    expect(state.sent).toHaveLength(1);
    expect(cards()).toEqual([7, 1, 2]);
  });

  it("a listing marked seen while the history address is still shown re-creates nothing", () => {
    const view = screen(adopted(page([1, 2])));

    act(() => {
      markSeen(5);
      markSeen(6);
    });
    view.rerender();

    expect(state.sent).toHaveLength(0);
    expect(cards()).toEqual([1, 2]);
  });

  it("a pull latches the size of seen: the next return with nothing new opened asks for nothing", async () => {
    const view = screen(adopted(page([1, 2])));
    act(() => markSeen(5));

    act(() => {
      void pull();
    });
    expect(state.sent).toHaveLength(1);
    await answer(0, page([5, 1, 2]));

    goTo(view, "/listing/1");
    goTo(view, "/saved/history");
    expect(state.sent).toHaveLength(1);
    expect(cards()).toEqual([5, 1, 2]);
  });

  it("a new server render latches the size of seen anew: its page one is adopted, with no request", () => {
    const view = screen(adopted(page([1, 2])));

    goTo(view, "/saved");
    act(() => markSeen(9));
    state.pathname = "/saved/history";
    view.rerender({ renderId: "r2", ...adopted(page([9, 1, 2]), "r2") });

    expect(cards()).toEqual([9, 1, 2]);
    expect(state.sent).toHaveLength(0);
  });
});

describe("HistoryScreen: pull-to-refresh (BR-APP-058)", () => {
  it("registers for /saved/history only; a pull asks for page one with no cursor and settles when it answered", async () => {
    screen(adopted(page([1, 2], "c1")));
    expect(refreshHandlerFor("/saved")).toBeUndefined();

    let settled = false;
    let refresh: Promise<unknown> | undefined;
    act(() => {
      refresh = pull()?.then(() => (settled = true));
    });
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].query.toString()).toBe("");
    await act(async () => undefined);
    expect(settled).toBe(false);

    await answer(0, page([3]));
    await refresh;
    expect(settled).toBe(true);
    expect(cards()).toEqual([3]);
  });
});

describe("HistoryScreen: «Очистить» (BR-APP-067, TMA-025, TMA-026)", () => {
  it("asks «Очистить историю просмотров?»; Cancel sends nothing and keeps the list", async () => {
    fake!.answers.confirm = false;
    screen(adopted(page([1, 2])));

    fireEvent.click(clearButton()!);
    await settle();

    expect(confirms()).toEqual(["Очистить историю просмотров?"]);
    expect(state.clearHistory).not.toHaveBeenCalled();
    expect(cards()).toEqual([1, 2]);
    expect(clearButton()?.getAttribute("aria-disabled")).toBeNull();
    expect(haptics()).toEqual([]);
  });

  it("taps while the question is open are ignored", async () => {
    fake!.answers.confirm = false;
    screen(adopted(page([1, 2])));

    fireEvent.click(clearButton()!);
    fireEvent.click(clearButton()!);
    await settle();

    expect(confirms()).toHaveLength(1);
  });

  it("OK disables the button while the request runs; success empties the list with the success haptic, no refetch", async () => {
    const clear = deferred<Cleared>();
    state.clearHistory.mockReturnValueOnce(clear.promise);
    screen(adopted(page([1, 2])));

    fireEvent.click(clearButton()!);
    await settle();
    expect(state.clearHistory).toHaveBeenCalledTimes(1);
    expect(state.clearHistory).toHaveBeenCalledWith(undefined, undefined, "ru");
    expect(clearButton()?.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(clearButton()!);
    await settle();
    expect(state.clearHistory).toHaveBeenCalledTimes(1);
    expect(confirms()).toHaveLength(1);

    await act(async () => clear.resolve(CLEARED));
    expect(cards()).toEqual([]);
    expect(tools()).toBeNull();
    expect(empty()?.querySelector("[data-slot=empty-state-title]")?.textContent).toBe("Вы ещё ничего не открывали");
    expect(haptics()).toEqual([SUCCESS]);
    expect(state.sent).toHaveLength(0);
  });

  it("leaves the launch's seen map as it is (Q-API-035)", async () => {
    state.clearHistory.mockResolvedValueOnce(CLEARED);
    let seen: ReadonlySet<number> = new Set();
    function Probe() {
      seen = useSessionMap("seen");
      return null;
    }
    render(<Probe />);
    act(() => markSeen(1));
    screen(adopted(page([1, 2])));

    fireEvent.click(clearButton()!);
    await settle();

    expect(empty()).not.toBeNull();
    expect([...seen]).toEqual([1]);
  });

  it("sends the session's token in header mode", async () => {
    setHeaderAuth("header-token", null);
    state.clearHistory.mockResolvedValueOnce(CLEARED);
    screen(adopted(page([1])));

    fireEvent.click(clearButton()!);
    await settle();

    expect(state.clearHistory).toHaveBeenCalledWith(undefined, { token: "header-token" }, "ru");
  });

  it.each([
    [false, null],
    [true, { key: "common.saveFailed" }],
  ] as const)("a failure keeps the list with the error haptic and enables the button again; dev016ErrorToastOnFailure %s, toast %j", async (on, toast) => {
    state.clearHistory.mockResolvedValueOnce(NOT_CLEARED);
    screen({ ...adopted(page([1, 2])), flags: withDevFlags({ dev016ErrorToastOnFailure: on }, (flags) => flags) });

    fireEvent.click(clearButton()!);
    await settle();

    expect(cards()).toEqual([1, 2]);
    expect(empty()).toBeNull();
    expect(clearButton()?.getAttribute("aria-disabled")).toBeNull();
    expect(haptics()).toEqual([ERROR]);
    expect(currentToast()?.message ?? null).toEqual(toast);
  });

  it("a failed clear shows «Не получилось сохранить» with the default flags (DEC-58)", async () => {
    state.clearHistory.mockResolvedValueOnce(NOT_CLEARED);
    screen(adopted(page([1, 2])));

    fireEvent.click(clearButton()!);
    await settle();

    expect(cards()).toEqual([1, 2]);
    expect(haptics()).toEqual([ERROR]);
    expect(currentToast()?.message).toEqual({ key: "common.saveFailed" });
  });

  it("the next key brings the list back: a pull after a clear asks for page one once and shows its cards", async () => {
    state.clearHistory.mockResolvedValueOnce(CLEARED);
    screen(adopted(page([1, 2])));
    fireEvent.click(clearButton()!);
    await settle();
    expect(empty()).not.toBeNull();

    let refresh: Promise<unknown> | undefined;
    act(() => {
      refresh = pull();
    });
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].query.toString()).toBe("");
    await answer(0, page([1, 2]));
    await expect(refresh).resolves.toBeUndefined();

    expect(cards()).toEqual([1, 2]);
    expect(tools()).not.toBeNull();
  });
});

describe("HistoryScreen: «Очистить» and the list shown when the server answers", () => {
  it("a pull while DELETE /history runs: the list shown when it succeeds is the one cleared", async () => {
    const clear = deferred<Cleared>();
    state.clearHistory.mockReturnValueOnce(clear.promise);
    screen(adopted(page([1, 2])));

    fireEvent.click(clearButton()!);
    await settle();
    act(() => {
      void pull();
    });
    expect(state.sent).toHaveLength(1);
    await answer(0, page([1, 2]));
    expect(cards()).toEqual([1, 2]);

    await act(async () => clear.resolve(CLEARED));
    expect(cards()).toEqual([]);
    expect(empty()).not.toBeNull();
    expect(haptics()).toEqual([SUCCESS]);
  });
});

describe("HistoryScreen: focus and announcements (WCAG 2.4.3, 4.1.3)", () => {
  it("a success moves the focus from the gone button to the empty state, and the status line reads it", async () => {
    state.clearHistory.mockResolvedValueOnce(CLEARED);
    screen(adopted(page([1, 2])));
    expect(status()).toBe("");
    clearButton()!.focus();

    fireEvent.click(clearButton()!);
    await settle();

    expect(empty()).not.toBeNull();
    expect(document.activeElement).toBe(list());
    expect(status()).toBe("Вы ещё ничего не открывали");
  });

  it("the focus stays on the button while the request runs and after a failure", async () => {
    const clear = deferred<Cleared>();
    state.clearHistory.mockReturnValueOnce(clear.promise);
    screen(adopted(page([1, 2])));
    clearButton()!.focus();

    fireEvent.click(clearButton()!);
    await settle();
    expect(clearButton()?.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(clearButton());

    await act(async () => clear.resolve(NOT_CLEARED));
    expect(document.activeElement).toBe(clearButton());
    expect(status()).toBe("");
  });

  it("the return that re-creates the list gives it the focus the gone card would have had back", () => {
    const view = screen(adopted(page([1, 2])));
    document.querySelector<HTMLElement>("article[data-listing='1'] a")!.focus();

    act(() => markSeen(1));
    goTo(view, "/listing/1");
    // The listing's layer had the focus; it is hidden now, so the focus is on nothing the user sees.
    (document.activeElement as HTMLElement).blur();
    goTo(view, "/saved/history");

    expect(state.sent).toHaveLength(1);
    expect(document.activeElement).toBe(list());
  });

  it("a focus the user still sees stays where it is when the list is re-created", () => {
    const view = screen(adopted(page([1, 2])));
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();

    act(() => markSeen(1));
    goTo(view, "/listing/1");
    goTo(view, "/saved/history");

    expect(state.sent).toHaveLength(1);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
