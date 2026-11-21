import { defaultFilters, type SearchFilters, toApiQuery } from "@homi/search";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { Activity, type ActivityProps, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MapPoints, MapPointsOptions } from "@/features/map/useMapPoints";
import type { MapPoint } from "@/features/map/types";
import type { BffOptions } from "@/lib/api/browser";
import type { UiError } from "@/lib/api/errors";
import type { ApiResult } from "@/lib/api/types";
import { hide, resetSessionMaps } from "@/lib/data/sessionMaps";

import { withDevFlags } from "../helpers/flags";

type Answer = ApiResult<{ points: MapPoint[]; total?: number }>;

/** One `bffFetch` the hook sent; the test answers it (or rejects it) when it wants. */
interface Sent {
  path: string;
  query: string;
  signal: AbortSignal;
  resolve: (answer: Answer) => void;
  reject: (error: unknown) => void;
}

const sent: Sent[] = [];
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string, options: BffOptions) =>
    new Promise<Answer>((resolve, reject) => {
      sent.push({ path, query: (options.query as URLSearchParams).toString(), signal: options.signal!, resolve, reject });
    }),
}));
const onForbidden = vi.fn();
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: (...args: unknown[]) => onForbidden(...args) }));
const reportSource = vi.fn();
vi.mock("@/lib/data/sources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/sources")>()),
  reportSource: (...args: unknown[]) => reportSource(...args),
}));

const { useMapPoints } = await import("@/features/map/useMapPoints");

const TASHKENT = defaultFilters("rent_long", "tashkent");

function point(number: number, lat: number, lon: number, usd: number | null, tone: string | null = null): MapPoint {
  return { number, lat, lon, label: usd === null ? "Договорная" : `$${usd}`, tone, priced: usd !== null, usd };
}

/** Two listings at one address (the dearer first, as the server may send them) and one alone. */
const POINTS = [point(1, 41.311101, 69.279701, 700), point(2, 41.311104, 69.279699, 500), point(3, 41.3, 69.25, 900, "good")];

function answered(points: MapPoint[], total?: number): Answer {
  return { ok: true, data: total === undefined ? { points } : { points, total }, meta: { source: "stub" } };
}

function failed(error: UiError, status: number, code?: string): Answer {
  return { ok: false, error, status, ...(code === undefined ? {} : { code }), method: "GET", path: "listings/map" };
}

type Props = { filters: SearchFilters; options?: MapPointsOptions };

function points(filters: SearchFilters = TASHKENT, options?: MapPointsOptions) {
  return renderHook<MapPoints, Props>(({ filters: current, options: currentOptions }) => useMapPoints(current, currentOptions), {
    initialProps: { filters, options },
  });
}

const answer = (index: number, value: Answer) => act(async () => sent[index].resolve(value));
const numbers = (current: MapPoints) => current.groups.map((group) => group.items.map((item) => item.number));

beforeEach(() => {
  sent.length = 0;
  onForbidden.mockReset();
  reportSource.mockReset();
});

afterEach(() => {
  cleanup();
  resetSessionMaps();
});

