import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/bootstrap", () => ({ reauthenticate: async () => false }));
vi.mock("@/lib/data/sources", () => ({ reportSource: () => undefined }));

const { anySignal, BFF_TIMEOUT_MS, bffFetch } = await import("@/lib/api/browser");
const { clearAuth, setCookieAuth } = await import("@/lib/session/store");

const nativeAny = Object.getOwnPropertyDescriptor(AbortSignal, "any");

/** An engine the boot test admits but that has no `AbortSignal.any` (Chrome 111–115, Safari 16.4–17.3). */
function withoutAny(): void {
  Reflect.deleteProperty(AbortSignal, "any");
}

/** The `abort` listeners `signal` holds now: added minus removed. */
function listenerCount(signal: AbortSignal): () => number {
  let count = 0;
  const add = signal.addEventListener.bind(signal);
  const remove = signal.removeEventListener.bind(signal);
  vi.spyOn(signal, "addEventListener").mockImplementation((type, listener, options) => {
    if (type === "abort") {
      count += 1;
    }
    add(type, listener, options);
  });
  vi.spyOn(signal, "removeEventListener").mockImplementation((type, listener, options) => {
    if (type === "abort") {
      count -= 1;
    }
    remove(type, listener, options);
  });
  return () => count;
}

let fetched: AbortSignal[] = [];
let answer: (() => Promise<Response>) | null = null;

beforeEach(() => {
  fetched = [];
  answer = null;
  setCookieAuth(null);
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init: RequestInit & { signal: AbortSignal }) => {
      fetched.push(init.signal);
      if (answer !== null) {
        return answer();
      }
      return new Promise<Response>((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
    }),
  );
});

afterEach(() => {
  if (nativeAny !== undefined) {
    Object.defineProperty(AbortSignal, "any", nativeAny);
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearAuth();
});

describe("anySignal (review C-1)", () => {
  it("uses AbortSignal.any where the engine has it", () => {
    const any = vi.spyOn(AbortSignal, "any");
    const first = new AbortController();

    anySignal([first.signal, new AbortController().signal]);

    expect(any).toHaveBeenCalledTimes(1);
  });

  it("without it: aborts with the reason of the first signal that aborts, and drops every listener", () => {
    withoutAny();
    expect(typeof AbortSignal.any).toBe("undefined");
    const caller = new AbortController();
    const timeout = new AbortController();
    const callerListeners = listenerCount(caller.signal);
    const timeoutListeners = listenerCount(timeout.signal);

    const { signal } = anySignal([caller.signal, timeout.signal]);
    expect(signal.aborted).toBe(false);
    expect([callerListeners(), timeoutListeners()]).toEqual([1, 1]);

    timeout.abort(new DOMException("No answer in time.", "TimeoutError"));
    expect(signal.aborted).toBe(true);
    expect((signal.reason as DOMException).name).toBe("TimeoutError");
    expect([callerListeners(), timeoutListeners()]).toEqual([0, 0]);

    caller.abort();
    expect((signal.reason as DOMException).name).toBe("TimeoutError");
  });

  it("without it: a signal already aborted gives an aborted signal and adds no listener", () => {
    withoutAny();
    const caller = new AbortController();
    caller.abort(new DOMException("gone", "AbortError"));
    const timeout = new AbortController();
    const timeoutListeners = listenerCount(timeout.signal);

    const { signal } = anySignal([caller.signal, timeout.signal]);

    expect(signal.aborted).toBe(true);
    expect((signal.reason as DOMException).message).toBe("gone");
    expect(timeoutListeners()).toBe(0);
  });

  it("without it: release() drops the listeners of a request that ended without an abort", () => {
    withoutAny();
    const caller = new AbortController();
    const callerListeners = listenerCount(caller.signal);

    const { release } = anySignal([caller.signal, new AbortController().signal]);
    release();

    expect(callerListeners()).toBe(0);
  });
});

describe("bffFetch without AbortSignal.any (review C-1)", () => {
  beforeEach(withoutAny);

  it("a caller's abort aborts the fetch and rejects with its AbortError", async () => {
    const caller = new AbortController();
    const pending = bffFetch("listings/count", { signal: caller.signal });
    await vi.waitFor(() => expect(fetched).toHaveLength(1));

    caller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetched[0].aborted).toBe(true);
  });

  it("no answer within 15 s is still a timeout, with a caller's signal too", async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    const callerListeners = listenerCount(caller.signal);
    const pending = bffFetch("listings/count", { signal: caller.signal });

    await vi.advanceTimersByTimeAsync(BFF_TIMEOUT_MS);

    await expect(pending).resolves.toMatchObject({ ok: false, error: "timeout", status: 0 });
    expect(caller.signal.aborted).toBe(false);
    expect(callerListeners()).toBe(0);
  });

  it("an answered request leaves no listener on the caller's signal", async () => {
    answer = async () => Response.json({ success: true, data: { count: 3 }, meta: { source: "stub" } });
    const caller = new AbortController();
    const callerListeners = listenerCount(caller.signal);

    await expect(bffFetch("listings/count", { signal: caller.signal })).resolves.toMatchObject({ ok: true, data: { count: 3 } });

    expect(callerListeners()).toBe(0);
    expect(fetched[0].aborted).toBe(false);
  });
});
