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
type Saved = ActionResult<{ favorite: boolean }>;

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
  pathname: "/saved",
  onForbidden: vi.fn(),
  setFavorite: vi.fn<(input: { number: number; on: boolean }, auth?: unknown, locale?: string) => Promise<Saved>>(),
}));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string, options: BffOptions) =>
    new Promise<Answer>((resolve) => {
      state.sent.push({ path, query: options.query as URLSearchParams, resolve });
    }),
}));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: () => state.onForbidden(), reauthenticate: vi.fn() }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: state.status, renewed: false }) }));
vi.mock("@/lib/actions/favorites", () => ({ setFavorite: state.setFavorite }));
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
import { FavoritesScreen, type FavoritesScreenProps } from "@/features/saved/FavoritesScreen";
import { savedListKey } from "@/features/saved/listKey";
import { hide, markSeen, resetSessionMaps, setFav } from "@/lib/data/sessionMaps";
import { resetSources } from "@/lib/data/sources";
import { refreshHandlerFor } from "@/lib/ui/shellState";

import { withDevFlags } from "../helpers/flags";
import { previewOf } from "../helpers/listing";

/** A fake `IntersectionObserver`: jsdom has none. `intersect()` tells every connected observer its target is in reach. */
class FakeObserver {
  static all: FakeObserver[] = [];
  readonly targets = new Set<Element>();
  connected = true;
  constructor(readonly callback: IntersectionObserverCallback) {
    FakeObserver.all.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.connected = false;
    this.targets.clear();
  }
  takeRecords() {
    return [];
  }
}

