import { createHash } from "node:crypto";

import { fakeTelegram, syntheticInitData, type FakeTelegram } from "@homi/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SDK_WAIT_MS } from "@/lib/telegram/wait";

/** The address fragment at each `track` call: the scrub must come first (TMA-009). */
const tracked = vi.hoisted(() => ({ hashes: [] as string[] }));
vi.mock("@/lib/analytics/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics/events")>();
  return {
    ...actual,
    track: (...args: Parameters<typeof actual.track>) => {
      tracked.hashes.push(window.location.hash);
      actual.track(...args);
    },
  };
});

const me = { locale: "uz", locale_chosen: true, currency: "UZS", theme: "dark", city: "tashkent", city_chosen: true, team: false, analytics: null };
const TOKEN = "9|launchtoken";
const tag = (id: number) => createHash("sha256").update(String(id)).digest("hex");
const USER = 100_000_001;

/** A status and a body, and the answer's own headers when it has any. */
type Answer = [number, unknown] | [number, unknown, Record<string, string>] | "network";
interface Calls {
  get: (string | null)[];
  post: string[];
}

let fake: FakeTelegram | null = null;
let calls: Calls;

/** A fake `/bff/session`: `get` answers by the bearer header, `post` by the launch data; an answer may be held. */
function server(handlers: { get?: (bearer: string | null) => Answer | Promise<Answer>; post?: () => Answer | Promise<Answer> }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/bff/session");
      const headers = new Headers(init?.headers);
      const method = init?.method ?? "GET";
      let answer: Answer;
      if (method === "POST") {
        calls.post.push(String(init?.body));
        answer = (await handlers.post?.()) ?? [500, {}];
      } else {
        const bearer = headers.get("authorization");
        calls.get.push(bearer);
        answer = (await handlers.get?.(bearer)) ?? [200, { mode: "none" }];
      }
      if (answer === "network") {
        throw new TypeError("Failed to fetch");
      }
      return new Response(JSON.stringify(answer[1]), { status: answer[0], headers: { "content-type": "application/json", ...answer[2] } });
    }),
  );
}

const signedIn = (): Answer => [200, { token: TOKEN, expiresAt: "2099-01-01T00:00:00+00:00", me }];

async function load(options: { telegram?: boolean; startParam?: string } = {}) {
  if (options.telegram !== false) {
    fake = fakeTelegram({ initData: syntheticInitData({ id: USER }, { startParam: options.startParam }) });
  }
  vi.resetModules();
  const session = await import("@/lib/session/bootstrap");
  const store = await import("@/lib/session/store");
  const events = await import("@/lib/analytics/events");
  // The mocked module keeps one buffer across module resets.
  events.clearTracked();
  return { session, store, events };
}

beforeEach(() => {
  calls = { get: [], post: [] };
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  vi.useRealTimers();
  fake?.uninstall();
  fake = null;
  document.getElementById("tg-sdk")?.remove();
  delete (window as unknown as Record<string, unknown>).__homiBoot;
});

/** An answer that waits until `release()`. */
function held(answer: Answer): { answer: () => Promise<Answer>; release: () => void } {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  return { answer: async () => (await gate, answer), release };
}

