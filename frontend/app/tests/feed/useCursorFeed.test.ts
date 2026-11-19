import { act, cleanup, render, renderHook } from "@testing-library/react";
import { Activity, type ActivityProps, createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CursorFeed, CursorFeedOptions } from "@/features/feed/useCursorFeed";
import type { BffOptions } from "@/lib/api/browser";
import type { UiError } from "@/lib/api/errors";
import type { ApiResult } from "@/lib/api/types";

import { withDevFlags } from "../helpers/flags";

type Item = { number: number };
type Answer = ApiResult<Item[]>;

/** One `bffFetch` the hook sent; the test answers it (or rejects it) when it wants. */
interface Sent {
  path: string;
  query: string;
  cursor: string | null;
  signal: AbortSignal;
  resolve: (answer: Answer) => void;
  reject: (error: unknown) => void;
}

const sent: Sent[] = [];
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string, options: BffOptions) =>
    new Promise<Answer>((resolve, reject) => {
      const query = options.query as URLSearchParams;
      sent.push({ path, query: query.toString(), cursor: query.get("cursor"), signal: options.signal!, resolve, reject });
    }),
}));
const onForbidden = vi.fn();
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: (...args: unknown[]) => onForbidden(...args) }));

const { useCursorFeed } = await import("@/features/feed/useCursorFeed");
type Options = CursorFeedOptions<Item>;
type Feed = CursorFeed<Item>;

const QUERY = "city=tashkent&deal=rent_long&limit=20";

function page(numbers: number[], meta: { next_cursor?: string | null; source?: "stub" | "legacy" } = {}): Answer {
  return { ok: true, data: numbers.map((number) => ({ number })), meta: { source: "stub", ...meta } };
}

function failed(error: UiError, status: number, code?: string): Answer {
  return { ok: false, error, status, ...(code === undefined ? {} : { code }), method: "GET", path: "listings" };
}

function feed(overrides: Partial<Options> = {}) {
  const props: Options = { key: "a|0", path: "listings", query: new URLSearchParams(QUERY), enabled: true, ...overrides };
  return renderHook((current: Options) => useCursorFeed<Item>(current), { initialProps: props });
}

const numbers = (current: Feed) => current.items.map((item) => item.number);
const answer = (index: number, value: Answer) => act(async () => sent[index].resolve(value));