function intersect() {
  act(() => {
    for (const observer of FakeObserver.all.filter((each) => each.connected && each.targets.size > 0)) {
      const entries = [...observer.targets].map((target) => ({ isIntersecting: true, target }) as IntersectionObserverEntry);
      observer.callback(entries, observer as unknown as IntersectionObserver);
    }
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** A page of favourites: the server marks each one a favourite. */
function page(numbers: number[], nextCursor: string | null = null, overrides: (number: number) => Partial<ListingPreview> = () => ({})): Answer {
  return {
    ok: true,
    data: numbers.map((number) => previewOf({ number, favorite: true, ...overrides(number) })),
    meta: { source: "stub", next_cursor: nextCursor },
  };
}

function failed(error: UiError, status: number): Answer {
  return { ok: false, error, status, method: "GET", path: "favorites" };
}

/** The server's page one of the render `renderId`, as `readSaved` keys it. */
const adopted = (answer: Answer, renderId = "r1") => ({ initial: { key: savedListKey("favorites", renderId, FIRST_VERSION), result: answer } });

const intl = (props: FavoritesScreenProps) => (
  <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
    <FavoritesScreen {...props} />
  </NextIntlClientProvider>
);

/** The screen as the page renders it; `rerender` keeps the props given so far and adds `next`. */
function screen(props: Partial<FavoritesScreenProps> = {}) {
  let all: FavoritesScreenProps = { initial: null, renderId: "r1", serverSmallOnly: false, ...props };
  const view = render(intl(all));
  return {
    rerender: (next: Partial<FavoritesScreenProps> = {}) => {
      all = { ...all, ...next };
      view.rerender(intl(all));
    },
    unmount: view.unmount,
  };
}

const answer = (index: number, value: Answer) => act(async () => state.sent[index].resolve(value));
const cards = () => [...document.querySelectorAll<HTMLElement>("article[data-listing]")].map((card) => Number(card.dataset.listing));
const card = (number: number) => document.querySelector<HTMLElement>(`article[data-listing="${number}"]`);
const heart = (number: number) => card(number)?.querySelector<HTMLButtonElement>("button[data-fav]") ?? null;
const skeletons = () => document.querySelectorAll("[data-card-skeleton]").length;
const errorState = () => document.querySelector<HTMLElement>("[data-slot=error-state]");
const retryButton = () => document.querySelector<HTMLButtonElement>("button[data-retry]");
const pull = () => refreshHandlerFor("/saved")?.();

let fake: FakeTelegram | null = null;
let scrolls: unknown[][] = [];

beforeEach(() => {
  state.sent.length = 0;
  state.status = "ready";
  state.pathname = "/saved";
  state.onForbidden.mockReset();
  state.setFavorite.mockReset();
  FakeObserver.all = [];
  scrolls = [];
  fake = fakeTelegram({ version: "8.0" });
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.spyOn(window, "scrollTo").mockImplementation((...args: unknown[]) => void scrolls.push(args));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetSessionMaps();
  resetSources();
  resetPendingFavorites();
  fake?.uninstall();
  fake = null;
});

describe("FavoritesScreen: page one (SCR-024, DEC-44)", () => {
  it("adopts the server's page one of its render and asks for nothing", () => {
    screen(adopted(page([1, 2, 3], "c1")));

    expect(cards()).toEqual([1, 2, 3]);
    expect(skeletons()).toBe(0);
    expect(state.sent).toHaveLength(0);
  });

  it("without the server's read, shows three skeletons and asks /bff/favorites for page one, with no limit and no cursor", async () => {
    screen();

    expect(skeletons()).toBe(3);
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].path).toBe("favorites");
    expect(state.sent[0].query.toString()).toBe("");

    await answer(0, page([4, 5]));
    expect(cards()).toEqual([4, 5]);
    expect(skeletons()).toBe(0);
  });

  it("ignores a server read of another render", () => {
    screen(adopted(page([1]), "r0"));

    expect(cards()).toEqual([]);
    expect(state.sent).toHaveLength(1);
  });
});

describe("FavoritesScreen: the launch's session maps (03 §1.11)", () => {
  it("drops listings un-favourited or hidden in this launch at once, and brings back one favourited again", () => {
    screen(adopted(page([1, 2, 3, 4])));

    act(() => {
      setFav(2, false);
      hide([3]);
    });
    expect(cards()).toEqual([1, 4]);

    act(() => setFav(2, true));
    expect(cards()).toEqual([1, 2, 4]);
    expect(state.sent).toHaveLength(0);
  });

  it("takes the heart from favs and the eye from seen over the server's flags", () => {
    screen(adopted(page([1, 2, 3], null, (number) => ({ favorite: number !== 3, viewed: number === 2 }))));
    act(() => {
      setFav(3, true);
      markSeen(1);
    });

    expect([1, 2, 3].map((number) => heart(number)?.getAttribute("aria-pressed"))).toEqual(["true", "true", "true"]);
    expect([1, 2, 3].map((number) => card(number)?.querySelector("[data-viewed]") !== null)).toEqual([true, true, false]);
  });
});

describe("FavoritesScreen: paging (DEC-53, LB-APP-022)", () => {
  it("appends the next page at the sentinel; a card of it un-favourited disappears at once and returns when the save fails", async () => {
    screen(adopted(page([1, 2], "c1")));

    intersect();
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].query.get("cursor")).toBe("c1");
    expect(state.sent[0].query.has("limit")).toBe(false);
    await answer(0, page([2, 3, 4], null));
    expect(cards()).toEqual([1, 2, 3, 4]);

    const save = deferred<Saved>();
    state.setFavorite.mockReturnValueOnce(save.promise);
    fireEvent.click(heart(4)!);
    expect(state.setFavorite).toHaveBeenCalledWith({ number: 4, on: false }, undefined, "ru");
    expect(cards()).toEqual([1, 2, 3]);

    await act(async () => save.resolve({ ok: false, error: "server", status: 500, method: "DELETE", path: "favorites/:number" }));
    expect(cards()).toEqual([1, 2, 3, 4]);
    expect(heart(4)?.getAttribute("aria-pressed")).toBe("true");
  });

  it("a cursor that comes back ends the list after one extra request", async () => {
    screen(adopted(page([1], "c1")));

    intersect();
    await answer(0, page([2], "c1"));
    intersect();

    expect(state.sent).toHaveLength(1);
    expect(cards()).toEqual([1, 2]);
  });
});