describe("session bootstrap (25 §3.4)", () => {
  it("without launch data is outside and asks nothing", async () => {
    server({});
    const { session } = await load({ telegram: false });

    await session.startSession();

    expect(session.getSession().status).toBe("outside");
    expect(calls.get).toEqual([]);
  });

  it("a valid cookie of the same Telegram user is ready without a sign-in", async () => {
    server({ get: () => [200, { mode: "cookie", me, user: tag(USER) }] });
    const { session, events, store } = await load({ startParam: "l_42" });

    await session.startSession();

    expect(session.getSession()).toMatchObject({ status: "ready", mode: "cookie", me, renewed: false });
    expect(calls.post).toEqual([]);
    expect(store.getAuth()).toEqual({ mode: "cookie" });
    expect(events.recentTracked().map((event) => event.name)).toEqual(["app_launch", "app_opened"]);
    expect(events.recentTracked()[1].props).toMatchObject({ entry: "link", listing_id: 42 });
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("app_launch carries tg, Telegram's WebApp version as the client reports it (WP-36)", async () => {
    server({ get: () => [200, { mode: "cookie", me, user: tag(USER) }] });
    const { session, events } = await load({ startParam: "l_42" });

    await session.startSession();

    const launch = events.recentTracked().find((event) => event.name === "app_launch");
    expect(launch?.props).toMatchObject({ entry: "link", tg: "9.0" });
  });

  it("a cookie of another Telegram user signs in again", async () => {
    let signed = false;
    server({
      get: () => [200, { mode: "cookie", me, user: signed ? tag(USER) : tag(7) }],
      post: () => {
        signed = true;
        return signedIn();
      },
    });
    const { session } = await load();

    await session.startSession();

    expect(calls.post).toHaveLength(1);
    expect(JSON.parse(calls.post[0])).toEqual({ initData: fake?.webApp.initData });
    // What the server rendered with the other user's cookie is not this session's (WP-24).
    expect(session.getSession()).toMatchObject({ status: "ready", mode: "cookie", renewed: true });
  });

  it("cookie mode drops the token from the sign-in answer", async () => {
    let signed = false;
    server({
      get: () => (signed ? [200, { mode: "cookie", me, user: tag(USER) }] : [200, { mode: "none" }]),
      post: () => {
        signed = true;
        return signedIn();
      },
    });
    const { session, store } = await load();

    await session.startSession();

    expect(store.getAuth()).toEqual({ mode: "cookie" });
  });

  it("header mode keeps the token in memory and writes it nowhere", async () => {
    const writes: string[] = [];
    const spy = (target: object, member: string) =>
      vi.spyOn(target as Record<string, (...args: unknown[]) => unknown>, member).mockImplementation((...args: unknown[]) => void writes.push(JSON.stringify(args)));
    spy(Storage.prototype, "setItem");
    spy(window.history, "pushState");
    spy(window.history, "replaceState");
    const cookieWrites = vi.spyOn(document, "cookie", "set").mockImplementation((value) => void writes.push(value));
    server({
      get: (bearer) => (bearer === `Bearer ${TOKEN}` ? [200, { mode: "header", me }] : [200, { mode: "none" }]),
      post: signedIn,
    });
    const { session, store } = await load();

    await session.startSession();

    expect(session.getSession()).toMatchObject({ status: "ready", mode: "header" });
    expect(store.getAuth()).toEqual({ mode: "header", token: TOKEN });
    expect(calls.get).toEqual([null, null, `Bearer ${TOKEN}`]);
    expect(writes.filter((write) => write.includes(TOKEN))).toEqual([]);
    expect(window.location.href).not.toContain(TOKEN);
    cookieWrites.mockRestore();
  });

  it("a refused sign-in is expired, also on the first sign-in of a launch", async () => {
    server({ post: () => [401, { code: "invalid_init_data" }] });
    const { session, events } = await load();

    await session.startSession();

    expect(session.getSession().status).toBe("expired");
    expect(events.recentTracked().map((event) => event.name)).toEqual(["app_launch"]);
  });

  it("403 is denied with the reason, in the cookie check or in the sign-in", async () => {
    server({ get: () => [403, { code: "access_denied", reason: "invite" }] });
    const first = await load();
    await first.session.startSession();
    expect(first.session.getSession()).toMatchObject({ status: "denied", reason: "invite" });

    fake?.uninstall();
    server({ post: () => [403, { code: "access_denied", reason: "full" }] });
    const second = await load();
    await second.session.startSession();
    expect(second.session.getSession()).toMatchObject({ status: "denied", reason: "full" });
  });

  it("a network error, 502 or 429 keeps booting with the error, and retry() continues", async () => {
    let answer: Answer = "network";
    server({ get: () => answer, post: signedIn });
    const { session } = await load();

    await session.startSession();
    expect(session.getSession()).toMatchObject({ status: "booting", error: "offline" });

    answer = [502, { code: "bad_gateway" }];
    await session.retry();
    expect(session.getSession()).toMatchObject({ status: "booting", error: "server" });

    answer = [429, { code: "rate_limited" }];
    await session.retry();
    expect(session.getSession()).toMatchObject({ status: "booting", error: "rate_limited" });

    answer = [200, { mode: "cookie", me, user: tag(USER) }];
    await session.retry();
    expect(session.getSession()).toMatchObject({ status: "ready", error: null });
  });

  it("a 429 keeps the seconds of its Retry-After for the boot retry, from the check or the sign-in (KI-37)", async () => {
    let get: Answer = [429, { code: "rate_limited" }, { "retry-after": "37" }];
    let post: Answer = signedIn();
    server({ get: () => get, post: () => post });
    const { session } = await load();

    await session.startSession();
    expect(session.getSession()).toMatchObject({ status: "booting", error: "rate_limited", retryAfter: 37 });

    get = [200, { mode: "none" }];
    post = [429, { code: "rate_limited" }, { "retry-after": "5" }];
    await session.retry();
    expect(session.getSession()).toMatchObject({ status: "booting", error: "rate_limited", retryAfter: 5 });

    post = [429, { code: "rate_limited" }];
    await session.retry();
    expect(session.getSession()).toMatchObject({ status: "booting", error: "rate_limited", retryAfter: null });

    post = [502, { code: "bad_gateway" }, { "retry-after": "5" }];
    await session.retry();
    expect(session.getSession(), "only a 429 carries a wait").toMatchObject({ status: "booting", error: "server", retryAfter: null });

    get = [200, { mode: "cookie", me, user: tag(USER) }];
    await session.retry();
    expect(session.getSession()).toMatchObject({ status: "ready", error: null, retryAfter: null });
  });

  it("reads Retry-After as seconds or as an HTTP date; anything else is none", async () => {
    const { session } = await load({ telegram: false });
    const now = Date.parse("2026-11-26T12:00:00Z");

    expect(session.retryAfterSeconds("37", now)).toBe(37);
    expect(session.retryAfterSeconds(" 0 ", now)).toBe(0);
    expect(session.retryAfterSeconds("Thu, 26 Nov 2026 12:00:42 GMT", now)).toBe(42);
    expect(session.retryAfterSeconds("Thu, 26 Nov 2026 11:59:00 GMT", now)).toBe(0);
    for (const value of [null, "", "-5", "1.5", "soon"]) {
      expect(session.retryAfterSeconds(value, now), String(value)).toBeNull();
    }
  });

  it("startSession runs once for double effects", async () => {
    server({ get: () => [200, { mode: "cookie", me, user: tag(USER) }] });
    const { session } = await load();

    await Promise.all([session.startSession(), session.startSession()]);

    expect(calls.get).toHaveLength(1);
  });
});

describe("attempts in flight and the re-check of a refusal (WP-23, D-S-2)", () => {
  it("pending is true while an attempt is in flight; retry() then returns that attempt and starts no second one", async () => {
    const cookie = held([200, { mode: "cookie", me, user: tag(USER) }]);
    server({ get: cookie.answer });
    const { session } = await load();
    expect(session.getSession().pending).toBe(false);

    const first = session.startSession();
    expect(session.getSession()).toMatchObject({ status: "booting", pending: true });
    expect(session.retry()).toBe(first);
    await vi.waitFor(() => expect(calls.get).toHaveLength(1));
    expect(session.retry()).toBe(first);

    cookie.release();
    await first;
    expect(session.getSession()).toMatchObject({ status: "ready", pending: false });
    expect(calls.get).toHaveLength(1);
  });

  it("a failed attempt ends with pending false, and the next retry() runs a new attempt", async () => {
    let answer: Answer = "network";
    server({ get: () => answer });
    const { session } = await load();

    await session.startSession();
    expect(session.getSession()).toMatchObject({ status: "booting", error: "offline", pending: false });

    answer = [200, { mode: "cookie", me, user: tag(USER) }];
    const again = session.retry();
    expect(session.getSession().pending).toBe(true);
    await again;
    expect(session.getSession()).toMatchObject({ status: "ready", error: null, pending: false });
    expect(calls.get).toHaveLength(2);
  });

  it("a re-check from denied stays denied with its reason while pending, then goes ready when access was granted", async () => {
    let answer: () => Answer | Promise<Answer> = () => [403, { code: "access_denied", reason: "join" }];
    server({ get: () => answer() });
    const { session } = await load();
    await session.startSession();
    expect(session.getSession()).toMatchObject({ status: "denied", reason: "join", pending: false });

    const granted = held([200, { mode: "cookie", me, user: tag(USER) }]);
    answer = granted.answer;
    const statuses: string[] = [];
    session.subscribeSession(() => statuses.push(session.getSession().status));
    const recheck = session.retry();
    await vi.waitFor(() => expect(calls.get).toHaveLength(2));
    expect(session.getSession()).toMatchObject({ status: "denied", reason: "join", pending: true });
    expect(session.retry()).toBe(recheck);

    granted.release();
    await recheck;
    expect(session.getSession()).toMatchObject({ status: "ready", reason: null, error: null, pending: false });
    expect(statuses).not.toContain("booting");
  });

  it("another refusal of a re-check stays denied with the new reason, also when the sign-in refuses", async () => {
    let get: Answer = [403, { code: "access_denied", reason: "invite" }];
    server({ get: () => get, post: () => [403, { code: "access_denied", reason: "full" }] });
    const { session } = await load();
    await session.startSession();
    const statuses: string[] = [];
    session.subscribeSession(() => statuses.push(session.getSession().status));

    get = [403, { code: "access_denied", reason: "blocked" }];
    await session.retry();
    expect(session.getSession()).toMatchObject({ status: "denied", reason: "blocked", pending: false });

    get = [200, { mode: "none" }];
    await session.retry();
    expect(session.getSession()).toMatchObject({ status: "denied", reason: "full", pending: false });
    expect(calls.post).toHaveLength(1);
    expect(statuses).not.toContain("booting");
  });

  it("a re-check that cannot reach the API leaves the refusal as it was", async () => {
    let get: Answer = [403, { code: "access_denied", reason: "invite" }];
    server({ get: () => get });
    const { session } = await load();
    await session.startSession();

    for (const failure of ["network", [502, { code: "bad_gateway" }], [429, { code: "rate_limited" }, { "retry-after": "30" }]] as Answer[]) {
      get = failure;
      await session.retry();
      expect(session.getSession(), JSON.stringify(failure)).toMatchObject({ status: "denied", reason: "invite", error: null, retryAfter: null, pending: false });
    }
  });

  it("retry() leaves ready, outside and expired alone", async () => {
    server({ get: () => [200, { mode: "cookie", me, user: tag(USER) }] });
    const ready = await load();
    await ready.session.startSession();
    await ready.session.retry();
    expect(calls.get).toHaveLength(1);

    fake?.uninstall();
    fake = null;
    const outside = await load({ telegram: false });
    await outside.session.startSession();
    await outside.session.retry();
    expect(outside.session.getSession()).toMatchObject({ status: "outside", pending: false });

    server({ post: () => [401, { code: "invalid_init_data" }] });
    calls = { get: [], post: [] };
    const expired = await load();
    await expired.session.startSession();
    await expired.session.retry();
    expect(expired.session.getSession().status).toBe("expired");
    expect(calls.post).toHaveLength(1);
  });
});

describe("a late SDK (SCR-002)", () => {
  function addSdkTag(): HTMLScriptElement {
    (window as unknown as Record<string, unknown>).__homiBoot = { ok: true, watching: false, sdk: null, errors: [] };
    const script = document.createElement("script");
    script.id = "tg-sdk";
    document.head.append(script);
    return script;
  }

  it("that brings launch data while outside starts the session", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const script = addSdkTag();
    server({ get: () => [200, { mode: "cookie", me, user: tag(USER) }] });
    const { session, events } = await load({ telegram: false });

    const first = session.startSession();
    await vi.advanceTimersByTimeAsync(SDK_WAIT_MS);
    await first;
    expect(session.getSession()).toMatchObject({ status: "outside", pending: false });
    expect(calls.get).toEqual([]);
    vi.useRealTimers();

    fake = fakeTelegram({ initData: syntheticInitData({ id: USER }) });
    script.dispatchEvent(new Event("load"));
    expect(session.getSession().pending).toBe(true);

    await vi.waitFor(() => expect(session.getSession()).toMatchObject({ status: "ready", mode: "cookie", pending: false }));
    expect(calls.get).toHaveLength(1);
    expect(events.recentTracked().map((event) => event.name)).toEqual(["app_launch", "app_opened"]);
  });

  it("without launch data stays outside", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const script = addSdkTag();
    server({});
    const { session } = await load({ telegram: false });

    const first = session.startSession();
    await vi.advanceTimersByTimeAsync(SDK_WAIT_MS);
    await first;

    fake = fakeTelegram({ initData: "" });
    script.dispatchEvent(new Event("load"));
    await Promise.resolve();

    expect(session.getSession()).toMatchObject({ status: "outside", pending: false });
    expect(calls.get).toEqual([]);
  });
});

