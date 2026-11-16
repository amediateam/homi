import { getMessages } from "@homi/i18n";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { type ComponentProps, type ReactNode, useEffect, useState } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ListingFeedProps } from "@/features/feed/ListingFeed";
import type { ListingPreview } from "@/features/feed/types";
import type { BffOptions } from "@/lib/api/browser";
import type { UiError } from "@/lib/api/errors";
import type { ApiResult } from "@/lib/api/types";

type Answer = ApiResult<ListingPreview[]>;

/** One `bffFetch` the list sent; the test answers it when it wants. */
interface Sent {
  path: string;
  cursor: string | null;
  resolve: (answer: Answer) => void;
}

const state = vi.hoisted(() => ({
  sent: [] as Sent[],
  status: "ready" as string,
  /** The launch signed in (`useSession().renewed`). */
  renewed: false,
  /** The locale-less address; `next/navigation` sees it under `/ru`. */
  pathname: "/",
}));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string, options: BffOptions) =>
    new Promise<Answer>((resolve) => {
      state.sent.push({ path, cursor: (options.query as URLSearchParams).get("cursor"), resolve });
    }),
}));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn() }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: state.status, renewed: state.renewed }) }));
vi.mock("@/lib/actions/favorites", () => ({ setFavorite: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => `/ru${state.pathname === "/" ? "" : state.pathname}` }));
/** The counted `Link` needs the App Router: a plain anchor that never navigates. */
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => state.pathname,
  Link: ({ href, prefetch, scroll, ...props }: ComponentProps<"a"> & { href: string; prefetch?: boolean; scroll?: boolean }) => (
    <a {...props} href={href} data-prefetch={String(prefetch)} data-scroll={String(scroll)} />
  ),
}));

import { resetPendingFavorites } from "@/features/feed/FavButton";
import type { FewResultsContext } from "@/features/feed/fewResults";
import { ListingFeed } from "@/features/feed/ListingFeed";
import { DemoDataMarker } from "@/features/shell/DemoDataMarker";
import { hide, markSeen, resetSessionMaps, setFav } from "@/lib/data/sessionMaps";
import { resetSources } from "@/lib/data/sources";

import { previewOf } from "../helpers/listing";

const QUERY = "city=tashkent&deal=rent_long&limit=20";
const KEY = `${QUERY}|0`;

/** What the few-results note needs to show (`showsFewResults`): no filters, the city's stats and its name. */
const FEW: FewResultsContext = { activeFilters: 0, stats: { code: "tashkent", counts: { sale: 120 } }, cityName: "Ташкент" };

