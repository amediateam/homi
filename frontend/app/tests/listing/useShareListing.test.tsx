import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Activity, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PreparedShare } from "@/features/listing/listingData";
import type { ActionResult } from "@/lib/actions/run";

const state = vi.hoisted(() => ({
  bot: "homi_test_bot",
  prepareShare: vi.fn<(input: { number: number }, auth?: unknown, locale?: string) => Promise<ActionResult<PreparedShare>>>(),
}));
vi.mock("@/lib/actions/listing", () => ({ prepareShare: state.prepareShare }));
vi.mock("@/lib/brand", async (importOriginal) => {
  const { brand } = await importOriginal<typeof import("@/lib/brand")>();
  return {
    brand: {
      ...brand,
      get botUsername() {
        return state.bot;
      },
    },
  };
});

import { SHARE_LOCK_MS, shareText, useShareListing } from "@/features/listing/share/useShareListing";
import { clearTracked, recentTracked } from "@/lib/analytics/events";
import { clearRecentErrors, recentErrors } from "@/lib/errors/report";

import { previewOf, translator } from "../helpers/listing";

const PREPARED: ActionResult<PreparedShare> = {
  ok: true,
  data: { prepared_message_id: "stub-prepared-100001", expires_at: "2026-11-17T12:00:00Z" },
  meta: { source: "stub" },
};
const SHARE_FAILED: ActionResult<PreparedShare> = { ok: false, error: "server", status: 502, code: "share_failed", method: "POST", path: "listings/:number/share" };

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      {children}
    </NextIntlClientProvider>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** The hook for `number`; each case shares its own number, so `openLink`'s 1.5 s debounce of one address never meets. */
function hook(number: number, item = previewOf({ number })) {
  return renderHook(() => useShareListing(number, item), { wrapper });
}

/** Lets the share's promises settle: the action, the picker's callback (a microtask in the double), the fallback. */
const settle = () => act(() => vi.advanceTimersByTimeAsync(0));

let fake: FakeTelegram | null = null;
const calls = (member: string) => (fake?.calls ?? []).filter((entry) => entry.member === member).map((entry) => entry.args[0]);
const haptics = () =>
  (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);

/** The share link of the fallback, as `shareUrl` builds it. */
const link = (number: number, text: string) =>
  `https://t.me/share/url?url=${encodeURIComponent(`https://t.me/homi_test_bot?startapp=l_${number}`)}&text=${encodeURIComponent(text)}`;
const RENT_TEXT = "2-комн. квартира, 54 м² · $600/мес · Юнусабад";

beforeEach(() => {
  state.bot = "homi_test_bot";
  state.prepareShare.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  fake?.uninstall();
  fake = null;
  clearTracked();
  clearRecentErrors();
  vi.useRealTimers();
});

describe("shareText (BR-APP-038)", () => {
  const t = translator("ru");

  it("rent: title · amount and period · district", () => {
    expect(shareText(previewOf(), t)).toBe(RENT_TEXT);
  });

  it("a sale with a down payment carries «первый взнос»", () => {
    const item = previewOf({ price: { display: "$12 000", period: null, alt: null, notes: [], usd: 12000, kind: "down_payment" } });
    expect(shareText(item, t)).toBe("2-комн. квартира, 54 м² · $12 000 · первый взнос · Юнусабад");
  });

  it("a commercial listing with the business kind carries its label", () => {
    const item = previewOf({
      title: "Помещение, 120 м²",
      price: { display: "$95 000", period: null, alt: null, notes: [], usd: 95000, kind: "business" },
    });
    expect(shareText(item, t)).toBe("Помещение, 120 м² · $95 000 · цена за бизнес, помещение в аренде · Юнусабад");
  });

  it("an unknown kind has no label part", () => {
    const item = previewOf({ price: { display: "$600", period: "/мес", alt: null, notes: [], usd: 600, kind: "per_m2" as never } });
    expect(shareText(item, t)).toBe(RENT_TEXT);
  });

  it("no price: title and district only; empty parts are dropped", () => {
    expect(shareText(previewOf({ price: null }), t)).toBe("2-комн. квартира, 54 м² · Юнусабад");
    expect(shareText(previewOf({ price: null, title: "", district: null }), t)).toBe("");
  });

  it("en uses the English label", () => {
    const item = previewOf({ price: { display: "$12 000", period: null, alt: null, notes: [], usd: 12000, kind: "down_payment" } });
    expect(shareText(item, translator("en"))).toBe("2-комн. квартира, 54 м² · $12 000 · down payment · Юнусабад");
  });
});

