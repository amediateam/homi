import { createHash } from "node:crypto";

import { fakeTelegram, syntheticInitData, type FakeTelegram } from "@homi/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

type Answer = [number, unknown] | "network";
interface Calls {
  get: (string | null)[];
  post: string[];
}

let fake: FakeTelegram | null = null;
let calls: Calls;

/** A fake `/bff/session`: `get` answers by the bearer header, `post` by the launch data. */
function server(handlers: { get?: (bearer: string | null) => Answer; post?: () => Answer }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/bff/session");
      const headers = new Headers(init?.headers);
      const method = init?.method ?? "GET";
      let answer: Answer;
      if (method === "POST") {
        calls.post.push(String(init?.body));
        answer = handlers.post?.() ?? [500, {}];
      } else {
        const bearer = headers.get("authorization");
        calls.get.push(bearer);
        answer = handlers.get?.(bearer) ?? [200, { mode: "none" }];
      }
      if (answer === "network") {
        throw new TypeError("Failed to fetch");
      }
      return new Response(JSON.stringify(answer[1]), { status: answer[0], headers: { "content-type": "application/json" } });
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
  fake?.uninstall();
  fake = null;
});

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

    expect(session.getSession()).toMatchObject({ status: "ready", mode: "cookie", me });
    expect(calls.post).toEqual([]);
    expect(store.getAuth()).toEqual({ mode: "cookie" });
    expect(events.recentTracked().map((event) => event.name)).toEqual(["app_launch", "app_opened"]);
    expect(events.recentTracked()[1].props).toMatchObject({ entry: "link", listing_id: 42 });
    expect(document.documentElement.dataset.theme).toBe("dark");
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
    expect(session.getSession()).toMatchObject({ status: "ready", mode: "cookie" });
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

  it("startSession runs once for double effects", async () => {
    server({ get: () => [200, { mode: "cookie", me, user: tag(USER) }] });
    const { session } = await load();

    await Promise.all([session.startSession(), session.startSession()]);

    expect(calls.get).toHaveLength(1);
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
