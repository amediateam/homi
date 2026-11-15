import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { waitForSdk, SDK_WAIT_MS } from "@/lib/telegram/wait";

let fake: FakeTelegram | null = null;
let tag: HTMLScriptElement | null = null;
const host = window as unknown as Record<string, unknown>;

function addSdkTag(): HTMLScriptElement {
  tag = document.createElement("script");
  tag.id = "tg-sdk";
  document.head.append(tag);
  return tag;
}

beforeEach(() => {
  vi.useFakeTimers();
  host.__homiBoot = { ok: false, watching: false, sdk: null, errors: [] };
});

afterEach(() => {
  vi.useRealTimers();
  fake?.uninstall();
  fake = null;
  tag?.remove();
  tag = null;
  delete host.__homiBoot;
  delete host.TelegramWebviewProxy;
});

describe("waitForSdk (TMA-004)", () => {
  it("resolves at once when the SDK is already there", async () => {
    addSdkTag();
    fake = fakeTelegram();

    await expect(waitForSdk()).resolves.toBe("ready");
  });

  it("resolves at once when the tag is missing or the boot script saw the tag fail", async () => {
    await expect(waitForSdk()).resolves.toBe("absent");

    addSdkTag();
    (host.__homiBoot as { sdk: string }).sdk = "error";
    await expect(waitForSdk()).resolves.toBe("error");
  });

  it("resolves on load", async () => {
    const script = addSdkTag();
    const waiting = waitForSdk();

    fake = fakeTelegram();
    script.dispatchEvent(new Event("load"));

    await expect(waiting).resolves.toBe("ready");
  });

  it("resolves on the tag's error before the timeout", async () => {
    const script = addSdkTag();
    const waiting = waitForSdk();

    script.dispatchEvent(new Event("error"));

    await expect(waiting).resolves.toBe("error");
  });

  it("gives up after 3 s", async () => {
    addSdkTag();
    const waiting = waitForSdk();

    await vi.advanceTimersByTimeAsync(SDK_WAIT_MS - 1);
    let settled = false;
    void waiting.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(waiting).resolves.toBe("timeout");
    expect(SDK_WAIT_MS).toBe(3000);
  });

  it("adopts a late SDK that carries launch data once, even after two load events", async () => {
    const script = addSdkTag();
    const onLate = vi.fn();
    const waiting = waitForSdk(SDK_WAIT_MS, onLate);
    await vi.advanceTimersByTimeAsync(SDK_WAIT_MS);
    await expect(waiting).resolves.toBe("timeout");

    fake = fakeTelegram();
    script.dispatchEvent(new Event("load"));
    script.dispatchEvent(new Event("load"));

    expect(onLate).toHaveBeenCalledTimes(1);
  });

  it("does not adopt a late SDK without launch data", async () => {
    const script = addSdkTag();
    const onLate = vi.fn();
    const waiting = waitForSdk(SDK_WAIT_MS, onLate);
    await vi.advanceTimersByTimeAsync(SDK_WAIT_MS);
    await waiting;

    fake = fakeTelegram({ initData: "" });
    script.dispatchEvent(new Event("load"));

    expect(onLate).not.toHaveBeenCalled();
  });

  it("without an SDK posts web_app_ready and web_app_expand through the native bridge (TMA-005)", async () => {
    const postEvent = vi.fn();
    host.TelegramWebviewProxy = { postEvent };
    addSdkTag();
    const waiting = waitForSdk();
    await vi.advanceTimersByTimeAsync(SDK_WAIT_MS);
    await waiting;

    expect(postEvent.mock.calls.map(([type]) => type)).toEqual(["web_app_ready", "web_app_expand"]);
  });

  it("with an SDK posts nothing through the bridge itself", async () => {
    const postEvent = vi.fn();
    host.TelegramWebviewProxy = { postEvent };
    addSdkTag();
    fake = fakeTelegram();

    await waitForSdk();

    expect(postEvent).not.toHaveBeenCalled();
  });
});