describe("launch order", () => {
  it("restores homi-visits from DeviceStorage before the first request, and scrubs the fragment before app_launch", async () => {
    fake = fakeTelegram({ version: "9.0", initData: syntheticInitData({ id: USER }) });
    fake.webApp.DeviceStorage.setItem("homi-visits", '{"abc":1}');
    window.history.replaceState(null, "", `/ru#tgWebAppData=${encodeURIComponent(fake.webApp.initData)}`);
    tracked.hashes = [];
    let visitsAtFirstRequest: string | null | undefined;
    server({
      get: () => {
        visitsAtFirstRequest ??= window.localStorage.getItem("homi-visits");
        return [200, { mode: "cookie", me, user: tag(USER) }];
      },
    });
    vi.resetModules();
    const session = await import("@/lib/session/bootstrap");

    await session.startSession();

    expect(visitsAtFirstRequest).toBe('{"abc":1}');
    expect(tracked.hashes).toEqual(["", ""]);
    expect(window.location.hash).toBe("");
  });
});

describe("re-authentication (fix of LB-APP-047)", () => {
  it("leaves renewed as the launch decided it: a launch on a confirmed cookie stays not renewed (WP-24)", async () => {
    server({ get: () => [200, { mode: "cookie", me, user: tag(USER) }], post: signedIn });
    const { session } = await load();
    await session.startSession();
    expect(session.getSession()).toMatchObject({ status: "ready", renewed: false });

    await expect(session.reauthenticate()).resolves.toBe(true);
    expect(calls.post).toHaveLength(1);
    expect(session.getSession()).toMatchObject({ status: "ready", renewed: false });
  });

  it("parallel callers share one sign-in", async () => {
    server({ get: (bearer) => (bearer ? [200, { mode: "header", me }] : [200, { mode: "none" }]), post: signedIn });
    const { session } = await load();
    await session.startSession();
    calls.post = [];

    const results = await Promise.all([session.reauthenticate(), session.reauthenticate(), session.reauthenticate()]);

    expect(results).toEqual([true, true, true]);
    expect(calls.post).toHaveLength(1);
  });

  it("a refused re-authentication is expired, and nothing is retried after it", async () => {
    let refuse = false;
    server({ get: (bearer) => (bearer ? [200, { mode: "header", me }] : [200, { mode: "none" }]), post: () => (refuse ? [401, { code: "auth_expired" }] : signedIn()) });
    const { session } = await load();
    await session.startSession();
    refuse = true;

    await expect(session.reauthenticate()).resolves.toBe(false);
    expect(session.getSession().status).toBe("expired");
    const posts = calls.post.length;
    await expect(session.reauthenticate()).resolves.toBe(false);
    expect(calls.post).toHaveLength(posts);
  });
});