describe("useShareListing (TMA-030, TMA-031)", () => {
  it("is shareable only when the bot's start link can be built; without it a tap does nothing", () => {
    fake = fakeTelegram({ version: "8.0" });
    expect(hook(100001).result.current.shareable).toBe(true);
    cleanup();

    state.bot = "";
    const { result } = hook(100002);
    expect(result.current.shareable).toBe(false);
    act(() => result.current.share());
    expect(haptics()).toEqual([]);
    expect(recentTracked()).toEqual([]);
    expect(state.prepareShare).not.toHaveBeenCalled();
  });

  it("prepared path: light haptic, listing_shared before trying, then the picker with the prepared message", async () => {
    fake = fakeTelegram({ version: "8.0", answers: { shareSent: true } });
    const prepared = deferred<ActionResult<PreparedShare>>();
    state.prepareShare.mockReturnValueOnce(prepared.promise);
    const { result } = hook(100001);

    act(() => result.current.share());

    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
    expect(recentTracked()).toEqual([{ name: "listing_shared", props: { listing_id: 100001 } }]);
    expect(state.prepareShare.mock.calls).toEqual([[{ number: 100001 }, undefined, "ru"]]);

    prepared.resolve(PREPARED);
    await settle();

    expect(calls("shareMessage")).toEqual(["stub-prepared-100001"]);
    expect(calls("openTelegramLink")).toEqual([]);
  });

  it("an old client (below 8.0) asks for no prepared message and opens the share link", async () => {
    fake = fakeTelegram({ version: "7.10" });
    const { result } = hook(100003);

    act(() => result.current.share());
    await settle();

    expect(state.prepareShare).not.toHaveBeenCalled();
    expect(calls("shareMessage")).toEqual([]);
    expect(calls("openTelegramLink")).toEqual([link(100003, RENT_TEXT)]);
    expect(recentTracked()).toEqual([{ name: "listing_shared", props: { listing_id: 100003 } }]);
  });

  it("a failed prepareShare opens the share link", async () => {
    fake = fakeTelegram({ version: "8.0" });
    state.prepareShare.mockResolvedValueOnce(SHARE_FAILED);
    const { result } = hook(100004);

    act(() => result.current.share());
    await settle();

    expect(calls("shareMessage")).toEqual([]);
    expect(calls("openTelegramLink")).toEqual([link(100004, RENT_TEXT)]);
  });

  it("a picker that throws opens the share link", async () => {
    fake = fakeTelegram({ version: "8.0" });
    fake.webApp.shareMessage = () => {
      throw new Error("WebAppMethodFailed");
    };
    state.prepareShare.mockResolvedValueOnce(PREPARED);
    const { result } = hook(100005);

    act(() => result.current.share());
    await settle();

    expect(calls("openTelegramLink")).toEqual([link(100005, RENT_TEXT)]);
    expect(recentErrors()).toEqual([]);
  });

  it("a shown picker that answers «not sent» ends quietly: no share link, no toast", async () => {
    fake = fakeTelegram({ version: "8.0", answers: { shareSent: false } });
    state.prepareShare.mockResolvedValueOnce(PREPARED);
    const { result } = hook(100006);

    act(() => result.current.share());
    await settle();

    expect(calls("shareMessage")).toEqual(["stub-prepared-100001"]);
    expect(calls("openTelegramLink")).toEqual([]);
  });

  it("without the listing's data the link goes alone", async () => {
    fake = fakeTelegram({ version: "7.0" });
    const { result } = renderHook(() => useShareListing(100007, null), { wrapper });

    act(() => result.current.share());
    await settle();

    expect(calls("openTelegramLink")).toEqual([link(100007, "")]);
  });

  it("holds while the share runs and 1.5 s after it: a double tap shares once", async () => {
    fake = fakeTelegram({ version: "8.0", answers: { shareSent: true } });
    const prepared = deferred<ActionResult<PreparedShare>>();
    state.prepareShare.mockReturnValueOnce(prepared.promise).mockResolvedValue(PREPARED);
    const { result } = hook(100008);

    act(() => result.current.share());
    act(() => result.current.share());
    expect(state.prepareShare).toHaveBeenCalledTimes(1);

    prepared.resolve(PREPARED);
    await settle();
    await act(() => vi.advanceTimersByTimeAsync(SHARE_LOCK_MS - 1));
    act(() => result.current.share());
    expect(state.prepareShare).toHaveBeenCalledTimes(1);
    expect(recentTracked()).toHaveLength(1);

    await act(() => vi.advanceTimersByTimeAsync(1));
    act(() => result.current.share());
    await settle();

    expect(state.prepareShare).toHaveBeenCalledTimes(2);
    expect(calls("shareMessage")).toEqual(["stub-prepared-100001", "stub-prepared-100001"]);
    expect(recentTracked()).toEqual([
      { name: "listing_shared", props: { listing_id: 100008 } },
      { name: "listing_shared", props: { listing_id: 100008 } },
    ]);
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)", "HapticFeedback.impactOccurred(light)"]);
  });

  it("a listing hidden with its cached route and shown again shares at once", async () => {
    fake = fakeTelegram({ version: "7.0" });
    function Probe({ number }: { number: number }) {
      const { share } = useShareListing(number, previewOf({ number }));
      return (
        <button type="button" onClick={share}>
          share
        </button>
      );
    }
    const view = (mode: "visible" | "hidden", number: number) => (
      <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
        <Activity mode={mode}>
          <Probe number={number} />
        </Activity>
      </NextIntlClientProvider>
    );
    const { rerender } = render(view("visible", 100009));
    fireEvent.click(screen.getByRole("button"));
    await settle();

    // No time passes: the lock of the first share would still hold. Another number keeps `openLink`'s own debounce
    // of one address out of the way.
    rerender(view("hidden", 100009));
    rerender(view("visible", 100010));
    fireEvent.click(screen.getByRole("button"));
    await settle();

    expect(calls("openTelegramLink")).toEqual([link(100009, RENT_TEXT), link(100010, RENT_TEXT)]);
  });
});