beforeEach(() => {
  sent.length = 0;
  onForbidden.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("useCursorFeed (WP-24, BR-APP-024)", () => {
  it("pages with the last cursor until a null cursor ends the list", async () => {
    const { result } = feed();
    expect(result.current).toMatchObject({ status: "loading", items: [], done: false, loadingMore: false });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ path: "listings", query: QUERY, cursor: null });

    await answer(0, page([1, 2], { next_cursor: "c1" }));
    expect(result.current).toMatchObject({ status: "success", done: false, loadingMore: false });
    const { loadMore, retry } = result.current;

    act(() => result.current.loadMore());
    expect(result.current.loadingMore).toBe(true);
    expect(sent[1]).toMatchObject({ path: "listings", query: `${QUERY}&cursor=c1`, cursor: "c1" });
    await answer(1, page([3], { next_cursor: "c2" }));

    act(() => result.current.loadMore());
    expect(sent[2].cursor).toBe("c2");
    await answer(2, page([4], { next_cursor: null }));

    expect(numbers(result.current)).toEqual([1, 2, 3, 4]);
    expect(result.current).toMatchObject({ status: "success", done: true, loadingMore: false, error: null });
    act(() => result.current.loadMore());
    expect(sent).toHaveLength(3);
    expect(result.current.loadMore).toBe(loadMore);
    expect(result.current.retry).toBe(retry);
  });

  it("asks for one page at a time: loadMore while a page is asked for sends nothing more", async () => {
    const { result } = feed();
    act(() => result.current.loadMore());
    expect(sent).toHaveLength(1);

    await answer(0, page([1], { next_cursor: "c1" }));
    act(() => {
      result.current.loadMore();
      result.current.loadMore();
    });
    expect(sent).toHaveLength(2);
  });

  it("shows a number that comes again, across pages or within one, once", async () => {
    const { result } = feed();
    await answer(0, page([1, 2, 2], { next_cursor: "c1" }));
    act(() => result.current.loadMore());
    await answer(1, page([2, 3, 1], { next_cursor: null }));

    expect(numbers(result.current)).toEqual([1, 2, 3]);
  });

  it.each([
    { meta: {}, row: "a missing cursor" },
    { meta: { next_cursor: "" }, row: "an empty cursor" },
  ])("$row ends the list", async ({ meta }) => {
    const { result } = feed();
    await answer(0, page([1, 2], meta));

    expect(result.current).toMatchObject({ status: "success", done: true });
    act(() => result.current.loadMore());
    expect(sent).toHaveLength(1);
  });

  it("a cursor equal to the previous one ends the list after one extra request (LB-APP-022)", async () => {
    const { result } = feed();
    await answer(0, page([1], { next_cursor: "c1" }));
    act(() => result.current.loadMore());
    await answer(1, page([2], { next_cursor: "c1" }));

    expect(numbers(result.current)).toEqual([1, 2]);
    expect(result.current.done).toBe(true);
    act(() => result.current.loadMore());
    expect(sent).toHaveLength(2);
  });

  it("a cursor used earlier ends the list too, so two cursors cannot loop", async () => {
    const { result } = feed();
    await answer(0, page([1], { next_cursor: "a" }));
    act(() => result.current.loadMore());
    await answer(1, page([2], { next_cursor: "b" }));
    act(() => result.current.loadMore());
    await answer(2, page([3], { next_cursor: "a" }));

    expect(result.current.done).toBe(true);
    act(() => result.current.loadMore());
    expect(sent.map((request) => request.cursor)).toEqual([null, "a", "b"]);
  });

  it("does not retry by itself after an error", async () => {
    const { result, rerender } = feed();
    await answer(0, page([1, 2], { next_cursor: "c1" }));
    act(() => result.current.loadMore());
    await answer(1, failed("server", 500));

    expect(result.current).toMatchObject({ status: "error", error: { error: "server" }, done: false, loadingMore: false });
    act(() => result.current.loadMore());
    rerender({ key: "a|0", path: "listings", query: new URLSearchParams(QUERY), enabled: true });
    await act(async () => {});
    expect(sent).toHaveLength(2);
  });

  it("retry() asks again for the failed page only and keeps the cards", async () => {
    const { result } = feed();
    await answer(0, page([1, 2], { next_cursor: "c1" }));
    act(() => result.current.loadMore());
    await answer(1, failed("offline", 0));
    expect(numbers(result.current)).toEqual([1, 2]);

    act(() => result.current.retry());
    expect(sent[2]).toMatchObject({ cursor: "c1", query: `${QUERY}&cursor=c1` });
    expect(result.current).toMatchObject({ status: "success", error: null, loadingMore: true });
    await answer(2, page([3], { next_cursor: null }));

    expect(numbers(result.current)).toEqual([1, 2, 3]);
    expect(result.current.done).toBe(true);
    act(() => result.current.retry());
    expect(sent).toHaveLength(3);
  });

  it("retry() after a failed page one asks for page one again", async () => {
    const { result } = feed();
    await answer(0, failed("timeout", 0));
    expect(result.current).toMatchObject({ status: "error", items: [] });

    act(() => result.current.retry());
    expect(result.current.status).toBe("loading");
    expect(sent[1]).toMatchObject({ cursor: null, query: QUERY });
  });

  it("a key change aborts the request in flight and drops its answer", async () => {
    const { result, rerender } = feed();
    await answer(0, page([1, 2], { next_cursor: "c1" }));
    act(() => result.current.loadMore());

    rerender({ key: "b|0", path: "listings", query: new URLSearchParams("city=tashkent&deal=sale&limit=20"), enabled: true });
    expect(sent[1].signal.aborted).toBe(true);
    expect(result.current).toMatchObject({ status: "loading", items: [], done: false, loadingMore: false });
    expect(sent[2]).toMatchObject({ cursor: null, query: "city=tashkent&deal=sale&limit=20" });

    await answer(1, page([9], { next_cursor: null }));
    expect(result.current.items).toEqual([]);
    await answer(2, page([5], { next_cursor: null }));
    expect(numbers(result.current)).toEqual([5]);
  });

  it("the abort's rejection is not an error; any other rejection shows «could not load»", async () => {
    const { result, rerender } = feed();
    rerender({ key: "b|0", path: "listings", query: new URLSearchParams(QUERY), enabled: true });
    await act(async () => sent[0].reject(new DOMException("aborted", "AbortError")));
    expect(result.current).toMatchObject({ status: "loading", error: null });

    await act(async () => sent[1].reject(new TypeError("a bug")));
    expect(result.current).toMatchObject({ status: "error", error: { error: "server", method: "GET", path: "listings" } });
  });

  it("a matching initial sends no request for page one; the next page uses its cursor", () => {
    const { result } = feed({ initial: { key: "a|0", result: page([1, 2], { next_cursor: "c1" }) } });

    expect(numbers(result.current)).toEqual([1, 2]);
    expect(result.current).toMatchObject({ status: "success", done: false });
    expect(sent).toHaveLength(0);

    act(() => result.current.loadMore());
    expect(sent[0]).toMatchObject({ cursor: "c1", query: `${QUERY}&cursor=c1` });
  });

  it("a matching initial whose cursor is null is the whole list", () => {
    const { result } = feed({ initial: { key: "a|0", result: page([1], { next_cursor: null }) } });

    expect(result.current.done).toBe(true);
    act(() => result.current.loadMore());
    expect(sent).toHaveLength(0);
  });

  it("a mismatching initial is ignored and page one is fetched", () => {
    const { result } = feed({ initial: { key: "a|1", result: page([1, 2], { next_cursor: "c1" }) } });

    expect(result.current).toMatchObject({ status: "loading", items: [] });
    expect(sent).toHaveLength(1);
    expect(sent[0].cursor).toBeNull();
  });

  it("a page one adopted while the session boots stays once it is ready, unless the launch signed in", async () => {
    const initial = { key: "a|0", result: page([1, 2], { next_cursor: "c1" }) };
    const base = { key: "a|0", path: "listings", query: new URLSearchParams(QUERY), initial } as const;

    const kept = feed({ ...base, enabled: false });
    kept.rerender({ ...base, enabled: true, renewed: false });
    expect(numbers(kept.result.current)).toEqual([1, 2]);
    expect(sent).toHaveLength(0);
    // Confirmed once: a later `renewed` (a re-authentication) does not drop it.
    kept.rerender({ ...base, enabled: true, renewed: true });
    expect(numbers(kept.result.current)).toEqual([1, 2]);
    expect(sent).toHaveLength(0);
    kept.unmount();

    // Read with the document's cookie, another user's: page one again, through the browser, with the new session.
    const renewed = feed({ ...base, enabled: false });
    renewed.rerender({ ...base, enabled: true, renewed: true });
    expect(renewed.result.current).toMatchObject({ status: "loading", items: [] });
    expect(sent).toHaveLength(1);
    expect(sent[0].cursor).toBeNull();
    await answer(0, page([3], { next_cursor: null }));
    expect(numbers(renewed.result.current)).toEqual([3]);
    expect(sent).toHaveLength(1);
  });

  it("a page one adopted while the session is ready is the new cookie's, even after a sign-in of this launch", () => {
    const initial = { key: "b|0", result: page([4, 5], { next_cursor: null }) };
    const { result, rerender } = feed({ initial: { key: "a|0", result: page([1]) }, renewed: true });
    rerender({ key: "b|0", path: "listings", query: new URLSearchParams(QUERY), enabled: true, renewed: true, initial });

    expect(numbers(result.current)).toEqual([4, 5]);
    expect(sent).toHaveLength(0);
  });

  it("a later initial for the same key (the router refresh of cookie mode) is not adopted", () => {
    const { result, rerender } = feed({ initial: { key: "a|0", result: page([1], { next_cursor: "c1" }) } });
    rerender({
      key: "a|0",
      path: "listings",
      query: new URLSearchParams(QUERY),
      enabled: true,
      initial: { key: "a|0", result: page([7, 8], { next_cursor: "c9" }) },
    });

    expect(numbers(result.current)).toEqual([1]);
    expect(sent).toHaveLength(0);
  });

  it("a new key adopts the initial read for it", () => {
    const { result, rerender } = feed({ initial: { key: "a|0", result: page([1], { next_cursor: null }) } });
    rerender({
      key: "b|0",
      path: "listings",
      query: new URLSearchParams(QUERY),
      enabled: true,
      initial: { key: "b|0", result: page([4, 5], { next_cursor: null }) },
    });

    expect(numbers(result.current)).toEqual([4, 5]);
    expect(sent).toHaveLength(0);
  });

  it("a failed initial shows its error without a request; retry() asks the browser for page one", () => {
    const { result } = feed({ initial: { key: "a|0", result: failed("source_unavailable", 503, "source_unavailable") } });

    expect(result.current).toMatchObject({ status: "error", items: [], error: { error: "source_unavailable", status: 503 } });
    expect(sent).toHaveLength(0);

    act(() => result.current.retry());
    expect(result.current.status).toBe("loading");
    expect(sent[0]).toMatchObject({ cursor: null, query: QUERY });
  });

  it("enabled = false sends nothing; the session turning ready sends page one", () => {
    const { result, rerender } = feed({ enabled: false });

    expect(result.current.status).toBe("loading");
    expect(sent).toHaveLength(0);

    rerender({ key: "a|0", path: "listings", query: new URLSearchParams(QUERY), enabled: true });
    expect(sent).toHaveLength(1);
  });

  it("a matching initial renders its items while the session is booting, on the server too (D3)", () => {
    const initial = { key: "a|0", result: page([1, 2], { next_cursor: "c1" }) };
    function Probe() {
      const list = useCursorFeed<Item>({ key: "a|0", path: "listings", query: new URLSearchParams(QUERY), initial, enabled: false });
      return createElement("output", null, `${list.status}:${numbers(list).join(",")}`);
    }
    expect(renderToString(createElement(Probe))).toContain("success:1,2");

    const { result, rerender } = feed({ initial, enabled: false });
    expect(result.current).toMatchObject({ status: "success", loadingMore: false });
    expect(numbers(result.current)).toEqual([1, 2]);

    act(() => result.current.loadMore());
    expect(sent).toHaveLength(0);
    rerender({ key: "a|0", path: "listings", query: new URLSearchParams(QUERY), initial, enabled: true });
    expect(sent[0].cursor).toBe("c1");
  });

  it("a hidden route aborts its request, keeps its items and asks again when shown", async () => {
    let latest: Feed | undefined;
    function Probe() {
      latest = useCursorFeed<Item>({ key: "a|0", path: "listings", query: new URLSearchParams(QUERY), enabled: true });
      return null;
    }
    const tree = (mode: "visible" | "hidden") => createElement(Activity, { mode } as ActivityProps, createElement(Probe));
    const view = render(tree("visible"));
    await answer(0, page([1, 2], { next_cursor: "c1" }));
    act(() => latest!.loadMore());

    view.rerender(tree("hidden"));
    expect(sent[1].signal.aborted).toBe(true);
    await answer(1, page([9], { next_cursor: null }));
    expect(numbers(latest!)).toEqual([1, 2]);

    view.rerender(tree("visible"));
    expect(sent).toHaveLength(3);
    expect(sent[2].cursor).toBe("c1");
    await answer(2, page([3], { next_cursor: null }));
    expect(numbers(latest!)).toEqual([1, 2, 3]);
  });

  it("works for the other cursor lists: favourites without limit", async () => {
    const { result } = feed({ path: "favorites", query: new URLSearchParams() });
    expect(sent[0]).toMatchObject({ path: "favorites", query: "" });

    await answer(0, page([1], { next_cursor: "f1" }));
    act(() => result.current.loadMore());
    expect(sent[1]).toMatchObject({ path: "favorites", query: "cursor=f1" });
  });

  it("exposes meta.source of the latest answer, the server's included", async () => {
    const { result } = feed({ initial: { key: "a|0", result: page([1], { next_cursor: "c1", source: "stub" }) } });
    expect(result.current.source).toBe("stub");

    act(() => result.current.loadMore());
    await answer(0, page([2], { next_cursor: null, source: "legacy" }));
    expect(result.current.source).toBe("legacy");
  });

  it("a forbidden page turns the session denied only with DEV-001 on (LB-APP-045)", async () => {
    const off = feed();
    await answer(0, failed("forbidden", 403, "access_denied"));
    expect(off.result.current).toMatchObject({ status: "error", error: { error: "forbidden" } });
    expect(onForbidden).not.toHaveBeenCalled();
    off.unmount();

    withDevFlags({ dev001AnyForbiddenShowsAccess: true }, (flags) => feed({ flags }));
    await answer(1, failed("forbidden", 403, "access_denied"));
    expect(onForbidden).toHaveBeenCalledTimes(1);
  });

  it("a forbidden initial with DEV-001 on waits for the session before turning it denied", () => {
    const initial = { key: "a|0", result: failed("forbidden", 403) };
    const { rerender } = withDevFlags({ dev001AnyForbiddenShowsAccess: true }, (flags) => feed({ initial, enabled: false, flags }));
    expect(onForbidden).not.toHaveBeenCalled();

    withDevFlags({ dev001AnyForbiddenShowsAccess: true }, (flags) =>
      rerender({ key: "a|0", path: "listings", query: new URLSearchParams(QUERY), initial, enabled: true, flags }),
    );
    expect(onForbidden).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(0);
  });
});

