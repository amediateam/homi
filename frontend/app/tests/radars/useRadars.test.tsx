import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Radar } from "@/features/radars/normalize";
import type { BffOptions } from "@/lib/api/browser";
import type { ApiResult } from "@/lib/api/types";

/** One `bffFetch` the hook or a helper sent; the test answers it when it wants. */
interface Sent {
  path: string;
  query: BffOptions["query"];
  resolve: (answer: ApiResult<unknown>) => void;
  reject: (error: unknown) => void;
}

const state = vi.hoisted(() => ({
  sent: [] as Sent[],
  status: "ready" as string,
  renewed: false,
}));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string, options: BffOptions = {}) =>
    new Promise<ApiResult<unknown>>((resolve, reject) => {
      state.sent.push({ path, query: options.query, resolve, reject });
    }),
}));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn() }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: state.status, renewed: state.renewed }) }));
// `radarsReady` is the build-time half of the switch (flipped by another stage); these tests hold it on and let the
// reference data decide, so the gate under test is the server's `radars_enabled`.
vi.mock("@/features/radars/capability", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/radars/capability")>();
  return { ...real, useRadarsEnabled: () => real.useRadarsEnabled({ ready: true }) };
});

const { dropRadar, fetchRadarList, putRadar, RADARS_KEY, RADARS_PREVIEWS_KEY, refreshRadars, useRadars } = await import("@/features/radars/useRadars");
const { normalizeRadar } = await import("@/features/radars/normalize");
const { readResource, resetResources, seedResource } = await import("@/lib/data/useResource");
const { resetReference } = await import("@/lib/reference/useReference");
const { feedReference } = await import("../helpers/reference");
const { previewOf } = await import("../helpers/listing");

const A = "01JD0000000000000000000001";
const B = "01JD0000000000000000000002";

function raw(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, active: true, mode: "instant", hidden: 0, created_at: "2026-11-10T06:00:00+00:00", filters: { city: "tashkent", deal: "rent_long" }, ...overrides };
}

const radar = (id: string, overrides: Record<string, unknown> = {}): Radar => normalizeRadar(raw(id, overrides))!;
const PREVIEW = { items: [previewOf({ number: 100001 })], count: 34, flow: { week: 21, days: 7 } };
const ok = (data: unknown): ApiResult<unknown> => ({ ok: true, data, meta: { source: "stub" } });
const answer = (index: number, value: ApiResult<unknown>) => act(async () => state.sent[index].resolve(value));

beforeEach(() => {
  state.sent.length = 0;
  state.status = "ready";
  state.renewed = false;
  resetResources();
  feedReference({ reference: { radars_enabled: true } });
});

afterEach(() => {
  cleanup();
  resetReference();
});

describe("useRadars (WP-30)", () => {
  it("the plain list: GET /radars without a query, cached under radars, normalised", async () => {
    const { result } = renderHook(() => useRadars());

    expect(result.current.status).toBe("loading");
    expect(state.sent.map((call) => [call.path, call.query])).toEqual([["radars", undefined]]);
    await answer(0, ok([raw(A, { mode: "weekly" }), { id: "bad" }, raw(B, { active: false })]));

    expect(result.current.status).toBe("success");
    expect(result.current.radars?.map((item) => [item.id, item.mode, item.active])).toEqual([
      [A, "instant", true],
      [B, "instant", false],
    ]);
    expect(readResource(RADARS_KEY)).toEqual(result.current.radars);
    expect(RADARS_KEY).toBe("radars");
  });

  it("the tab's list asks for the previews and is cached under its own key", async () => {
    const { result } = renderHook(() => useRadars({ previews: true }));

    expect(state.sent.map((call) => [call.path, call.query])).toEqual([["radars", { include: "previews" }]]);
    await answer(0, ok([raw(A, { preview: PREVIEW })]));

    expect(result.current.radars?.[0].preview?.count).toBe(34);
    expect(RADARS_PREVIEWS_KEY).toBe("radars?include=previews");
    expect(readResource(RADARS_PREVIEWS_KEY)).toEqual(result.current.radars);
    expect(readResource(RADARS_KEY)).toBeUndefined();
  });

  it("sends nothing while radars are switched off or the reference data is missing (DEC-51)", () => {
    feedReference({ reference: { radars_enabled: false } });
    const off = renderHook(() => useRadars());
    feedReference({ reference: null });
    const missing = renderHook(() => useRadars({ previews: true }));

    expect(state.sent).toEqual([]);
    expect(off.result.current).toMatchObject({ radars: undefined, status: "idle" });
    expect(missing.result.current).toMatchObject({ radars: undefined, status: "idle" });
  });

  it("waits for a ready session and the caller's own gate", async () => {
    state.status = "booting";
    const { rerender } = renderHook(({ enabled }: { enabled: boolean }) => useRadars({ enabled }), { initialProps: { enabled: true } });
    expect(state.sent).toHaveLength(0);

    state.status = "ready";
    rerender({ enabled: false });
    expect(state.sent).toHaveLength(0);

    rerender({ enabled: true });
    expect(state.sent).toHaveLength(1);
  });

  it("the server's initial is shown without a request; a launch that signed in reads once more", async () => {
    const initial = [radar(A, { preview: PREVIEW })];
    const first = renderHook(() => useRadars({ previews: true, initial }));
    expect(first.result.current).toMatchObject({ radars: initial, status: "success" });
    expect(state.sent).toHaveLength(0);
    first.unmount();
    resetResources();

    state.renewed = true;
    const second = renderHook(() => useRadars({ previews: true, initial }));
    second.rerender();
    expect(state.sent.map((call) => call.query)).toEqual([{ include: "previews" }]);
    await answer(0, ok([raw(B)]));
    expect(second.result.current.radars?.map((item) => item.id)).toEqual([B]);
    expect(state.sent).toHaveLength(1);
  });

  it("a failed read keeps the list on screen and reports the failure", async () => {
    const { result } = renderHook(() => useRadars());
    await answer(0, ok([raw(A)]));

    act(() => void result.current.refetch());
    await answer(1, { ok: false, error: "source_unavailable", status: 503, code: "source_unavailable", method: "GET", path: "radars" });

    expect(result.current.radars?.map((item) => item.id)).toEqual([A]);
    expect(result.current).toMatchObject({ status: "error", error: { error: "source_unavailable" } });
  });
});

