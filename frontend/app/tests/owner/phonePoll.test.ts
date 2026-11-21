import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/owner/store", () => ({ putOwnerListing: vi.fn() }));

import { PhonePoll, POLL_EVERY_MS, POLL_FOR_MS, POLL_LATE_MS, STALE_ERROR_MS } from "@/features/owner/steps/usePhonePoll";
import type { ApiResult } from "@/lib/api/types";

const ID = "01JF0000000000000000000004";
type Answer = ApiResult<never>;
const listing = (overrides: Record<string, unknown> = {}): Answer =>
  ({ ok: true, data: { id: ID, status: "draft", phone_set: false, phone_error: null, ...overrides }, meta: {} }) as never;
const offline: Answer = { ok: false, error: "offline", status: 0, method: "GET", path: "owner/listings/:id" } as never;

let answers: Answer[];
let reads: number;
let ends: unknown[];
let poll: PhonePoll;

beforeEach(() => {
  vi.useFakeTimers();
  answers = [];
  reads = 0;
  ends = [];
  poll = new PhonePoll(
    async () => {
      reads += 1;
      return answers.shift() ?? listing();
    },
    (end) => ends.push(end),
  );
});

afterEach(() => {
  poll.stop();
  vi.useRealTimers();
});

describe("PhonePoll (WP-81, BR-APP-084)", () => {
  it("reads at once, then every 1.5 s without overlap, and ends on phone_set", async () => {
    answers = [listing(), listing(), listing({ phone_set: true })];
    poll.start(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(reads).toBe(1);
    await vi.advanceTimersByTimeAsync(POLL_EVERY_MS);
    expect(reads).toBe(2);
    await vi.advanceTimersByTimeAsync(POLL_EVERY_MS);

    expect(ends).toEqual([{ kind: "set" }]);
    expect(poll.getState().polling).toBe(false);
  });

  it("ends on rejected and on a phone_error", async () => {
    answers = [listing({ status: "rejected" })];
    poll.start(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(ends).toEqual([{ kind: "rejected" }]);

    answers = [listing({ phone_error: "not_uz" })];
    poll.start(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(ends.at(-1)).toEqual({ kind: "error", error: "not_uz" });
  });

  it("ignores the error shown before the tap for 8 s as stale", async () => {
    answers = Array.from({ length: 10 }, () => listing({ phone_error: "not_own" }));
    poll.start("not_own");
    await vi.advanceTimersByTimeAsync(STALE_ERROR_MS - 100);
    expect(ends).toEqual([]);
    await vi.advanceTimersByTimeAsync(POLL_EVERY_MS);
    expect(ends).toEqual([{ kind: "error", error: "not_own" }]);
  });

  it("a failed read retries on the next tick; late after 20 s; stops after 90 s", async () => {
    answers = [offline];
    poll.start(null);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(POLL_EVERY_MS);
    expect(reads).toBe(2);

    await vi.advanceTimersByTimeAsync(POLL_LATE_MS);
    expect(poll.getState().late).toBe(true);
    await vi.advanceTimersByTimeAsync(POLL_FOR_MS);
    expect(poll.getState().polling).toBe(false);
    const stopped = reads;
    await vi.advanceTimersByTimeAsync(POLL_EVERY_MS * 3);
    expect(reads).toBe(stopped);
  });

  it("a return to the app reads at once, and starts again a poll that ran out", async () => {
    poll.start(null);
    await vi.advanceTimersByTimeAsync(0);
    poll.visible();
    await vi.advanceTimersByTimeAsync(0);
    expect(reads).toBe(2);

    await vi.advanceTimersByTimeAsync(POLL_FOR_MS + POLL_EVERY_MS);
    expect(poll.getState().polling).toBe(false);
    poll.visible();
    expect(poll.getState().polling).toBe(true);
  });

  it("a return after an answer ended the poll starts nothing (first review)", async () => {
    answers = [listing({ status: "rejected" })];
    poll.start(null);
    await vi.advanceTimersByTimeAsync(0);
    poll.visible();

    expect(poll.getState().polling).toBe(false);
    expect(ends).toHaveLength(1);
  });

  it("does nothing on a return before any start", async () => {
    poll.visible();
    await vi.advanceTimersByTimeAsync(POLL_EVERY_MS);
    expect(reads).toBe(0);
  });
});
