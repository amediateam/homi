import { fakeTelegram, syntheticInitData, type FakeTelegram } from "@homi/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

let fake: FakeTelegram | null = null;

/** Evaluates `lib/telegram/sdk.ts` afresh with the given address, as a launch does. */
async function loadSdk(address = "/ru") {
  window.history.replaceState({ router: "state" }, "", address);
  vi.resetModules();
  return import("@/lib/telegram/sdk");
}

afterEach(() => {
  fake?.uninstall();
  fake = null;
  window.history.replaceState(null, "", "/");
});

describe("initData (TMA-006)", () => {
  it("prefers the SDK value", async () => {
    fake = fakeTelegram({ startParam: "l_1" });
    const sdk = await loadSdk(`/ru#tgWebAppData=${encodeURIComponent(syntheticInitData({}, { startParam: "l_2" }))}`);

    expect(sdk.initData()).toBe(fake.webApp.initData);
    expect(sdk.hasInitData()).toBe(true);
  });

  it("falls back to #tgWebAppData read once when the module is evaluated", async () => {
    const launch = syntheticInitData({ id: 7 }, { startParam: "l_42" });
    const sdk = await loadSdk(`/ru?x=1#tgWebAppData=${encodeURIComponent(launch)}&tgWebAppVersion=8.0&tgWebAppPlatform=android`);
    window.history.replaceState(null, "", "/ru?x=1");

    expect(sdk.initData()).toBe(launch);
    expect(sdk.launchFragment()).toEqual({ initData: launch, version: "8.0", platform: "android" });
  });

  it("is empty without an SDK and without a fragment", async () => {
    const sdk = await loadSdk("/ru");

    expect(sdk.initData()).toBe("");
    expect(sdk.hasInitData()).toBe(false);
    expect(sdk.webApp()).toBeNull();
  });

  it("an SDK without launch data (a desktop browser) still counts as no launch data", async () => {
    fake = fakeTelegram({ initData: "" });
    const sdk = await loadSdk("/ru");

    expect(sdk.webApp()).not.toBeNull();
    expect(sdk.hasInitData()).toBe(false);
  });
});

describe("scrubLaunchFragment (TMA-009)", () => {
  it("removes the fragment and keeps the path, the query and the router's history state", async () => {
    const sdk = await loadSdk(`/ru/listing/5?from=map#tgWebAppData=${encodeURIComponent(syntheticInitData())}`);

    sdk.scrubLaunchFragment();

    expect(window.location.hash).toBe("");
    expect(window.location.pathname + window.location.search).toBe("/ru/listing/5?from=map");
    expect(window.history.state).toEqual({ router: "state" });
    expect(sdk.hasInitData()).toBe(true);
  });

  it("does not touch history when there is no fragment", async () => {
    const sdk = await loadSdk("/ru");
    const replace = vi.spyOn(window.history, "replaceState");

    sdk.scrubLaunchFragment();

    expect(replace).not.toHaveBeenCalled();
  });
});

describe("postBridgeEvent (TMA-005)", () => {
  afterEach(() => {
    const host = window as unknown as Record<string, unknown>;
    delete host.TelegramWebviewProxy;
  });

  it("uses TelegramWebviewProxy first", async () => {
    const postEvent = vi.fn();
    (window as unknown as Record<string, unknown>).TelegramWebviewProxy = { postEvent };
    const sdk = await loadSdk("/ru");

    expect(sdk.postBridgeEvent("web_app_ready")).toBe(true);
    expect(postEvent).toHaveBeenCalledWith("web_app_ready", undefined);
  });

  it("then external.notify", async () => {
    const notify = vi.fn();
    vi.stubGlobal("external", { notify });
    const sdk = await loadSdk("/ru");

    expect(sdk.postBridgeEvent("web_app_expand")).toBe(true);
    expect(notify).toHaveBeenCalledWith(JSON.stringify({ eventType: "web_app_expand" }));
  });

  it("then parent.postMessage when the page is framed, and nothing otherwise", async () => {
    const sdk = await loadSdk("/ru");
    expect(sdk.postBridgeEvent("web_app_ready")).toBe(false);

    const postMessage = vi.fn();
    vi.spyOn(window, "parent", "get").mockReturnValue({ postMessage } as unknown as Window);
    expect(sdk.postBridgeEvent("web_app_ready")).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ eventType: "web_app_ready" }), "*");
  });
});