describe("FavoritesScreen: empty and failed (SCR-008, SCR-009)", () => {
  it("an empty list shows the shrug, «Здесь пока пусто» and its hint", () => {
    screen(adopted(page([])));

    const empty = document.querySelector("[data-empty='favorites']");
    expect(empty?.querySelector("[data-slot=empty-state-image]")).not.toBeNull();
    expect(empty?.querySelector("[data-slot=empty-state-title]")?.textContent).toBe("Здесь пока пусто");
    expect(empty?.querySelector("[data-slot=empty-state-hint]")?.textContent).toBe("Нажмите ♡ на объявлении, чтобы сохранить его");
  });

  it("offline without items: «Нет связи», its hint and «Повторить», which asks for page one again", async () => {
    screen();
    await answer(0, failed("offline", 0));

    expect(errorState()?.dataset.kind).toBe("offline");
    expect(errorState()?.querySelector("[data-slot=error-state-title]")?.textContent).toBe("Нет связи");
    expect(errorState()?.querySelector("[data-slot=error-state-text]")?.textContent).toBe("Проверьте интернет и попробуйте ещё раз.");

    fireEvent.click(errorState()!.querySelector("button")!);
    expect(state.sent).toHaveLength(2);
    expect(state.sent[1].query.has("cursor")).toBe(false);
  });

  it("503 source_unavailable without items: «Не загрузилось», the server hint and «Повторить»", async () => {
    screen();
    await answer(0, failed("source_unavailable", 503));

    expect(errorState()?.dataset.kind).toBe("server");
    expect(errorState()?.querySelector("[data-slot=error-state-title]")?.textContent).toBe("Не загрузилось");
    expect(errorState()?.querySelector("[data-slot=error-state-text]")?.textContent).toBe("Сервер не ответил. Попробуйте ещё раз через минуту.");
    expect(errorState()?.querySelector("button")?.textContent).toBe("Повторить");
  });

  it("a failed later page keeps the cards under «Не загрузилось — повторить», which repeats that page", async () => {
    screen(adopted(page([1, 2], "c1")));
    intersect();
    await answer(0, failed("server", 500));

    expect(cards()).toEqual([1, 2]);
    expect(retryButton()?.textContent).toBe("Не загрузилось — повторить");

    fireEvent.click(retryButton()!);
    expect(state.sent[1].query.get("cursor")).toBe("c1");
  });

  it("403 with dev001AnyForbiddenShowsAccess off: the inline «Нет доступа — повторить», no access screen", async () => {
    screen();
    await answer(0, failed("forbidden", 403));

    expect(retryButton()?.dataset.retry).toBe("forbidden");
    expect(retryButton()?.textContent).toBe("Нет доступа — повторить");
    expect(state.onForbidden).not.toHaveBeenCalled();
  });

  it("403 with dev001AnyForbiddenShowsAccess on: the session turns denied (the access screen)", async () => {
    const flags = withDevFlags({ dev001AnyForbiddenShowsAccess: true }, (all) => all);
    screen({ flags });
    await answer(0, failed("forbidden", 403));

    expect(state.onForbidden).toHaveBeenCalledTimes(1);
  });
});

describe("FavoritesScreen: a new server render (D-2)", () => {
  it("re-creates the list from it: a matching page one is adopted with no request; without one, one /bff request", async () => {
    const view = screen(adopted(page([1, 2])));

    view.rerender({ renderId: "r2", ...adopted(page([5, 6]), "r2") });
    expect(cards()).toEqual([5, 6]);
    expect(state.sent).toHaveLength(0);

    view.rerender({ renderId: "r3", initial: null });
    expect(cards()).toEqual([]);
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].query.has("cursor")).toBe(false);
    await answer(0, page([7]));
    expect(cards()).toEqual([7]);
  });

  it("the same render keeps its list when a listing over it closes, also after one was opened (no seen rule)", () => {
    const view = screen(adopted(page([1, 2])));

    state.pathname = "/listing/1";
    act(() => markSeen(1));
    view.rerender();
    state.pathname = "/saved";
    view.rerender();

    expect(cards()).toEqual([1, 2]);
    expect(state.sent).toHaveLength(0);
    expect(scrolls).toEqual([]);
  });
});

describe("FavoritesScreen: pull-to-refresh (BR-APP-058)", () => {
  it("registers for /saved only; a pull re-creates the list from page one, scrolls to the top and settles when it answered", async () => {
    screen(adopted(page([1, 2], "c1")));
    expect(refreshHandlerFor("/saved")).toBeTypeOf("function");
    expect(refreshHandlerFor("/saved/history")).toBeUndefined();
    expect(scrolls).toEqual([]);

    let settled = false;
    let refresh: Promise<unknown> | undefined;
    act(() => {
      refresh = pull()?.then(() => (settled = true));
    });

    expect(cards()).toEqual([]);
    expect(skeletons()).toBe(3);
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].query.toString()).toBe("");
    expect(scrolls).toEqual([[0, 0]]);
    await act(async () => undefined);
    expect(settled).toBe(false);

    await answer(0, page([3]));
    await refresh;
    expect(settled).toBe(true);
    expect(cards()).toEqual([3]);
  });

  it("a failed page one settles the pull too, and a second pull asks again", async () => {
    screen(adopted(page([1])));

    let first: Promise<unknown> | undefined;
    act(() => {
      first = pull();
    });
    await answer(0, failed("server", 500));
    await expect(first).resolves.toBeUndefined();

    act(() => {
      void pull();
    });
    expect(state.sent).toHaveLength(2);
  });

  it("leaving the screen unregisters the handler and settles a pull that still waits", async () => {
    const view = screen(adopted(page([1])));
    let refresh: Promise<unknown> | undefined;
    act(() => {
      refresh = pull();
    });

    view.unmount();

    await expect(refresh).resolves.toBeUndefined();
    expect(refreshHandlerFor("/saved")).toBeUndefined();
  });
});
