import { defaultFilters, type SearchFilters, toApiQuery } from "@homi/search";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BffOptions } from "@/lib/api/browser";
import type { UiError } from "@/lib/api/errors";
import type { ApiResult } from "@/lib/api/types";

/** One `bffFetch` the hook sent; the test answers it when it wants, and an abort rejects it as `bffFetch` does. */
interface Sent {
  path: string;
  query: string;
  signal: AbortSignal;
  resolve: (answer: ApiResult<unknown>) => void;
}

const sent: Sent[] = [];
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string, options: BffOptions) =>
    new Promise<ApiResult<unknown>>((resolve, reject) => {
      const signal = options.signal!;
      signal.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
      sent.push({ path, query: String(options.query), signal, resolve });
    }),
}));

import { COUNT_DELAY_MS, FLOW_DELAY_MS, type LiveStatsOptions, normalizeFlow, useLiveStats } from "@/features/filters/useLiveStats";
import { searchRules } from "@/lib/search/rules";

import { withDevFlags } from "../helpers/flags";

const BASE = defaultFilters("rent_long", "tashkent");
const FLOW = { week: 21, days: 7, options: [{ code: "price_up", label: "Цена до $700", rate: "≈5 в день", count: 35, filters: { ...BASE, price_max: 700 } }] };

const ok = (data: unknown): ApiResult<unknown> => ({ ok: true, data, meta: { source: "stub" } });
const failed = (error: UiError, status: number, code?: string): ApiResult<unknown> => ({
  ok: false,
  error,
  status,
  ...(code === undefined ? {} : { code }),
  method: "GET",
  path: "listings/count",
});

const of = (path: string) => sent.filter((request) => request.path === path);
const answer = (request: Sent, value: ApiResult<unknown>) => act(async () => request.resolve(value));
const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

function stats(draft: SearchFilters = BASE, options: LiveStatsOptions = { flow: true }) {
  return renderHook(({ draft: current, options: opts }) => useLiveStats(current, opts), { initialProps: { draft, options } });
}