/**
 * The saved lists of WP-29 page with the feed's cursor (DEC-53) and send no `limit`: the guard of LB-APP-022 for their
 * paths. "works for the other cursor lists" above checks only the first two requests of favourites.
 */
describe.each(["favorites", "history"] as const)("useCursorFeed with the path %s (WP-29, LB-APP-022)", (path) => {
  const saved = (overrides: Partial<Options> = {}) => feed({ key: `${path}:r1:0`, path, query: new URLSearchParams(), ...overrides });

  it("a page one whose cursor is null is the whole list: one request", async () => {
    const { result } = saved();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ path, query: "", cursor: null });

    await answer(0, page([1, 2], { next_cursor: null }));
    expect(result.current).toMatchObject({ status: "success", done: true });
    act(() => result.current.loadMore());
    expect(sent).toHaveLength(1);
  });

  it("a page one with a cursor is followed by one request per loadMore, until a null cursor", async () => {
    const { result } = saved();
    await answer(0, page([1, 2], { next_cursor: "c1" }));

    act(() => result.current.loadMore());
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ path, query: "cursor=c1", cursor: "c1" });
    await answer(1, page([3], { next_cursor: "c2" }));

    act(() => result.current.loadMore());
    expect(sent).toHaveLength(3);
    expect(sent[2]).toMatchObject({ path, query: "cursor=c2", cursor: "c2" });
    await answer(2, page([4], { next_cursor: null }));

    expect(numbers(result.current)).toEqual([1, 2, 3, 4]);
    expect(result.current.done).toBe(true);
    act(() => result.current.loadMore());
    expect(sent).toHaveLength(3);
  });

  it("a missing next_cursor key ends the list", async () => {
    const { result } = saved();
    await answer(0, page([1, 2], { next_cursor: "c1" }));
    act(() => result.current.loadMore());
    await answer(1, { ok: true, data: [{ number: 3 }], meta: { source: "stub" } });

    expect(numbers(result.current)).toEqual([1, 2, 3]);
    expect(result.current.done).toBe(true);
    act(() => result.current.loadMore());
    expect(sent).toHaveLength(2);
  });

  it("a cursor equal to the previous one ends the list after one extra request", async () => {
    const { result } = saved();
    await answer(0, page([1], { next_cursor: "c1" }));
    act(() => result.current.loadMore());
    await answer(1, page([2], { next_cursor: "c1" }));

    expect(numbers(result.current)).toEqual([1, 2]);
    expect(result.current.done).toBe(true);
    act(() => result.current.loadMore());
    expect(sent.map((request) => request.cursor)).toEqual([null, "c1"]);
  });

  it("two pages are merged without duplicates", async () => {
    const { result } = saved();
    await answer(0, page([1, 2, 3], { next_cursor: "c1" }));
    act(() => result.current.loadMore());
    await answer(1, page([3, 4, 1, 5], { next_cursor: null }));

    expect(numbers(result.current)).toEqual([1, 2, 3, 4, 5]);
  });

  it("a failed second page keeps the first; retry() asks for that page again", async () => {
    const { result } = saved();
    await answer(0, page([1, 2], { next_cursor: "c1" }));
    act(() => result.current.loadMore());
    await answer(1, failed("server", 500));

    expect(numbers(result.current)).toEqual([1, 2]);
    expect(result.current).toMatchObject({ status: "error", error: { error: "server" }, done: false });
    act(() => result.current.loadMore());
    expect(sent).toHaveLength(2);

    act(() => result.current.retry());
    expect(sent).toHaveLength(3);
    expect(sent[2]).toMatchObject({ path, query: "cursor=c1", cursor: "c1" });
    await answer(2, page([3], { next_cursor: null }));

    expect(numbers(result.current)).toEqual([1, 2, 3]);
    expect(result.current).toMatchObject({ status: "success", done: true, error: null });
  });
});
