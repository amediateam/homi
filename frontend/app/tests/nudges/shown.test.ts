import { defaultFilters, type SearchFilters } from "@homi/search";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn() }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: "ready", renewed: false }) }));

import type { LiveFlow } from "@/features/filters/flow";
import { FOLLOW_DELAY_MS } from "@/features/nudges/constants";
import { useMarkShownOnRender } from "@/features/nudges/shown";
import { emptyNudgeState, markReturnShown, readNudgeState, resetNudgeMemory } from "@/features/nudges/storage";
import { getNudgeSlot, type NudgeEnv, type NudgeKind, releaseSlot, resetNudgeSlot, takeSlot } from "@/features/nudges/store";
import { createFollowNudge } from "@/features/nudges/useFollowNudge";
import { clearTracked, recentTracked } from "@/lib/analytics/events";

const NOW = Date.parse("2026-11-18T09:00:00Z");
const CUSTOM: SearchFilters = { ...defaultFilters("rent_long", "tashkent"), rooms_min: 2, rooms_max: 2 };
const OTHER: SearchFilters = { ...defaultFilters("sale", "tashkent"), rooms_min: 3, rooms_max: 3 };

const ENV: NudgeEnv = {
  allowed: true,
  layer: false,
  filters: CUSTOM,
  toast: false,
  radars: [],
  radarsEnabled: true,
  limit: 10,
  referenceLoaded: true,
};

/** A nudge's component: it marks through the hook on each of its renders. */
function useNudge(kind: NudgeKind, mark: () => void) {
  useMarkShownOnRender(kind, mark);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  localStorage.clear();
  resetNudgeMemory();
  resetNudgeSlot();
  clearTracked();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  resetNudgeSlot();
});

describe("useMarkShownOnRender (LB-APP-050)", () => {
  it("marks once, in the effect of the first render in the slot; a re-render does not mark again", () => {
    const mark = vi.fn();
    takeSlot("follow");
    const view = renderHook(() => useNudge("follow", mark));
    expect(mark).toHaveBeenCalledTimes(1);
    view.rerender();
    view.rerender();
    expect(mark).toHaveBeenCalledTimes(1);
  });

  it("the remount of a suspended nudge marks nothing; a new occupancy of the slot marks again", () => {
    const mark = vi.fn();
    const ticket = takeSlot("return")!;
    renderHook(() => useNudge("return", mark)).unmount();
    renderHook(() => useNudge("return", mark)).unmount();
    expect(mark).toHaveBeenCalledTimes(1);

    releaseSlot("return", ticket);
    takeSlot("return");
    renderHook(() => useNudge("return", mark));
    expect(mark).toHaveBeenCalledTimes(2);
  });

  it("marks nothing while its kind does not hold the slot", () => {
    const mark = vi.fn();
    renderHook(() => useNudge("follow", mark));
    takeSlot("return");
    renderHook(() => useNudge("follow", mark));
    expect(mark).not.toHaveBeenCalled();
  });

  it("each kind keeps its own mark", () => {
    const follow = vi.fn();
    const home = vi.fn();
    takeSlot("home");
    renderHook(() => useNudge("home", home)).unmount();
    takeSlot("follow");
    renderHook(() => useNudge("follow", follow)).unmount();
    expect([home.mock.calls.length, follow.mock.calls.length]).toEqual([1, 1]);
  });
});

describe("a nudge dropped before its first render leaves no trace (LB-APP-050)", () => {
  it("a follow candidate dropped by a filter change — waiting, or ready under a toast — or by a return banner changes neither lastShown, asked nor back and sends no event", async () => {
    const requests: ((flow: LiveFlow | null) => void)[] = [];
    const nudge = createFollowNudge({ fetchFlow: () => new Promise((resolve) => requests.push(resolve)) });
    const disconnect = nudge.connect();
    nudge.sync(ENV);

    nudge.offer(CUSTOM);
    vi.advanceTimersByTime(FOLLOW_DELAY_MS - 1);
    nudge.sync({ ...ENV, filters: OTHER });

    nudge.sync(ENV);
    nudge.offer(CUSTOM);
    vi.advanceTimersByTime(FOLLOW_DELAY_MS);
    nudge.sync({ ...ENV, toast: true });
    requests.at(-1)!(null);
    await Promise.resolve();
    await Promise.resolve();
    nudge.sync({ ...ENV, toast: true, filters: OTHER });

    nudge.sync(ENV);
    nudge.offer(CUSTOM);
    vi.advanceTimersByTime(FOLLOW_DELAY_MS);
    takeSlot("return");
    requests.at(-1)!(null);
    await Promise.resolve();
    await Promise.resolve();

    expect(nudge.view()).toBeNull();
    expect(readNudgeState()).toEqual(emptyNudgeState());
    expect(recentTracked()).toEqual([]);
    expect(getNudgeSlot()).toEqual({ active: "return", followPending: false, returnPending: null });
    disconnect();
  });

  it("only the render marks: a nudge marked through the hook writes its state once", () => {
    const ticket = takeSlot("return")!;
    const mark = () => markReturnShown("h1", Date.now());
    renderHook(() => useNudge("return", mark)).unmount();
    vi.setSystemTime(NOW + 1000);
    renderHook(() => useNudge("return", mark)).unmount();
    expect(readNudgeState()).toMatchObject({ lastShown: NOW, back: { h1: NOW }, asked: ["h1"] });
    releaseSlot("return", ticket);
  });
});
