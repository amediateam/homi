import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearTracked, track } from "@/lib/analytics/events";
import { BODY_MAX_BYTES, bodyOf, discard, flush, queuedEvents, QUEUE_MAX, resetJournal } from "@/lib/analytics/journal";
import { clearAuth, setCookieAuth, setHeaderAuth } from "@/lib/session/store";

type Sent = { url: string; init: RequestInit };
let sent: Sent[] = [];
let answer: () => Promise<Response>;

beforeEach(() => {
  resetJournal();
  clearTracked();
  clearAuth();
  sent = [];
  answer = async () => new Response(null, { status: 204 });
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      sent.push({ url, init });
      return answer();
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearAuth();
});

const body = (index: number) => JSON.parse(String(sent[index]?.init.body)) as { name: string; props: Record<string, unknown> };

describe("the journal (WP-32, 03 §3.3; DEC-41, DEC-44)", () => {
  it("waits for the session: nothing is sent before flush(), then the queue goes in order with the values of its time", () => {
    setCookieAuth(null);
    track("app_launch", { entry: "menu", ms: 120, v: "dev", js: "40", platform: "ios", tg: "8.0" });
    track("follow_prompt_shown");
    expect(sent).toEqual([]);
    expect(queuedEvents()).toHaveLength(2);

    flush();
    expect(sent.map((call) => call.url)).toEqual(["/bff/events", "/bff/events"]);
    expect(body(0)).toEqual({ name: "app_launch", props: { entry: "menu", ms: 120, v: "dev", js: "40", platform: "ios", tg: "8.0" } });
    expect(body(1)).toEqual({ name: "follow_prompt_shown", props: {} });

    track("listing_shared", { listing_id: 100001 });
    expect(body(2)).toEqual({ name: "listing_shared", props: { listing_id: 100001 } });
  });

  it("posts JSON with keepalive; the bearer token only in header mode", () => {
    setCookieAuth(null);
    flush();
    track("contact_write", { listing_id: 7 });
    expect(sent[0]?.init).toMatchObject({ method: "POST", keepalive: true, credentials: "same-origin" });
    expect(sent[0]?.init.headers).not.toHaveProperty("Authorization");

    setHeaderAuth("12|token", null);
    track("contact_write", { listing_id: 8 });
    expect(sent[1]?.init.headers).toMatchObject({ Authorization: "Bearer 12|token", "Content-Type": "application/json" });
  });

  it("keeps at most 20 before the session, the oldest dropped", () => {
    for (let index = 0; index < QUEUE_MAX + 5; index += 1) {
      track("listing_shared", { listing_id: index });
    }
    expect(queuedEvents()).toHaveLength(QUEUE_MAX);
    expect(queuedEvents()[0]?.props).toEqual({ listing_id: 5 });
  });

  it("discard() on a refused, outside or expired session drops the queue and sends nothing after", () => {
    setCookieAuth(null);
    track("follow_prompt_shown");
    discard();
    track("follow_prompt_closed");
    flush();

    expect(sent).toEqual([]);
  });

  it("swallows a 401, a network error and a fetch that throws at once; nothing re-authenticates", async () => {
    setCookieAuth(null);
    flush();
    answer = async () => new Response(null, { status: 401 });
    track("follow_prompt_shown");
    answer = () => Promise.reject(new TypeError("Failed to fetch"));
    track("follow_prompt_closed");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new TypeError("keepalive not supported");
      }),
    );
    expect(() => track("follow_prompt_expired")).not.toThrow();
    await Promise.resolve();

    expect(sent.map((call) => call.url)).toEqual(["/bff/events", "/bff/events"]);
  });

  it("sends nothing without a session in the store", () => {
    flush();
    track("follow_prompt_shown");

    expect(sent).toEqual([]);
  });

  it("scrubs the body; over 8 KB the error's message and source are emptied, and a body still over is dropped", () => {
    expect(bodyOf({ name: "app_error", props: { error: { message: "call +998901234567" } } })).toBe(
      JSON.stringify({ name: "app_error", props: { error: { message: "call +998***" } } }),
    );

    const big = "x".repeat(BODY_MAX_BYTES);
    const cut = JSON.parse(bodyOf({ name: "app_error", props: { v: "dev", error: { kind: "error", message: big, source: big } } })!);
    expect(cut.props.error).toEqual({ kind: "error", message: "", source: "" });

    expect(bodyOf({ name: "listing_shared", props: { listing_id: 1, extra: big } })).toBeNull();
  });
});
