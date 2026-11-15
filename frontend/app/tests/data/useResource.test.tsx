import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/lib/api/types";

import { withDevFlags } from "../helpers/flags";

const onForbidden = vi.fn();
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: (...args: unknown[]) => onForbidden(...args) }));

const { invalidate, resetResources, useResource } = await import("@/lib/data/useResource");

type Item = { n: number };
const ok = (n: number): ApiResult<Item> => ({ ok: true, data: { n }, meta: {} });
const failed = (status: number, error: "forbidden" | "server" | "source_unavailable", code?: string): ApiResult<Item> => ({
  ok: false,
  error,
  status,
  ...(code === undefined ? {} : { code }),
  method: "GET",
  path: "listings",
});

/** A fetcher whose answers the test releases one by one. */
function controlledFetcher() {
  const pending: { resolve: (value: ApiResult<Item>) => void; signal: AbortSignal }[] = [];
  const fetcher = vi.fn(
    (signal: AbortSignal) =>
      new Promise<ApiResult<Item>>((resolve) => {
        pending.push({ resolve, signal });
      }),
  );
  return { fetcher, pending };
}

beforeEach(() => {
  resetResources();
  onForbidden.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useResource (WP-22)", () => {
  it("shows initial without a request", () => {
    const { fetcher } = controlledFetcher();

    const { result } = renderHook(() => useResource("feed", fetcher, { initial: { n: 1 } }));

    expect(result.current).toMatchObject({ data: { n: 1 }, error: null, status: "success" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("loads without initial; equal keys share one in-flight request", async () => {
    const { fetcher, pending } = controlledFetcher();

    const first = renderHook(() => useResource("feed", fetcher));
    const second = renderHook(() => useResource("feed", fetcher));
    expect(first.result.current.status).toBe("loading");
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => pending[0].resolve(ok(2)));
    expect(first.result.current).toMatchObject({ data: { n: 2 }, status: "success" });
    expect(second.result.current).toMatchObject({ data: { n: 2 }, status: "success" });
  });

  it("a key change aborts the old request; so does the last unmount", () => {
    const { fetcher, pending } = controlledFetcher();

    const { rerender, unmount } = renderHook(({ key }) => useResource(key, fetcher), { initialProps: { key: "a" } });
    rerender({ key: "b" });
    expect(pending[0].signal.aborted).toBe(true);
    expect(pending[1].signal.aborted).toBe(false);

    unmount();
    expect(pending[1].signal.aborted).toBe(true);
  });

  it("reuses a fresh entry and shows a stale one while it refetches", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { fetcher, pending } = controlledFetcher();
    renderHook(() => useResource("feed", fetcher, { initial: { n: 1 } })).unmount();

    vi.setSystemTime(Date.now() + 29_000);
    renderHook(() => useResource("feed", fetcher)).unmount();
    expect(fetcher).not.toHaveBeenCalled();

    vi.setSystemTime(Date.now() + 2_000);
    const { result } = renderHook(() => useResource("feed", fetcher));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ data: { n: 1 }, status: "success", refreshing: true });

    await act(async () => pending[0].resolve(ok(3)));
    expect(result.current).toMatchObject({ data: { n: 3 }, refreshing: false });
  });

  it("a failed read keeps the data on screen and refetch repeats it", async () => {
    const { fetcher, pending } = controlledFetcher();
    const { result } = renderHook(() => useResource("feed", fetcher, { initial: { n: 1 } }));

    act(() => void result.current.refetch());
    await act(async () => pending[0].resolve(failed(503, "source_unavailable", "source_unavailable")));
    expect(result.current).toMatchObject({ data: { n: 1 }, status: "error", error: { error: "source_unavailable" } });

    act(() => void result.current.refetch());
    await act(async () => pending[1].resolve(ok(4)));
    expect(result.current).toMatchObject({ data: { n: 4 }, status: "success", error: null });
  });

  it("mutate writes optimistically to every user of the key", () => {
    const { fetcher } = controlledFetcher();
    const first = renderHook(() => useResource("feed", fetcher, { initial: { n: 1 } }));
    const second = renderHook(() => useResource("feed", fetcher));

    act(() => first.result.current.mutate((item) => ({ n: (item?.n ?? 0) + 10 })));

    expect(second.result.current.data).toEqual({ n: 11 });
  });

  it("invalidate(prefix) drops the matching entries and mounted users read again", async () => {
    const { fetcher, pending } = controlledFetcher();
    const other = controlledFetcher();
    const { result } = renderHook(() => useResource("favorites:all", fetcher, { initial: { n: 1 } }));
    renderHook(() => useResource("history:all", other.fetcher, { initial: { n: 9 } }));

    act(() => invalidate("favorites"));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(other.fetcher).not.toHaveBeenCalled();

    await act(async () => pending[0].resolve(ok(5)));
    expect(result.current.data).toEqual({ n: 5 });
  });

  it("enabled false neither reads nor reports loading", () => {
    const { fetcher } = controlledFetcher();

    const { result } = renderHook(() => useResource("feed", fetcher, { enabled: false }));

    expect(result.current.status).toBe("idle");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("an abort answer from the fetcher is ignored", async () => {
    const fetcher = vi.fn(() => Promise.reject(new DOMException("Aborted", "AbortError")));

    const { result } = renderHook(() => useResource("feed", fetcher));

    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    expect(result.current).toMatchObject({ status: "loading", error: null });
  });

  describe("403 (LB-APP-045)", () => {
    it("with dev001AnyForbiddenShowsAccess off the list keeps its inline no-access state", async () => {
      const { fetcher, pending } = controlledFetcher();
      const { result } = withDevFlags({}, (flags) => renderHook(() => useResource("feed", fetcher, { flags })));

      await act(async () => pending[0].resolve(failed(403, "forbidden", "access_denied")));

      expect(result.current).toMatchObject({ status: "error", error: { error: "forbidden" } });
      expect(onForbidden).not.toHaveBeenCalled();
    });

    it("with it on the session turns denied and the access screen opens", async () => {
      const { fetcher, pending } = controlledFetcher();
      withDevFlags({ dev001AnyForbiddenShowsAccess: true }, (flags) => renderHook(() => useResource("feed", fetcher, { flags })));

      await act(async () => pending[0].resolve(failed(403, "forbidden", "access_denied")));

      expect(onForbidden).toHaveBeenCalledTimes(1);
    });
  });
});