describe("useMapPoints (WP-27, SCR-011)", () => {
  it("asks listings/map once with the filters' v1 query and groups the answer, cheapest first", async () => {
    const { result } = points();
    expect(result.current).toMatchObject({ status: "loading", groups: [], shown: 0, total: 0, missing: 0, responseId: 0, error: null });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ path: "listings/map", query: toApiQuery(TASHKENT).toString() });
    expect(sent[0].query).not.toMatch(/sort=|limit=|cursor=/);

    await answer(0, answered(POINTS, 5));

    expect(result.current).toMatchObject({ status: "ready", shown: 3, total: 5, missing: 2, responseId: 1, error: null });
    expect(numbers(result.current)).toEqual([[2, 1], [3]]);
    expect(result.current.groups[0]).toMatchObject({ key: "41.31110,69.27970" });
    expect(sent).toHaveLength(1);
  });

  it("leaves meta.source to bffFetch: the hook reports nothing itself", async () => {
    points();
    await answer(0, answered(POINTS, 3));
    expect(reportSource).not.toHaveBeenCalled();
  });

  it("counts the points when the answer has no total", async () => {
    const { result } = points();
    await answer(0, answered(POINTS));
    expect(result.current).toMatchObject({ status: "ready", shown: 3, total: 3, missing: 0 });
  });

  it("a filters change aborts the request in flight and its late answer never reaches the state", async () => {
    const { result, rerender } = points();
    const next = { ...TASHKENT, rooms_min: 2 };

    rerender({ filters: next });
    expect(sent[0].signal.aborted).toBe(true);
    expect(sent).toHaveLength(2);
    expect(sent[1].query).toBe(toApiQuery(next).toString());

    await answer(0, answered(POINTS, 3));
    expect(result.current).toMatchObject({ status: "loading", groups: [], shown: 0, total: 0, responseId: 0 });

    await answer(1, answered([point(9, 41.2, 69.2, 400)], 1));
    expect(numbers(result.current)).toEqual([[9]]);
    expect(result.current).toMatchObject({ status: "ready", responseId: 1 });
  });

  it("a new search drops the old pins at once and the next answer is a new responseId", async () => {
    const { result, rerender } = points();
    await answer(0, answered(POINTS, 3));
    expect(result.current.responseId).toBe(1);

    rerender({ filters: { ...TASHKENT, deal: "sale" } });
    expect(result.current).toMatchObject({ status: "loading", groups: [], shown: 0, responseId: 1 });

    await answer(1, answered([point(9, 41.2, 69.2, 400)], 1));
    expect(result.current).toMatchObject({ status: "ready", responseId: 2 });
  });

  it("a bump of the feed epoch asks the same search again and keeps the points until the answer (WP-31)", async () => {
    const { bumpFeedEpoch } = await import("@/features/feed/feedQuery");
    const { result } = points();
    await answer(0, answered(POINTS, 3));
    const shown = result.current.shown;

    act(() => bumpFeedEpoch());
    expect(sent).toHaveLength(2);
    expect(sent[1]?.query).toBe(sent[0]?.query);
    expect(result.current.shown).toBe(shown);

    await answer(1, answered([point(9, 41.2, 69.2, 400)], 1));
    // The camera and an open card stay: the response id is the old one.
    expect(result.current).toMatchObject({ status: "ready", shown: 1, responseId: 1 });
  });

  it("a bump before the first answer, or after a failed first read, still gives the first answer a new response id", async () => {
    const { bumpFeedEpoch } = await import("@/features/feed/feedQuery");
    const pending = points();
    act(() => bumpFeedEpoch());
    expect(sent).toHaveLength(2);
    expect(sent[0]?.signal.aborted).toBe(true);
    await answer(1, answered(POINTS, 3));
    // The camera fits the first answer of a mount: it needs a new id.
    expect(pending.result.current).toMatchObject({ status: "ready", responseId: 1 });
    pending.unmount();

    const failing = points();
    await answer(2, failed("offline", 0));
    expect(failing.result.current.status).toBe("error");
    act(() => bumpFeedEpoch());
    await answer(3, answered(POINTS, 3));
    expect(failing.result.current).toMatchObject({ status: "ready", responseId: 1 });
  });

  it("a drawn area keeps the view on a bump also after an answer without points: the camera fitted the area", async () => {
    const { bumpFeedEpoch } = await import("@/features/feed/feedQuery");
    const area: SearchFilters = {
      ...TASHKENT,
      polygon: [
        [41.3, 69.2],
        [41.35, 69.25],
        [41.3, 69.3],
      ],
    };
    const { result } = points(area);
    await answer(0, answered([], 0));
    act(() => bumpFeedEpoch());
    await answer(1, answered(POINTS, 3));

    expect(result.current).toMatchObject({ status: "ready", responseId: 1 });
  });

  it("a bump after an answer without points gives the next answer a new response id: there was nothing to fit", async () => {
    const { bumpFeedEpoch } = await import("@/features/feed/feedQuery");
    const { result } = points();
    await answer(0, answered([], 0));
    expect(result.current).toMatchObject({ status: "empty", responseId: 1 });

    act(() => bumpFeedEpoch());
    await answer(1, answered(POINTS, 3));
    expect(result.current).toMatchObject({ status: "ready", responseId: 2 });
  });

  it("the same search in a new object sends nothing; a posted_days change does (not filtersKey)", async () => {
    const { rerender } = points();
    await answer(0, answered(POINTS, 3));

    rerender({ filters: { ...TASHKENT, types: [...TASHKENT.types] } });
    expect(sent).toHaveLength(1);

    rerender({ filters: { ...TASHKENT, posted_days: 3 } });
    expect(sent).toHaveLength(2);
    expect(sent[1].query).toContain("posted_days=3");
  });

  it("is empty only with no point and a total of 0; points without a location are ready with missing", async () => {
    const empty = points();
    await answer(0, answered([], 0));
    expect(empty.result.current).toMatchObject({ status: "empty", groups: [], shown: 0, total: 0, missing: 0, responseId: 1 });
    empty.unmount();

    const unlocated = points();
    await answer(1, answered([], 4));
    expect(unlocated.result.current).toMatchObject({ status: "ready", groups: [], shown: 0, total: 4, missing: 4 });
  });

  it.each([
    { error: "offline", status: 0 },
    { error: "timeout", status: 0 },
    { error: "server", status: 500 },
    { error: "source_unavailable", status: 503, code: "source_unavailable" },
  ] as const)("$error is the error status with nothing drawn, and retry() asks again", async (failure) => {
    const { result } = points();
    await answer(0, failed(failure.error, failure.status, "code" in failure ? failure.code : undefined));

    expect(result.current).toMatchObject({ status: "error", error: failure.error, groups: [], responseId: 0 });
    expect(sent).toHaveLength(1);

    act(() => result.current.retry());
    expect(result.current).toMatchObject({ status: "loading", error: null });
    expect(sent).toHaveLength(2);
    expect(sent[1].query).toBe(sent[0].query);

    await answer(1, answered(POINTS, 3));
    expect(result.current).toMatchObject({ status: "ready", responseId: 1 });
  });

  it("retry() without an error sends nothing", async () => {
    const { result } = points();
    act(() => result.current.retry());
    expect(sent).toHaveLength(1);

    await answer(0, answered(POINTS, 3));
    act(() => result.current.retry());
    expect(sent).toHaveLength(1);
  });

  it("the abort's rejection is not an error; any other rejection shows «could not load»", async () => {
    const { result, rerender } = points();
    rerender({ filters: { ...TASHKENT, rooms_min: 1 } });
    await act(async () => sent[0].reject(new DOMException("aborted", "AbortError")));
    expect(result.current).toMatchObject({ status: "loading", error: null });

    await act(async () => sent[1].reject(new TypeError("a bug")));
    expect(result.current).toMatchObject({ status: "error", error: "server" });
  });

  it("hiding a listing regroups and recounts without a new responseId or request", async () => {
    const { result } = points();
    await answer(0, answered(POINTS, 5));
    const before = result.current.groups;

    act(() => hide([2]));
    expect(numbers(result.current)).toEqual([[1], [3]]);
    expect(result.current).toMatchObject({ status: "ready", shown: 2, total: 4, missing: 2, responseId: 1 });
    expect(result.current.groups).not.toBe(before);
    expect(sent).toHaveLength(1);
  });

  it("keeps the answer's meta.source for the screen, also when hiding regroups; a new search has none until it answers", async () => {
    const { result, rerender } = points();
    expect(result.current.source).toBeUndefined();

    await answer(0, answered(POINTS, 5));
    expect(result.current).toMatchObject({ source: "stub", responseId: 1 });

    act(() => hide([2]));
    expect(result.current).toMatchObject({ source: "stub", responseId: 1, shown: 2 });
    expect(sent).toHaveLength(1);

    rerender({ filters: { ...TASHKENT, deal: "sale" } });
    expect(result.current.source).toBeUndefined();
    await answer(1, { ok: true, data: { points: [point(9, 41.2, 69.2, 400)], total: 1 }, meta: { source: "legacy" } });
    expect(result.current).toMatchObject({ source: "legacy", responseId: 2 });
    expect(reportSource).not.toHaveBeenCalled();
  });

  it("hiding every listing of a search without unlocated ones is the empty status", async () => {
    const { result } = points();
    await answer(0, answered(POINTS, 3));

    act(() => hide([1, 2, 3]));
    expect(result.current).toMatchObject({ status: "empty", groups: [], shown: 0, total: 0, responseId: 1 });
  });

  it("a forbidden answer turns the session denied only with DEV-001 on (LB-APP-045)", async () => {
    const off = points();
    await answer(0, failed("forbidden", 403, "access_denied"));
    expect(off.result.current).toMatchObject({ status: "error", error: "forbidden" });
    expect(onForbidden).not.toHaveBeenCalled();
    off.unmount();

    withDevFlags({ dev001AnyForbiddenShowsAccess: true }, (flags) => points(TASHKENT, { flags }));
    await answer(1, failed("forbidden", 403, "access_denied"));
    expect(onForbidden).toHaveBeenCalledTimes(1);
  });

  it("enabled = false sends nothing; turning it on sends the request", () => {
    const { result, rerender } = points(TASHKENT, { enabled: false });
    expect(result.current.status).toBe("loading");
    expect(sent).toHaveLength(0);

    rerender({ filters: TASHKENT, options: { enabled: true } });
    expect(sent).toHaveLength(1);
  });

  it("a hidden route aborts its pending request and sends it again when shown; an answered one is kept", async () => {
    let latest: MapPoints | undefined;
    function Probe() {
      latest = useMapPoints(TASHKENT);
      return null;
    }
    const tree = (mode: "visible" | "hidden") => createElement(Activity, { mode } as ActivityProps, createElement(Probe));
    const view = render(tree("visible"));

    view.rerender(tree("hidden"));
    expect(sent[0].signal.aborted).toBe(true);
    await answer(0, answered(POINTS, 3));
    expect(latest!.status).toBe("loading");

    view.rerender(tree("visible"));
    expect(sent).toHaveLength(2);
    await answer(1, answered(POINTS, 3));
    expect(latest!).toMatchObject({ status: "ready", responseId: 1 });

    view.rerender(tree("hidden"));
    view.rerender(tree("visible"));
    expect(sent).toHaveLength(2);
    expect(latest!.responseId).toBe(1);
  });
});
