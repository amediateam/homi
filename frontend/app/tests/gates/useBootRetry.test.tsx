import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  status: "booting" as string,
  error: null as string | null,
  pending: false,
  reason: null as string | null,
  /** Resolves the attempt in flight: the outcome is written to the state first. */
  settle: null as null | (() => void),
  retry: vi.fn(),
}));
vi.mock("@/lib/session/SessionProvider", () => ({
  useSession: () => ({ status: state.status, error: state.error, pending: state.pending, reason: state.reason, retry: state.retry }),
}));

import { bootFailureKind, resetBootRetry, retryBoot, useBootRetryState } from "@/features/gates/bootRetryStore";
import { BOOT_RETRY_DELAYS_MS, RECHECK_COUNT, RECHECK_DELAY_MS, useBootRetry } from "@/features/gates/useBootRetry";

/** The one instance and a reader of what it publishes, as the shell and the gate pages read it. */
function Probe() {
  useBootRetry();
  const { failed, kind, checking, retry } = useBootRetryState();
  return (
    <button type="button" data-failed={failed} data-kind={kind ?? ""} data-checking={checking} onClick={retry}>
      retry
    </button>
  );
}

function shown() {
  const button = document.querySelector("button")!;
  return { failed: button.dataset.failed === "true", kind: button.dataset.kind || null, checking: button.dataset.checking === "true" };
}

function mount(change: Partial<typeof state> = {}) {
  Object.assign(state, change);
  return render(<Probe />);
}

/** The attempt in flight ends with `change` (the session's outcome), then the hook renders again. */
async function outcome(change: Partial<Pick<typeof state, "status" | "error" | "reason">>) {
  Object.assign(state, change, { pending: false });
  const settle = state.settle;
  state.settle = null;
  await act(async () => {
    settle?.();
  });
}

function visible() {
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(state, { status: "booting", error: null, pending: false, reason: null, settle: null });
  state.retry.mockReset();
  state.retry.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        state.settle = resolve;
      }),
  );
});

afterEach(() => {
  cleanup();
  resetBootRetry();
  vi.useRealTimers();
});