describe("putRadar, dropRadar, refreshRadars (WP-30)", () => {
  it("putRadar replaces the radar in both lists; the tab's list keeps the old preview when the answer has none", async () => {
    seedResource(RADARS_KEY, [radar(A), radar(B)]);
    seedResource(RADARS_PREVIEWS_KEY, [radar(A, { preview: PREVIEW }), radar(B, { preview: null })]);
    const plain = renderHook(() => useRadars());
    const tab = renderHook(() => useRadars({ previews: true }));

    act(() => plain.result.current.replace(radar(A.toLowerCase(), { active: false, mode: "digest" })));

    expect(plain.result.current.radars?.map((item) => [item.id, item.active, item.mode])).toEqual([
      [A.toLowerCase(), false, "digest"],
      [B, true, "instant"],
    ]);
    expect(tab.result.current.radars?.[0]).toMatchObject({ active: false, mode: "digest", preview: { count: 34 } });
    expect(tab.result.current.radars?.[1].preview).toBeNull();
  });

  it("putRadar with a preview takes it in the tab's list and never writes one into the plain list", () => {
    seedResource(RADARS_KEY, [radar(A)]);
    seedResource(RADARS_PREVIEWS_KEY, [radar(A, { preview: PREVIEW })]);

    putRadar(radar(A, { hidden: 2, preview: null }));

    expect(readResource<Radar[]>(RADARS_KEY)?.[0]).not.toHaveProperty("preview");
    expect(readResource<Radar[]>(RADARS_KEY)?.[0].hidden).toBe(2);
    expect(readResource<Radar[]>(RADARS_PREVIEWS_KEY)?.[0].preview).toBeNull();
  });

  it("putRadar of a radar no list holds changes nothing and creates no list", () => {
    seedResource(RADARS_KEY, [radar(A)]);

    putRadar(radar(B));

    expect(readResource<Radar[]>(RADARS_KEY)?.map((item) => item.id)).toEqual([A]);
    expect(readResource(RADARS_PREVIEWS_KEY)).toBeUndefined();
  });

  it("dropRadar takes the radar out of both lists", () => {
    seedResource(RADARS_KEY, [radar(A), radar(B)]);
    seedResource(RADARS_PREVIEWS_KEY, [radar(A, { preview: PREVIEW }), radar(B, { preview: PREVIEW })]);

    dropRadar(A.toLowerCase());

    expect(readResource<Radar[]>(RADARS_KEY)?.map((item) => item.id)).toEqual([B]);
    expect(readResource<Radar[]>(RADARS_PREVIEWS_KEY)?.map((item) => item.id)).toEqual([B]);
  });

  it("refreshRadars reads both lists on screen again", async () => {
    renderHook(() => useRadars());
    renderHook(() => useRadars({ previews: true }));
    await answer(0, ok([raw(A)]));
    await answer(1, ok([raw(A, { preview: PREVIEW })]));

    act(() => refreshRadars());

    expect(state.sent.slice(2).map((call) => call.query)).toEqual([undefined, { include: "previews" }]);
  });
});

describe("fetchRadarList (WP-30, subscribe flow step 1)", () => {
  it("a fresh plain read that seeds the search tab's list", async () => {
    const { result } = renderHook(() => useRadars());
    await answer(0, ok([raw(A)]));

    let fresh: Promise<Radar[] | null> = Promise.resolve(null);
    act(() => {
      fresh = fetchRadarList();
    });
    expect(state.sent[1]).toMatchObject({ path: "radars", query: undefined });
    await answer(1, ok([raw(A), raw(B)]));

    await expect(fresh).resolves.toEqual([radar(A), radar(B)]);
    expect(result.current.radars?.map((item) => item.id)).toEqual([A, B]);
  });

  it("null when the read fails or throws, and the cached list stays", async () => {
    seedResource(RADARS_KEY, [radar(A)]);

    const failed = fetchRadarList();
    await act(async () => state.sent[0].resolve({ ok: false, error: "offline", status: 0, method: "GET", path: "radars" }));
    const thrown = fetchRadarList();
    await act(async () => state.sent[1].reject(new Error("boom")));

    await expect(failed).resolves.toBeNull();
    await expect(thrown).resolves.toBeNull();
    expect(readResource<Radar[]>(RADARS_KEY)?.map((item) => item.id)).toEqual([A]);
  });
});
