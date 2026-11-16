import { createHash } from "node:crypto";

import { fakeTelegram, syntheticInitData, type FakeTelegram } from "@homi/testing";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => router }));

const me = { locale: "ru", locale_chosen: true, currency: "UZS", theme: "auto", city: null, city_chosen: false, team: false, analytics: null };
let fake: FakeTelegram | null = null;

afterEach(() => {
  cleanup();
  fake?.uninstall();
  fake = null;
  router.refresh.mockReset();
});

/** Answers the session exchange in this order; the last answer repeats. */
async function mount(...answers: unknown[]) {
  fake = fakeTelegram({ initData: syntheticInitData({ id: 5 }) });
  const queue = [...answers];
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(queue.length > 1 ? queue.shift() : queue[0]), { status: 200 })));
  vi.resetModules();
  const { SessionProvider, useSession } = await import("@/lib/session/SessionProvider");
  function Probe() {
    const session = useSession();
    return <output>{`${session.status} ${session.mode ?? "-"}`}</output>;
  }
  await act(async () => {
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
  });
}

describe("SessionProvider", () => {
  it("starts the session and refreshes the router once in cookie mode after a sign-in of this launch", async () => {
    const user = createHash("sha256").update("5").digest("hex");
    await mount({ mode: "none" }, { token: "1|abc", expiresAt: "2099-01-01T00:00:00+00:00", me }, { mode: "cookie", me, user });

    await vi.waitFor(() => expect(screen.getByRole("status").textContent).toBe("ready cookie"));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.session).toBe("ready");
  });

  it("does not refresh when the launch confirmed the cookie the document came with (WP-24)", async () => {
    await mount({ mode: "cookie", me, user: createHash("sha256").update("5").digest("hex") });

    await vi.waitFor(() => expect(screen.getByRole("status").textContent).toBe("ready cookie"));
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("at sign-in the profile's city overwrites the saved homi-city, without a server call (WP-22, BR-APP-010)", async () => {
    window.localStorage.setItem("homi-city", "samarkand");
    await mount({ mode: "cookie", me: { ...me, city: "bukhara" }, user: createHash("sha256").update("5").digest("hex") });

    await vi.waitFor(() => expect(window.localStorage.getItem("homi-city")).toBe("bukhara"));
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("a profile without a city leaves homi-city alone", async () => {
    window.localStorage.setItem("homi-city", "samarkand");
    await mount({ mode: "cookie", me, user: createHash("sha256").update("5").digest("hex") });

    await vi.waitFor(() => expect(screen.getByRole("status").textContent).toBe("ready cookie"));
    expect(window.localStorage.getItem("homi-city")).toBe("samarkand");
  });

  it("exposes pending while the attempt is in flight, and retry() on the context (WP-23)", async () => {
    fake = fakeTelegram({ initData: syntheticInitData({ id: 5 }) });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const answer = { mode: "cookie", me, user: createHash("sha256").update("5").digest("hex") };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (await gate, new Response(JSON.stringify(answer), { status: 200 }))),
    );
    vi.resetModules();
    const { SessionProvider, useSession } = await import("@/lib/session/SessionProvider");
    const bootstrap = await import("@/lib/session/bootstrap");
    const seen: { retry: unknown }[] = [];
    function Probe() {
      const session = useSession();
      seen.push({ retry: session.retry });
      return <output>{`${session.status} ${String(session.pending)}`}</output>;
    }
    await act(async () => {
      render(
        <SessionProvider>
          <Probe />
        </SessionProvider>,
      );
    });

    expect(screen.getByRole("status").textContent).toBe("booting true");
    expect(seen.at(-1)?.retry).toBe(bootstrap.retry);
    await act(async () => release());
    await vi.waitFor(() => expect(screen.getByRole("status").textContent).toBe("ready false"));
  });

  it("does not refresh outside cookie mode", async () => {
    await mount({ mode: "none" });
    await vi.waitFor(() => expect(screen.getByRole("status").textContent).toBe("booting -"));
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