/** A fake `IntersectionObserver`: jsdom has none. `intersect()` tells every connected observer its target is in reach. */
class FakeObserver {
  static all: FakeObserver[] = [];
  readonly targets = new Set<Element>();
  connected = true;
  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit = {},
  ) {
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

const watching = () => FakeObserver.all.filter((observer) => observer.connected && observer.targets.size > 0);

function intersect() {
  act(() => {
    for (const observer of watching()) {
      const entries = [...observer.targets].map((target) => ({ isIntersecting: true, target }) as IntersectionObserverEntry);
      observer.callback(entries, observer as unknown as IntersectionObserver);
    }
  });
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

function page(numbers: number[], nextCursor: string | null = null, overrides: (number: number) => Partial<ListingPreview> = () => ({})): Answer {
  return {
    ok: true,
    data: numbers.map((number) => previewOf({ number, ...overrides(number) })),
    meta: { source: "stub", next_cursor: nextCursor },
  };
}

function failed(error: UiError, status: number): Answer {
  return { ok: false, error, status, method: "GET", path: "listings" };
}

function withIntl(children: ReactNode) {
  return (
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      {children}
      <DemoDataMarker />
    </NextIntlClientProvider>
  );
}

function feed(props: Partial<ListingFeedProps> = {}) {
  const all: ListingFeedProps = { source: "feed", path: "listings", query: new URLSearchParams(QUERY), listKey: KEY, ...props };
  const view = render(withIntl(<ListingFeed {...all} />));
  return { rerender: (next: Partial<ListingFeedProps> = {}) => view.rerender(withIntl(<ListingFeed {...all} {...next} />)) };
}

const adopted = (answer: Answer) => ({ initial: { key: KEY, result: answer } });
const answer = (index: number, value: Answer) => act(async () => state.sent[index].resolve(value));
const cards = () => [...document.querySelectorAll<HTMLElement>("article[data-listing]")].map((card) => Number(card.dataset.listing));
const card = (number: number) => document.querySelector<HTMLElement>(`article[data-listing="${number}"]`);
const skeletons = () => document.querySelectorAll("[data-card-skeleton]").length;
const errorState = () => document.querySelector<HTMLElement>("[data-slot=error-state]");
const retryButton = () => document.querySelector<HTMLButtonElement>("button[data-retry]");
const spinner = () => document.querySelector("[data-sentinel] [data-spinner]");
const list = () => document.querySelector<HTMLElement>("[data-feed]");
const status = () => document.querySelector("[data-feed-status]");

beforeEach(() => {
  state.sent.length = 0;
  state.status = "ready";
  state.renewed = false;
  state.pathname = "/";
  FakeObserver.all = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetSessionMaps();
  resetSources();
  resetPendingFavorites();
});

describe("ListingFeed: the first load (SCR-008)", () => {
  it("shows three card skeletons and sends nothing while the session boots, then asks for page one", async () => {
    state.status = "booting";
    const view = feed();

    expect(skeletons()).toBe(3);
    expect(state.sent).toHaveLength(0);

    state.status = "ready";
    view.rerender();
    expect(skeletons()).toBe(3);
    expect(state.sent).toMatchObject([{ path: "listings", cursor: null }]);

    await answer(0, page([1, 2, 3]));
    expect(skeletons()).toBe(0);
    expect(cards()).toEqual([1, 2, 3]);
    const links = [...document.querySelectorAll("article[data-listing] a")];
    expect(links.map((link) => [link.getAttribute("href"), link.getAttribute("data-prefetch")])).toEqual([
      ["/listing/1", "false"],
      ["/listing/2", "false"],
      ["/listing/3", "false"],
    ]);
  });

  it("renders the server's page one at once while the session boots, on the server too, and asks for nothing", () => {
    state.status = "booting";
    const html = renderToString(withIntl(<ListingFeed source="feed" path="listings" query={new URLSearchParams(QUERY)} listKey={KEY} {...adopted(page([1, 2], "c1"))} />));
    expect(html).toContain('data-listing="1"');
    expect(html).not.toContain("data-card-skeleton");
    expect(html).toContain('srcSet="');
    const small = renderToString(
      withIntl(<ListingFeed source="feed" path="listings" query={new URLSearchParams(QUERY)} listKey={KEY} serverSmallOnly {...adopted(page([1, 2], "c1"))} />),
    );
    expect(small).toContain("/stub/100001/1.s.jpg?");
    expect(small).not.toContain("srcSet=");

    feed(adopted(page([1, 2], "c1")));
    expect(cards()).toEqual([1, 2]);
    expect(skeletons()).toBe(0);
    expect(state.sent).toHaveLength(0);
    expect(watching()).toHaveLength(0);
  });

  it("drops a page one the server read with another user's cookie once the launch's sign-in is ready", async () => {
    state.status = "booting";
    const view = feed(adopted(page([1, 2], "c1", () => ({ favorite: true }))));
    expect(cards()).toEqual([1, 2]);

    state.status = "ready";
    state.renewed = true;
    view.rerender();
    expect(cards()).toEqual([]);
    expect(skeletons()).toBe(3);
    expect(state.sent).toMatchObject([{ path: "listings", cursor: null }]);

    await answer(0, page([1, 2], "c1"));
    expect(cards()).toEqual([1, 2]);
    expect(document.querySelectorAll("[aria-pressed=true]")).toHaveLength(0);
  });

  it("ignores a server read for another list key", () => {
    feed({ initial: { key: "city=samarkand&deal=sale&limit=20|0", result: page([7]) } });

    expect(cards()).toEqual([]);
    expect(skeletons()).toBe(3);
    expect(state.sent).toHaveLength(1);
  });

  it("loads the first photo of the first two cards eagerly, later ones lazily", () => {
    feed(adopted(page([1, 2, 3, 4])));

    const loading = [...document.querySelectorAll("article[data-listing] img")].map((img) => img.getAttribute("loading"));
    expect(loading).toEqual(["eager", "eager", "lazy", "lazy"]);
  });
});

describe("ListingFeed: paging (BR-APP-024)", () => {
  it("observes the sentinel within 800 px and asks for the next page, with a spinner at the sentinel meanwhile", async () => {
    feed(adopted(page([1, 2], "c1")));

    expect(watching()).toHaveLength(1);
    expect(watching()[0].options.rootMargin).toBe("800px");
    expect(watching()[0].targets.has(document.querySelector("[data-sentinel]")!)).toBe(true);
    expect(spinner()).toBeNull();

    intersect();
    expect(state.sent).toMatchObject([{ path: "listings", cursor: "c1" }]);
    expect(spinner()).not.toBeNull();
    expect(watching()).toHaveLength(0);

    await answer(0, page([2, 3], null));
    expect(spinner()).toBeNull();
    expect(cards()).toEqual([1, 2, 3]);
  });

  it("observes again after each page, so a sentinel still in reach asks for the following one", async () => {
    feed(adopted(page([1], "c1")));
    intersect();
    await answer(0, page([2], "c2"));

    expect(watching()).toHaveLength(1);
    intersect();
    expect(state.sent.map((sent) => sent.cursor)).toEqual(["c1", "c2"]);
  });

  it("does not observe while the session boots, nor once the list ended", async () => {
    state.status = "booting";
    const view = feed(adopted(page([1], "c1")));
    expect(watching()).toHaveLength(0);

    state.status = "ready";
    view.rerender();
    expect(watching()).toHaveLength(1);

    intersect();
    await answer(0, page([2], null));
    expect(watching()).toHaveLength(0);
    expect(spinner()).toBeNull();
  });
});

describe("ListingFeed: errors (SCR-008)", () => {
  it.each<{ error: UiError; status: number }>([
    { error: "offline", status: 0 },
    { error: "timeout", status: 0 },
  ])("$error without items: WifiOff, «Нет связи», the hint and «Повторить», which asks for page one again", async ({ error, status }) => {
    feed();
    await answer(0, failed(error, status));

    expect(errorState()?.dataset.kind).toBe("offline");
    expect(errorState()?.querySelector("[data-slot=error-state-title]")?.textContent).toBe("Нет связи");
    expect(errorState()?.querySelector("[data-slot=error-state-text]")?.textContent).toBe("Проверьте интернет и попробуйте ещё раз.");
    expect(skeletons()).toBe(0);
    expect(retryButton()).toBeNull();

    fireEvent.click(errorState()!.querySelector("button")!);
    expect(errorState()).toBeNull();
    expect(state.sent).toHaveLength(2);
    expect(state.sent[1].cursor).toBeNull();
    expect(skeletons()).toBe(3);
  });

  it.each<{ error: UiError; status: number }>([
    { error: "server", status: 500 },
    { error: "source_unavailable", status: 503 },
    { error: "rate_limited", status: 429 },
    { error: "not_found", status: 404 },
    { error: "unauthorized", status: 401 },
  ])("$error without items: CloudOff, «Не загрузилось», the server hint and «Повторить»", async ({ error, status }) => {
    feed();
    await answer(0, failed(error, status));

    expect(errorState()?.dataset.kind).toBe("server");
    expect(errorState()?.querySelector("[data-slot=error-state-title]")?.textContent).toBe("Не загрузилось");
    expect(errorState()?.querySelector("[data-slot=error-state-text]")?.textContent).toBe(
      "Сервер не ответил. Попробуйте ещё раз через минуту.",
    );
    expect(errorState()?.querySelector("button")?.textContent).toBe("Повторить");
  });

  it("shows a failed server read of page one as its error state; «Повторить» asks the browser", () => {
    state.status = "booting";
    const view = feed(adopted(failed("source_unavailable", 503)));
    expect(errorState()?.dataset.kind).toBe("server");
    expect(state.sent).toHaveLength(0);

    state.status = "ready";
    view.rerender();
    expect(state.sent).toHaveLength(0);
    fireEvent.click(errorState()!.querySelector("button")!);
    expect(state.sent).toMatchObject([{ cursor: null }]);
  });

  it("a later page that failed keeps the cards under the inline retry, which repeats that page only; nothing retries by itself", async () => {
    feed(adopted(page([1, 2], "c1")));
    intersect();
    await answer(0, failed("server", 500));

    expect(cards()).toEqual([1, 2]);
    expect(errorState()).toBeNull();
    expect(retryButton()?.dataset.retry).toBe("failed");
    expect(retryButton()?.textContent).toBe("Не загрузилось — повторить");
    expect(spinner()).toBeNull();

    intersect();
    expect(state.sent).toHaveLength(1);

    fireEvent.click(retryButton()!);
    expect(state.sent).toHaveLength(2);
    expect(state.sent[1].cursor).toBe("c1");
    expect(spinner()).not.toBeNull();
    await answer(1, page([3], null));
    expect(retryButton()).toBeNull();
    expect(cards()).toEqual([1, 2, 3]);
  });

  it("forbidden shows the inline «Нет доступа — повторить», on page one and on a later page", async () => {
    feed();
    await answer(0, failed("forbidden", 403));
    expect(errorState()).toBeNull();
    expect(retryButton()?.dataset.retry).toBe("forbidden");
    expect(retryButton()?.textContent).toBe("Нет доступа — повторить");

    fireEvent.click(retryButton()!);
    expect(state.sent[1].cursor).toBeNull();
    await answer(1, page([1], "c1"));
    intersect();
    await answer(2, failed("forbidden", 403));
    expect(cards()).toEqual([1]);
    expect(retryButton()?.textContent).toBe("Нет доступа — повторить");
  });
});

describe("ListingFeed: for screen readers (WCAG 4.1.3, 2.4.3)", () => {
  it("is busy and says «Загрузка…» while page one loads, and says nothing once it answered", async () => {
    feed();
    expect(list()?.getAttribute("aria-busy")).toBe("true");
    expect(status()?.getAttribute("role")).toBe("status");
    expect(status()?.textContent).toBe("Загрузка…");

    await answer(0, page([1, 2], "c1"));
    expect(list()?.getAttribute("aria-busy")).toBe("false");
    expect(status()?.textContent).toBe("");

    intersect();
    expect(status()?.textContent).toBe("Загрузка…");
    expect(spinner()?.getAttribute("aria-hidden")).toBe("true");
  });

  it("says the inline error of a later page, and a retry moves the focus to the list", async () => {
    feed(adopted(page([1, 2], "c1")));
    intersect();
    await answer(0, failed("server", 500));
    expect(status()?.textContent).toBe("Не загрузилось");

    retryButton()!.focus();
    fireEvent.click(retryButton()!);
    expect(document.activeElement).toBe(list());
    expect(status()?.textContent).toBe("Загрузка…");
  });

  it("says «Нет доступа» for a refused page; the error state of an empty list is an alert of its own", async () => {
    const view = feed();
    await answer(0, failed("forbidden", 403));
    expect(status()?.textContent).toBe("Нет доступа");

    view.rerender({ listKey: "other|0" });
    await answer(1, failed("server", 500));
    expect(errorState()?.getAttribute("role")).toBe("alert");
    expect(status()?.textContent).toBe("");
    fireEvent.click(errorState()!.querySelector("button")!);
    expect(document.activeElement).toBe(list());
  });
});

describe("ListingFeed: the launch's session maps (03 §1.11)", () => {
  it("drops listings hidden in this launch from the search at once", () => {
    feed(adopted(page([1, 2, 3])));
    act(() => hide([2]));

    expect(cards()).toEqual([1, 3]);
  });

  it("favourites drop listings un-favourited in this launch and hidden ones; the search keeps them with an empty heart", () => {
    const view = feed({ source: "favorites", path: "favorites", ...adopted(page([1, 2, 3], null, () => ({ favorite: true }))) });
    act(() => {
      setFav(1, false);
      hide([3]);
    });
    expect(cards()).toEqual([2]);

    act(() => setFav(1, true));
    expect(cards()).toEqual([1, 2]);

    view.rerender({ source: "feed", path: "listings" });
    act(() => setFav(2, false));
    expect(cards()).toEqual([1, 2]);
    expect(card(2)?.querySelector("button[data-fav]")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("takes the heart from favs and the eye from seen over the server's flags", () => {
    feed(adopted(page([1, 2], null, (number) => ({ favorite: number === 2, viewed: number === 2 }))));
    act(() => {
      setFav(1, true);
      setFav(2, false);
      markSeen(1);
    });

    expect(card(1)?.querySelector("button[data-fav]")?.getAttribute("aria-pressed")).toBe("true");
    expect(card(2)?.querySelector("button[data-fav]")?.getAttribute("aria-pressed")).toBe("false");
    expect(card(1)?.querySelector("[data-viewed]")).not.toBeNull();
    expect(card(2)?.querySelector("[data-viewed]")).not.toBeNull();
  });

  it("history shows every item it gets, hidden ones too, and never the eye (BR-APP-040, WP-29)", () => {
    feed({ source: "history", path: "history", ...adopted(page([1, 2], null, () => ({ viewed: true }))) });
    act(() => {
      hide([1]);
      markSeen(2);
    });

    expect(cards()).toEqual([1, 2]);
    expect(document.querySelector("[data-viewed]")).toBeNull();
  });
});

describe("ListingFeed: the inline slot (SCR-047)", () => {
  const inline = <aside data-test-inline="" />;
  const inlines = () => document.querySelectorAll("[data-test-inline]");
  const after = () => Number(inlines()[0]?.previousElementSibling?.getAttribute("data-listing"));

  it("renders the inline block once, after the 8th visible card of the search list", () => {
    feed({ inline, ...adopted(page(range(1, 20), "c1")) });

    expect(inlines()).toHaveLength(1);
    expect(after()).toBe(8);
  });

  it("counts visible cards: after hiding one, it follows the 9th listing", () => {
    feed({ inline, ...adopted(page(range(1, 20), "c1")) });
    act(() => hide([3]));

    expect(after()).toBe(9);
  });

  it("moves without a remount when a card above it is hidden, so the block keeps its state (WP-30's radar card)", () => {
    let mounts = 0;
    function Stateful() {
      const [taps, setTaps] = useState(0);
      useEffect(() => {
        mounts += 1;
      }, []);
      return <aside data-test-inline="" data-taps={taps} onClick={() => setTaps((count) => count + 1)} />;
    }
    feed({ inline: <Stateful />, ...adopted(page(range(1, 20), "c1")) });
    fireEvent.click(inlines()[0]);

    act(() => hide([3]));

    expect(after()).toBe(9);
    expect(inlines()[0].getAttribute("data-taps")).toBe("1");
    expect(mounts).toBe(1);
  });

  it("follows the last card of a short list fully loaded without the note, and stands aside while the note shows or the list is loading", () => {
    const view = feed({ inline, ...adopted(page(range(1, 5), null)) });
    expect(inlines()).toHaveLength(1);
    expect(after()).toBe(5);

    view.rerender({ few: { context: FEW, render: (visible) => <p data-test-few={visible} /> } });
    expect(inlines()).toHaveLength(0);
    expect(document.querySelector("[data-test-few]")?.getAttribute("data-test-few")).toBe("5");
  });

  it("is not rendered before a short list ended", () => {
    feed({ inline, ...adopted(page(range(1, 5), "c1")) });

    expect(inlines()).toHaveLength(0);
  });

  it.each<{ source: "favorites" | "history"; path: "favorites" | "history" }>([
    { source: "favorites", path: "favorites" },
    { source: "history", path: "history" },
  ])("is never rendered in $source", ({ source, path }) => {
    feed({ source, path, inline, ...adopted(page(range(1, 20), "c1", () => ({ favorite: true }))) });

    expect(cards()).toHaveLength(20);
    expect(inlines()).toHaveLength(0);
  });
});

describe("ListingFeed: the end of the list (SCR-009)", () => {
  const emptySlot = <div data-test-empty="" />;
  const few = { context: FEW, render: (visible: number) => <p data-test-few={visible} /> };
  const empty = () => document.querySelector("[data-test-empty]");
  const note = () => document.querySelector("[data-test-few]");

  it("renders the empty slot when the list ended with no visible item, not while it loads or after an error", async () => {
    const view = feed({ emptySlot });
    expect(empty()).toBeNull();
    await answer(0, failed("server", 500));
    expect(empty()).toBeNull();

    view.rerender({ emptySlot, listKey: "other|0" });
    await answer(1, page([]));
    expect(empty()).not.toBeNull();
  });

  it("renders the empty slot once every loaded item is hidden", () => {
    feed({ emptySlot, ...adopted(page([1, 2])) });
    expect(empty()).toBeNull();

    act(() => hide([1, 2]));
    expect(empty()).not.toBeNull();
  });

  it("renders the few-results note instead of the empty slot, and below a short list", () => {
    const view = feed({ emptySlot, few, ...adopted(page([])) });
    expect(empty()).toBeNull();
    expect(note()?.getAttribute("data-test-few")).toBe("0");

    view.rerender({ emptySlot, few, listKey: "other|0", initial: { key: "other|0", result: page([1, 2, 3]) } });
    expect(cards()).toEqual([1, 2, 3]);
    expect(note()?.getAttribute("data-test-few")).toBe("3");
    expect(note()?.previousElementSibling?.getAttribute("data-listing")).toBe("3");
  });

  it("shows neither with active filters and items, nor for 10 visible items, nor before the list ended", () => {
    const view = feed({ emptySlot, few: { ...few, context: { ...FEW, activeFilters: 1 } }, ...adopted(page([1, 2])) });
    expect(note()).toBeNull();
    expect(empty()).toBeNull();

    view.rerender({ emptySlot, few, listKey: "ten|0", initial: { key: "ten|0", result: page(range(1, 10)) } });
    expect(note()).toBeNull();

    view.rerender({ emptySlot, few, listKey: "more|0", initial: { key: "more|0", result: page([1, 2], "c1") } });
    expect(note()).toBeNull();
  });

  it("renders the block above the first card only while a card is visible (history's «Очистить», WP-29)", () => {
    feed({ source: "history", path: "history", above: <div data-test-above="" />, ...adopted(page([1])) });
    expect(document.querySelector("[data-test-above]")?.nextElementSibling?.getAttribute("data-listing")).toBe("1");

    cleanup();
    feed({ source: "history", path: "history", above: <div data-test-above="" />, ...adopted(page([])) });
    expect(document.querySelector("[data-test-above]")).toBeNull();
  });
});

describe("ListingFeed: the demo marker (25 §4.4, KI-43)", () => {
  const marker = () => document.querySelector("[data-demo-marker]");

  it("reports the source of the server's page one, so the marker shows on the feed while it is a stub", () => {
    feed(adopted(page([1])));

    expect(marker()).not.toBeNull();
  });

  it("does not for a native answer", () => {
    feed(adopted({ ok: true, data: [previewOf({ number: 1 })], meta: { source: "native", next_cursor: null } }));

    expect(marker()).toBeNull();
  });

  it("reports nothing while a listing lies over the list, so the feed's stub does not mark the listing", () => {
    state.pathname = "/listing/1";
    feed(adopted(page([1])));

    expect(cards()).toEqual([1]);
    expect(marker()).toBeNull();
  });

  it("reports again when the listing over the list closes, so the marker comes back on the feed", () => {
    const view = feed(adopted(page([1])));
    expect(marker()).not.toBeNull();

    state.pathname = "/listing/1";
    view.rerender();
    expect(marker()).toBeNull();

    state.pathname = "/";
    view.rerender();
    expect(marker()).not.toBeNull();
  });

  it("reports for favourites at their own address, not at the feed's", () => {
    state.pathname = "/saved";
    feed({ source: "favorites", path: "favorites", ...adopted(page([1], null, () => ({ favorite: true }))) });
    expect(marker()).not.toBeNull();

    cleanup();
    resetSources();
    state.pathname = "/";
    feed({ source: "favorites", path: "favorites", ...adopted(page([1], null, () => ({ favorite: true }))) });
    expect(marker()).toBeNull();
  });
});