beforeEach(() => {
  sent.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useLiveStats (WP-25)", () => {
  it("sends one count 250 ms and one flow 500 ms after the last of three quick changes, with the query of toApiQuery", async () => {
    const view = stats();
    await wait(100);
    view.rerender({ draft: { ...BASE, rooms_min: 1 }, options: { flow: true } });
    await wait(100);
    view.rerender({ draft: { ...BASE, rooms_min: 2 }, options: { flow: true } });
    await wait(100);
    const last = { ...BASE, rooms_min: 2, price_max: 700 };
    view.rerender({ draft: last, options: { flow: true } });

    await wait(COUNT_DELAY_MS - 1);
    expect(sent).toHaveLength(0);
    await wait(1);
    expect(of("listings/count")).toHaveLength(1);
    expect(of("listings/flow")).toHaveLength(0);
    await wait(FLOW_DELAY_MS - COUNT_DELAY_MS);
    expect(of("listings/flow")).toHaveLength(1);

    expect(sent.map((request) => request.query)).toEqual([toApiQuery(last).toString(), toApiQuery(last).toString()]);
    expect(view.result.current).toEqual({ count: null, flow: null });

    await answer(of("listings/count")[0], ok({ count: 42 }));
    await answer(of("listings/flow")[0], ok(FLOW));
    expect(view.result.current).toEqual({ count: 42, flow: FLOW });
  });

  it("a change aborts the requests in flight; their late answers are never shown", async () => {
    const view = stats();
    await wait(FLOW_DELAY_MS);
    const [count, flow] = sent;
    expect([count.path, flow.path]).toEqual(["listings/count", "listings/flow"]);

    view.rerender({ draft: { ...BASE, owner: "owners" }, options: { flow: true } });
    expect(count.signal.aborted).toBe(true);
    expect(flow.signal.aborted).toBe(true);
    await answer(count, ok({ count: 999 }));
    await answer(flow, ok(FLOW));
    expect(view.result.current).toEqual({ count: null, flow: null });

    await wait(FLOW_DELAY_MS);
    expect(sent).toHaveLength(4);
    expect(sent[2].query).toContain("owner=owners");
    await answer(sent[2], ok({ count: 7 }));
    expect(view.result.current.count).toBe(7);
  });

  it("detects a change by value: an equal draft sends nothing new, a posted_days change does", async () => {
    const view = stats(BASE, { flow: false });
    await wait(COUNT_DELAY_MS);
    await answer(sent[0], ok({ count: 10 }));

    view.rerender({ draft: { ...BASE }, options: { flow: false } });
    await wait(FLOW_DELAY_MS);
    expect(sent).toHaveLength(1);
    expect(sent[0].signal.aborted).toBe(false);

    view.rerender({ draft: { ...BASE, posted_days: 3 }, options: { flow: false } });
    await wait(COUNT_DELAY_MS);
    expect(sent).toHaveLength(2);
    expect(sent[1].query).toContain("posted_days=3");
  });

  it("an error keeps the previous count and flow (offline, timeout, 503 source_unavailable)", async () => {
    const view = stats();
    await wait(FLOW_DELAY_MS);
    await answer(sent[0], ok({ count: 42 }));
    await answer(sent[1], ok(FLOW));

    const failures = [failed("offline", 0), failed("timeout", 0), failed("source_unavailable", 503, "source_unavailable")];
    for (const [index, failure] of failures.entries()) {
      view.rerender({ draft: { ...BASE, rooms_min: index + 1 }, options: { flow: true } });
      await wait(FLOW_DELAY_MS);
      await answer(of("listings/count").at(-1)!, failure);
      await answer(of("listings/flow").at(-1)!, failure);
      expect(view.result.current).toEqual({ count: 42, flow: FLOW });
    }
  });

  it("a malformed count keeps the previous one; a flow answer normalizeFlow refuses hides the flow", async () => {
    const view = stats();
    await wait(FLOW_DELAY_MS);
    await answer(sent[0], ok({ count: 42 }));
    await answer(sent[1], ok(FLOW));

    view.rerender({ draft: { ...BASE, rooms_min: 1 }, options: { flow: true } });
    await wait(FLOW_DELAY_MS);
    await answer(sent[2], ok({ count: "many" }));
    await answer(sent[3], ok({ week: 3, days: 0, options: [] }));
    expect(view.result.current).toEqual({ count: 42, flow: null });
  });

  it("counts only without flow: no flow request, flow stays null", async () => {
    const view = stats(BASE, { flow: false });
    await wait(FLOW_DELAY_MS * 2);

    expect(sent.map((request) => request.path)).toEqual(["listings/count"]);
    await answer(sent[0], ok({ count: 0 }));
    expect(view.result.current).toEqual({ count: 0, flow: null });

    const plain = renderHook(() => useLiveStats(BASE));
    await wait(FLOW_DELAY_MS * 2);
    expect(of("listings/flow")).toHaveLength(0);
    expect(plain.result.current.flow).toBeNull();
  });

  it("counts the ranges that will be applied when rules are given (dev025ValidateRanges)", async () => {
    const inverted = { ...BASE, price_min: 900, price_max: 300 };
    stats(inverted, { flow: false, rules: withDevFlags({ dev025ValidateRanges: true }, searchRules) });
    await wait(COUNT_DELAY_MS);
    stats(inverted, { flow: false });
    await wait(COUNT_DELAY_MS);

    const swapped = new URLSearchParams(sent[0].query);
    const typed = new URLSearchParams(sent[1].query);
    expect([swapped.get("price_min"), swapped.get("price_max")]).toEqual(["300", "900"]);
    expect([typed.get("price_min"), typed.get("price_max")]).toEqual(["900", "300"]);
  });

  it("after unmount nothing is sent and nothing is written", async () => {
    const errors = vi.spyOn(console, "error");
    const view = stats();
    await wait(COUNT_DELAY_MS);
    const [count] = sent;

    view.unmount();
    expect(count.signal.aborted).toBe(true);
    await answer(count, ok({ count: 5 }));
    await wait(FLOW_DELAY_MS * 2);

    expect(sent).toHaveLength(1);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe("normalizeFlow (WP-25)", () => {
  it("refuses anything without a numeric weekly total and a day count above zero", () => {
    for (const value of [undefined, null, {}, [], "21", { week: 21 }, { days: 7 }, { week: 21, days: 0 }, { week: 21, days: -1 }]) {
      expect(normalizeFlow(value)).toBeNull();
    }
    for (const value of [{ week: -1, days: 7 }, { week: "21", days: 7 }, { week: Number.NaN, days: 7 }, { week: 21, days: Infinity }]) {
      expect(normalizeFlow(value)).toBeNull();
    }
  });

  it("takes a valid answer; a missing option list is empty and a zero week is valid", () => {
    expect(normalizeFlow(FLOW)).toEqual(FLOW);
    expect(normalizeFlow({ week: 0, days: 7 })).toEqual({ week: 0, days: 7, options: [] });
  });

  it("drops malformed options and keeps the rest; a bad option count is null", () => {
    const option = FLOW.options[0];
    const flow = normalizeFlow({
      week: 3,
      days: 7,
      options: [option, null, "x", { ...option, code: 1 }, { ...option, label: undefined }, { ...option, rate: null }, { ...option, filters: "city=x" }, { ...option, code: "rooms_any", count: -2 }],
    });

    expect(flow?.options).toEqual([option, { ...option, code: "rooms_any", count: null }]);
  });
});