describe("useBootRetry (BR-APP-054, D-S-3)", () => {
  it("pins the waits of BR-APP-054", () => {
    expect(BOOT_RETRY_DELAYS_MS).toEqual([1_000, 3_000, 7_000, 15_000, 30_000]);
    expect(RECHECK_COUNT).toBe(3);
    expect(RECHECK_DELAY_MS).toBe(2_500);
  });

  it("retries a failed sign-in after 1 / 3 / 7 / 15 / 30 s, then stops and shows the offline error", async () => {
    mount({ error: "offline" });
    // The attempts start at ≈ 0 / 1 / 4 / 11 / 26 / 56 s.
    for (const [index, delay] of [1_000, 3_000, 7_000, 15_000, 30_000].entries()) {
      act(() => vi.advanceTimersByTime(delay - 1));
      expect(state.retry).toHaveBeenCalledTimes(index);
      act(() => vi.advanceTimersByTime(1));
      expect(state.retry).toHaveBeenCalledTimes(index + 1);
      expect(shown().failed).toBe(false);
      await outcome({ error: index % 2 === 0 ? "timeout" : "offline" });
    }

    expect(shown()).toMatchObject({ failed: true, kind: "offline", checking: false });
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(120_000));
    expect(state.retry).toHaveBeenCalledTimes(5);
  });

  it("a server error or 429 ends in the server kind", async () => {
    for (const last of ["server", "rate_limited"] as const) {
      const view = mount({ error: "offline" });
      for (const [index, delay] of BOOT_RETRY_DELAYS_MS.entries()) {
        act(() => vi.advanceTimersByTime(delay));
        await outcome({ error: index === BOOT_RETRY_DELAYS_MS.length - 1 ? last : "server" });
      }
      expect(shown(), last).toMatchObject({ failed: true, kind: "server" });
      view.unmount();
      resetBootRetry();
      Object.assign(state, { error: null, settle: null });
    }
  });

  it("maps the outcome of the last attempt to the ErrorState kind (D-S-1)", () => {
    expect(bootFailureKind("offline")).toBe("offline");
    expect(bootFailureKind("timeout")).toBe("offline");
    expect(bootFailureKind("server")).toBe("server");
    expect(bootFailureKind("rate_limited")).toBe("server");
  });

  it("waits while the first attempt is in flight; the delay counts from the failure", async () => {
    const view = mount({ pending: true });
    act(() => vi.advanceTimersByTime(5_000));
    expect(state.retry).not.toHaveBeenCalled();

    Object.assign(state, { pending: false, error: "offline" });
    view.rerender(<Probe />);
    act(() => vi.advanceTimersByTime(999));
    expect(state.retry).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(state.retry).toHaveBeenCalledTimes(1);
  });

  it("«Повторить» resets the counter and tries at once", async () => {
    mount({ error: "server" });
    for (const delay of BOOT_RETRY_DELAYS_MS) {
      act(() => vi.advanceTimersByTime(delay));
      await outcome({ error: "server" });
    }
    expect(shown().failed).toBe(true);

    act(() => document.querySelector("button")!.click());
    expect(state.retry).toHaveBeenCalledTimes(6);
    expect(shown().failed).toBe(false);
    // A second tap while that attempt is in flight starts nothing.
    act(() => retryBoot());
    expect(state.retry).toHaveBeenCalledTimes(6);

    await outcome({ error: "server" });
    act(() => vi.advanceTimersByTime(1_000));
    expect(state.retry).toHaveBeenCalledTimes(7);
  });

  it("a success clears what was scheduled", async () => {
    const view = mount({ error: "offline" });
    Object.assign(state, { status: "ready", error: null });
    view.rerender(<Probe />);
    act(() => vi.advanceTimersByTime(60_000));
    expect(state.retry).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("re-checks a refusal 3 times at 2.5 s, with the checking line meanwhile", async () => {
    mount({ status: "denied", reason: "join" });
    expect(shown().checking).toBe(true);
    for (let check = 1; check <= 3; check += 1) {
      act(() => vi.advanceTimersByTime(RECHECK_DELAY_MS - 1));
      expect(state.retry).toHaveBeenCalledTimes(check - 1);
      act(() => vi.advanceTimersByTime(1));
      expect(state.retry).toHaveBeenCalledTimes(check);
      expect(shown().checking).toBe(true);
      await outcome({ status: "denied", reason: "join" });
    }

    expect(shown().checking).toBe(false);
    act(() => vi.advanceTimersByTime(30_000));
    expect(state.retry).toHaveBeenCalledTimes(3);
  });

  it("re-checks paused 3 times as the other refusals, with the checking line (WP-36, DEC-60)", async () => {
    mount({ status: "denied", reason: "paused" });
    expect(shown().checking).toBe(true);
    for (let check = 1; check <= 3; check += 1) {
      act(() => vi.advanceTimersByTime(RECHECK_DELAY_MS));
      expect(state.retry).toHaveBeenCalledTimes(check);
      await outcome({ status: "denied", reason: "paused" });
    }

    expect(shown().checking).toBe(false);
    act(() => vi.advanceTimersByTime(30_000));
    expect(state.retry).toHaveBeenCalledTimes(3);
  });

  it("returning to the app re-checks paused at once", async () => {
    mount({ status: "denied", reason: "paused" });
    visible();
    expect(state.retry).toHaveBeenCalledTimes(1);
  });

  it("never re-checks blocked, and shows no checking line for it", () => {
    mount({ status: "denied", reason: "blocked" });
    act(() => vi.advanceTimersByTime(10_000));
    expect(state.retry).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(shown().checking).toBe(false);
  });

  it("returning to the app resets both counters and tries once at once — blocked too", async () => {
    mount({ status: "denied", reason: "blocked" });
    visible();
    expect(state.retry).toHaveBeenCalledTimes(1);
    expect(shown().checking).toBe(false);
    // Another visibility event while that attempt is in flight starts nothing.
    visible();
    expect(state.retry).toHaveBeenCalledTimes(1);

    await outcome({ status: "denied", reason: "join" });
    act(() => vi.advanceTimersByTime(RECHECK_DELAY_MS));
    expect(state.retry).toHaveBeenCalledTimes(2);
  });

  it("returning to the app restarts the sign-in series from the first delay", async () => {
    mount({ error: "offline" });
    for (const delay of BOOT_RETRY_DELAYS_MS.slice(0, 3)) {
      act(() => vi.advanceTimersByTime(delay));
      await outcome({ error: "offline" });
    }
    expect(state.retry).toHaveBeenCalledTimes(3);

    visible();
    expect(state.retry).toHaveBeenCalledTimes(4);
    await outcome({ error: "offline" });
    act(() => vi.advanceTimersByTime(1_000));
    expect(state.retry).toHaveBeenCalledTimes(5);
  });

  it("a refusal re-check counter is reset by a return to the app", async () => {
    mount({ status: "denied", reason: "full" });
    for (let check = 0; check < 3; check += 1) {
      act(() => vi.advanceTimersByTime(RECHECK_DELAY_MS));
      await outcome({ status: "denied", reason: "full" });
    }
    expect(state.retry).toHaveBeenCalledTimes(3);

    visible();
    expect(state.retry).toHaveBeenCalledTimes(4);
    expect(shown().checking).toBe(true);
    await outcome({ status: "denied", reason: "full" });
    act(() => vi.advanceTimersByTime(RECHECK_DELAY_MS));
    expect(state.retry).toHaveBeenCalledTimes(5);
  });

  it("returning to the app does nothing once ready, nor while the first attempt is in flight", () => {
    const view = mount({ status: "ready" });
    visible();
    expect(state.retry).not.toHaveBeenCalled();

    Object.assign(state, { status: "booting", pending: true });
    view.rerender(<Probe />);
    visible();
    expect(state.retry).not.toHaveBeenCalled();
  });

  it("an expired session and the outside page schedule nothing", () => {
    const view = mount({ status: "expired" });
    visible();
    act(() => vi.advanceTimersByTime(60_000));
    expect(state.retry).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    Object.assign(state, { status: "outside" });
    view.rerender(<Probe />);
    visible();
    act(() => vi.advanceTimersByTime(60_000));
    expect(state.retry).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("unmounting clears the timers and the visibility listener", () => {
    const view = mount({ error: "offline" });
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    visible();
    act(() => vi.advanceTimersByTime(60_000));
    expect(state.retry).not.toHaveBeenCalled();
  });
});