describe("patchMe", () => {
  it("merges a saved change at once and keeps it over later reads of me", async () => {
    server({ get: () => [200, { mode: "cookie", me, user: tag(USER) }] });
    const { session } = await load();
    await session.startSession();

    session.patchMe({ locale: "en", city: "samarkand" });
    expect(session.getSession().me).toMatchObject({ locale: "en", city: "samarkand", currency: "UZS" });

    await session.refresh();
    expect(session.getSession().me).toMatchObject({ locale: "en", city: "samarkand" });
  });
});

describe("refresh (WP-82)", () => {
  it("a call during a read asks for one more read after it; every call meanwhile shares that one", async () => {
    let pending = 0;
    let release: (() => void) | null = null;
    server({
      get: async () => {
        if (calls.get.length > 1) {
          await new Promise<void>((resolve) => (release = resolve));
        }
        return [200, { mode: "cookie", me: { ...me, owner: { pending, has_listings: true, waitlisted: false } }, user: tag(USER) }];
      },
    });
    const { session } = await load();
    await session.startSession();
    const reads = calls.get.length;

    const first = session.refresh();
    // The cabinet changed while the first read is out: its answer may be the old one.
    pending = 3;
    const second = session.refresh();
    const third = session.refresh();
    expect(second).toBe(third);
    (release as (() => void) | null)?.();
    await first;
    await new Promise((resolve) => setTimeout(resolve, 0));
    (release as (() => void) | null)?.();
    await Promise.all([second, third]);

    expect(calls.get.length - reads).toBe(2);
    expect(session.getSession().me?.owner.pending).toBe(3);
  });
});

describe("onForbidden (WP-22, LB-APP-045)", () => {
  it("turns a ready session denied with the reason; an unknown reason is private; a booting one is left alone", async () => {
    server({ get: () => [200, { mode: "cookie", me, user: tag(USER) }] });
    const { session } = await load();
    session.onForbidden("full");
    expect(session.getSession().status).toBe("booting");

    await session.startSession();
    session.onForbidden();
    expect(session.getSession()).toMatchObject({ status: "denied", reason: "private" });
  });
});
