import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDemand } from "@/features/owner/demand/useDemand";
import { usePlaceLabel } from "@/features/owner/place/usePlaceLabel";
import { normalizeForm } from "@/features/owner/normalize";
import { resetReference } from "@/lib/reference/useReference";

import { cityOf, feedReference } from "../helpers/reference";

/**
 * A read that its effect aborts must not become an unhandled rejection (WP-33: the session-mode checks saw "signal is
 * aborted without reason" from the place picker; the global error report would send it as `app_error`).
 */
let unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);

beforeEach(() => {
  vi.useFakeTimers();
  unhandled = [];
  process.on("unhandledRejection", onUnhandled);
  feedReference({ cities: [cityOf()], reference: { rates: { usd_uzs: 12_800 } } as never });
  // A read that answers only by failing when it is aborted.
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)))),
  );
});

afterEach(() => {
  cleanup();
  resetReference();
  process.off("unhandledRejection", onUnhandled);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Lets the timers and the microtasks run, so an unhandled rejection would be reported. */
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000);
  });
  vi.useRealTimers();
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe("aborted reads of the owner form", () => {
  it("the place label: a move of the map aborts the read in flight without an unhandled rejection", async () => {
    const { rerender } = renderHook(({ lat }) => usePlaceLabel({ lat, lon: 69.24 }, false), { initialProps: { lat: 41.31 } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    rerender({ lat: 41.32 });
    await settle();
    expect(unhandled).toEqual([]);
  });

  it("the demand: a change of the form aborts the read in flight without an unhandled rejection", async () => {
    const { rerender } = renderHook(({ rooms }) => useDemand(normalizeForm({ city: "tashkent", rooms })), { initialProps: { rooms: 2 } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    rerender({ rooms: 3 });
    await settle();
    expect(unhandled).toEqual([]);
  });
});
