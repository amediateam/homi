import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/lib/api/types";

import { withDevFlags } from "../helpers/flags";

const onForbidden = vi.fn();
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: (...args: unknown[]) => onForbidden(...args) }));

const { invalidate, resetResources, seedResource, useResource } = await import("@/lib/data/useResource");

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

  it("a refetch while a read is in flight joins it instead of starting another", async () => {
    const { fetcher, pending } = controlledFetcher();
    const { result } = renderHook(() => useResource("feed", fetcher));

    act(() => {
      void result.current.refetch();
      void result.current.refetch();
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => pending[0].resolve(ok(6)));
    expect(result.current.data).toEqual({ n: 6 });
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

  it("an entry that holds only an error is forgotten with its last user: a later initial seeds it without a read", async () => {
    const { fetcher, pending } = controlledFetcher();
    const user = renderHook(() => useResource("listing:3", fetcher));
    await act(async () => pending[0].resolve(failed(503, "source_unavailable", "source_unavailable")));
    const reader = renderHook(() => useResource("listing:3", fetcher, { enabled: false }));
    expect(reader.result.current.status).toBe("error");

    user.unmount();

    expect(reader.result.current).toMatchObject({ data: undefined, error: null, status: "idle" });
    const { result } = renderHook(() => useResource("listing:3", fetcher, { initial: { n: 5 } }));
    expect(result.current).toMatchObject({ data: { n: 5 }, error: null, status: "success" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("an entry with data is kept when its last user leaves, also after a failed refetch", async () => {
    const { fetcher, pending } = controlledFetcher();
    const user = renderHook(() => useResource("feed", fetcher, { initial: { n: 1 } }));
    act(() => void user.result.current.refetch());
    await act(async () => pending[0].resolve(failed(503, "source_unavailable", "source_unavailable")));

    user.unmount();

    const { result } = renderHook(() => useResource("feed", fetcher));
    expect(result.current).toMatchObject({ data: { n: 1 }, error: { error: "source_unavailable" }, refreshing: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
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

  it("invalidate keeps an entry with data and no user as stale: the next user shows it while it reads again (WP-30)", async () => {
    const { fetcher, pending } = controlledFetcher();
    const hidden = renderHook(() => useResource("radars?include=previews", fetcher));
    await act(async () => pending[0].resolve(ok(1)));
    // A screen hidden under <Activity> ran its effect cleanups: no user, the data kept.
    hidden.unmount();

    act(() => invalidate("radars"));
    const shown = renderHook(() => useResource("radars?include=previews", fetcher, { initial: { n: 0 } }));

    // The old data while it reads again — never the old server `initial`, never the empty loading state.
    expect(shown.result.current).toMatchObject({ data: { n: 1 }, status: "success", refreshing: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => pending[1].resolve(ok(2)));
    expect(shown.result.current).toMatchObject({ data: { n: 2 }, refreshing: false });
  });

  it("an aborted read that still answers writes nothing, not even its time: the stale entry is read again", async () => {
    const { fetcher, pending } = controlledFetcher();
    const first = renderHook(() => useResource("radars", fetcher));
    await act(async () => pending[0].resolve(ok(1)));
    act(() => void first.result.current.refetch());
    first.unmount();
    act(() => invalidate("radars"));

    // The answer was already on its way when the abort came (the fetcher here ignores the signal).
    await act(async () => pending[1].resolve(ok(2)));
    const next = renderHook(() => useResource("radars", fetcher));

    expect(next.result.current).toMatchObject({ data: { n: 1 }, refreshing: true });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("invalidate(prefix) makes the matching entries stale and mounted users read again", async () => {
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

  it("a seed by initial reaches a user that committed earlier without one (WP-26)", () => {
    const { fetcher } = controlledFetcher();
    const reader = renderHook(() => useResource("listing:1", fetcher, { enabled: false }));
    expect(reader.result.current.data).toBeUndefined();

    renderHook(() => useResource("listing:1", fetcher, { initial: { n: 7 }, enabled: false }));

    expect(reader.result.current).toMatchObject({ data: { n: 7 }, status: "success" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("a seeded entry is fresh from its first commit, also for a user that never reads", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { fetcher } = controlledFetcher();
    renderHook(() => useResource("listing:1", fetcher, { initial: { n: 1 }, enabled: false })).unmount();

    vi.setSystemTime(Date.now() + 31_000);
    renderHook(() => useResource("listing:1", fetcher));

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  describe("seedResource (WP-26)", () => {
    it("writes the entry and tells every user at once, without a read", () => {
      const { fetcher } = controlledFetcher();
      const { result } = renderHook(() => useResource("listing:2", fetcher, { enabled: false }));

      act(() => seedResource("listing:2", { n: 8 }));

      expect(result.current).toMatchObject({ data: { n: 8 }, error: null, status: "success" });
      expect(fetcher).not.toHaveBeenCalled();
    });

    it("a seeded entry is fresh: a user that mounts after it reads nothing", () => {
      const { fetcher } = controlledFetcher();
      act(() => seedResource("listing:2", { n: 8 }));

      const { result } = renderHook(() => useResource("listing:2", fetcher));

      expect(result.current).toMatchObject({ data: { n: 8 }, status: "success", refreshing: false });
      expect(fetcher).not.toHaveBeenCalled();
    });

    it("drops a read in flight: its older answer never lands over the seed, and a waiting refetch settles (WP-30)", async () => {
      const { fetcher, pending } = controlledFetcher();
      const { result } = renderHook(() => useResource("radars", fetcher));
      let pulled = false;
      act(() => void result.current.refetch().then(() => (pulled = true)));

      act(() => seedResource("radars", { n: 8 }));
      expect(pending[0].signal.aborted).toBe(true);
      await act(async () => pending[0].resolve(ok(1)));

      expect(result.current).toMatchObject({ data: { n: 8 }, error: null, status: "success", refreshing: false });
      expect(pulled).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("replaces an error of the entry", async () => {
      const { fetcher, pending } = controlledFetcher();
      const { result } = renderHook(() => useResource("listing:2", fetcher));
      await act(async () => pending[0].resolve(failed(503, "source_unavailable", "source_unavailable")));
      expect(result.current.status).toBe("error");

      act(() => seedResource("listing:2", { n: 9 }));

      expect(result.current).toMatchObject({ data: { n: 9 }, error: null, status: "success" });
    });
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
