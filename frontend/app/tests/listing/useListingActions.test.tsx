import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Activity, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BlockedAuthorResult, ListingAuthor, ReportResult } from "@/features/listing/listingData";
import type { ActionResult } from "@/lib/actions/run";
import type { ReportInput } from "@/lib/actions/reports";

type Call<T> = (input: T, auth?: unknown, locale?: string) => Promise<ActionResult<unknown>>;

const state = vi.hoisted(() => ({
  hideListing: vi.fn<Call<{ number: number }>>(),
  unhideListing: vi.fn<Call<{ number: number }>>(),
  blockAuthor: vi.fn<Call<{ number: number }>>(),
  unblockAuthor: vi.fn<Call<{ number: number }>>(),
  reportListing: vi.fn<Call<unknown>>(),
  unreportListing: vi.fn<Call<{ number: number }>>(),
  closeActions: vi.fn<(number: number, step: string | null) => Promise<void>>(),
  closeListing: vi.fn<(step: string | null, close: () => void) => Promise<void>>(),
  /** The listing layer's own close (WP-36): `closeListing` receives it. */
  closeLayer: vi.fn(),
}));
vi.mock("@/lib/actions/hidden", () => ({
  hideListing: state.hideListing,
  unhideListing: state.unhideListing,
  blockAuthor: state.blockAuthor,
  unblockAuthor: state.unblockAuthor,
}));
vi.mock("@/lib/actions/reports", () => ({ reportListing: state.reportListing, unreportListing: state.unreportListing }));
vi.mock("@/features/listing/closeListing", () => ({ closeActions: state.closeActions, closeListing: state.closeListing }));
/** `useListing` (the layer's context) imports the locale router; nothing here navigates through it. */
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

import { type UseListingActionsOptions, useListingActions } from "@/features/listing/actions/useListingActions";
import { ListingLayerContext } from "@/features/listing/useListing";
import { clearTracked, recentTracked } from "@/lib/analytics/events";
import { isHidden, resetSessionMaps } from "@/lib/data/sessionMaps";
import { clearRecentErrors, recentErrors } from "@/lib/errors/report";
import { type DevFlags, devFlags } from "@/lib/flags";
import { currentToast, dismissToast, type ToastMessage } from "@/lib/ui/toast";

import { withDevFlags } from "../helpers/flags";

const AUTHOR: ListingAuthor = { kind: "phone", label: "+998 ** *** ** 67", count: 3 };
const DONE: ActionResult<null> = { ok: true, data: null, meta: { source: "stub" } };
const FAILED: ActionResult<never> = { ok: false, error: "source_unavailable", status: 503, code: "source_unavailable", method: "PUT", path: "hidden/listings/:number" };
const BLOCKED: ActionResult<BlockedAuthorResult> = {
  ok: true,
  data: { id: "01JD0000000000000000000013", kind: "phone", label: "+998 ** *** ** 67", count: 3, listing_numbers: [100001, 101001, 101005] },
  meta: { source: "stub" },
};
const reported = (hidden: boolean, agentMarked = false): ActionResult<ReportResult> => ({
  ok: true,
  data: { hidden, agent_marked: agentMarked },
  meta: { source: "stub" },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** The Activity mode the next render shows the hook in (a route hidden with its cache, then shown again). */
let mode: "visible" | "hidden" = "visible";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      <ListingLayerContext value={{ number: 100001, scrollToTop: () => {}, reportView: () => {}, view: null, close: state.closeLayer }}>
        <Activity mode={mode}>{children}</Activity>
      </ListingLayerContext>
    </NextIntlClientProvider>
  );
}

function hook(options: Partial<UseListingActionsOptions> = {}) {
  return renderHook((props: Partial<UseListingActionsOptions>) => useListingActions({ number: 100001, author: AUTHOR, flags: devFlags, ...props }), {
    wrapper,
    initialProps: options,
  });
}

/** Lets an action's promise and its result handler run. */
const settle = () => act(async () => {});

let fake: FakeTelegram | null = null;
const haptics = () =>
  (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);
const LIGHT = "HapticFeedback.impactOccurred(light)";
const SUCCESS = "HapticFeedback.notificationOccurred(success)";
const ERROR = "HapticFeedback.notificationOccurred(error)";

const appToast = () => currentToast("app")?.message ?? null;
const sheetToast = () => currentToast("sheet")?.message ?? null;
/** The undo of the app's toast, as its «Вернуть» calls it. */
function undoOf(message: ToastMessage | null): () => Promise<unknown> {
  if (message === null || typeof message !== "object" || !("action" in message)) {
    throw new Error("the toast has no action");
  }
  return () => Promise.resolve(message.run());
}

beforeEach(() => {
  mode = "visible";
  window.history.replaceState(null, "", "/ru/listing/100001/actions");
  for (const mock of [state.hideListing, state.unhideListing, state.blockAuthor, state.unblockAuthor, state.reportListing, state.unreportListing]) {
    mock.mockReset();
  }
  state.closeActions.mockReset().mockResolvedValue(undefined);
  state.closeListing.mockReset().mockResolvedValue(undefined);
  state.closeLayer.mockReset();
  fake = fakeTelegram({ version: "8.0" });
});

afterEach(() => {
  cleanup();
  dismissToast("app");
  dismissToast("sheet");
  resetSessionMaps();
  clearTracked();
  clearRecentErrors();
  fake?.uninstall();
  fake = null;
});

describe("useListingActions: the results table (SCR-023)", () => {
  it("hide: light, then success; the number into hidden, the listing closes, «Объявление скрыто» + «Вернуть» in the app's host", async () => {
    const sent = deferred<ActionResult<null>>();
    state.hideListing.mockReturnValueOnce(sent.promise);
    const { result } = hook();

    act(() => result.current.hide());

    expect(result.current.busy).toBe(true);
    expect(haptics()).toEqual([LIGHT]);
    expect(state.hideListing.mock.calls).toEqual([[{ number: 100001 }, undefined, "ru"]]);

    await act(async () => sent.resolve(DONE));

    expect(haptics()).toEqual([LIGHT, SUCCESS]);
    expect(isHidden(100001)).toBe(true);
    expect(state.closeListing.mock.calls).toEqual([[null, state.closeLayer, 100001]]);
    expect(state.closeActions).not.toHaveBeenCalled();
    expect(appToast()).toMatchObject({ text: "Объявление скрыто", action: "Вернуть" });
    expect(sheetToast()).toBeNull();
    // The sheet is on its way out: it stays busy.
    expect(result.current.busy).toBe(true);
  });

  it("«Вернуть» of hide: out of hidden at once, then unhideListing; a failed undo hides it again with the error toast", async () => {
    state.hideListing.mockResolvedValueOnce(DONE);
    const { result } = hook();
    act(() => result.current.hide());
    await settle();
    const undo = undoOf(appToast());

    const reverted = deferred<ActionResult<null>>();
    state.unhideListing.mockReturnValueOnce(reverted.promise);
    let running: Promise<unknown> = Promise.resolve();
    act(() => {
      running = undo();
    });
    expect(isHidden(100001)).toBe(false);
    expect(state.unhideListing.mock.calls).toEqual([[{ number: 100001 }, undefined, "ru"]]);
    await act(async () => {
      reverted.resolve(DONE);
      await running;
    });
    expect(isHidden(100001)).toBe(false);

    state.unhideListing.mockResolvedValueOnce(FAILED);
    await act(() => undo());
    expect(isHidden(100001)).toBe(true);
    expect(appToast()).toEqual({ key: "common.saveFailed" });
    expect(haptics().at(-1)).toBe(ERROR);
  });

  it("block: the number and every number of the answer, de-duplicated, into hidden; the listing closes; «Автор … заблокирован» + «Вернуть»", async () => {
    state.blockAuthor.mockResolvedValueOnce(BLOCKED);
    const { result } = hook();

    act(() => result.current.block());
    await settle();

    expect(state.blockAuthor.mock.calls).toEqual([[{ number: 100001 }, undefined, "ru"]]);
    expect([100001, 101001, 101005].map(isHidden)).toEqual([true, true, true]);
    expect(state.closeListing.mock.calls).toEqual([[null, state.closeLayer, 100001]]);
    expect(appToast()).toMatchObject({ text: "Автор +998 ** *** ** 67 заблокирован", action: "Вернуть" });
    expect(haptics()).toEqual([LIGHT, SUCCESS]);

    const undo = undoOf(appToast());
    state.unblockAuthor.mockResolvedValueOnce(DONE);
    await act(() => undo());
    expect(state.unblockAuthor.mock.calls).toEqual([[{ number: 100001 }, undefined, "ru"]]);
    expect([100001, 101001, 101005].map(isHidden)).toEqual([false, false, false]);

    state.unblockAuthor.mockResolvedValueOnce(FAILED);
    await act(() => undo());
    expect([100001, 101001, 101005].map(isHidden)).toEqual([true, true, true]);
    expect(appToast()).toEqual({ key: "common.saveFailed" });
  });

  it("block: the server's label as it is; the author's label only when the answer has none", async () => {
    state.blockAuthor.mockResolvedValueOnce({ ...BLOCKED, data: { ...BLOCKED.data, kind: "source", label: "stub_channel_a" } });
    const { result, unmount } = hook();
    act(() => result.current.block());
    await settle();
    expect(appToast()).toMatchObject({ text: "Автор stub_channel_a заблокирован" });
    unmount();

    state.blockAuthor.mockResolvedValueOnce({ ...BLOCKED, data: { ...BLOCKED.data, label: "" } });
    const second = hook({ author: { kind: "source", label: "stub_channel_c", count: 1 } });
    act(() => second.result.current.block());
    await settle();
    expect(appToast()).toMatchObject({ text: "Автор stub_channel_c заблокирован" });
  });

  it("fraud that hid the listing: as hide, with «Спасибо, посмотрим. Это объявление у вас скрыли» + «Показывать у меня» → unhideListing", async () => {
    state.reportListing.mockResolvedValueOnce(reported(true));
    const { result } = hook();

    act(() => result.current.report("fraud"));
    await settle();

    expect(isHidden(100001)).toBe(true);
    expect(state.closeListing.mock.calls).toEqual([[null, state.closeLayer, 100001]]);
    expect(appToast()).toMatchObject({ text: "Спасибо, посмотрим. Это объявление у вас скрыли", action: "Показывать у меня" });

    state.unhideListing.mockResolvedValueOnce(DONE);
    await act(() => undoOf(appToast())());
    expect(state.unhideListing.mock.calls).toEqual([[{ number: 100001 }, undefined, "ru"]]);
    expect(state.unreportListing).not.toHaveBeenCalled();
    expect(isHidden(100001)).toBe(false);
  });

  it("fraud that did not hide it: the sheet closes, «Спасибо! Посмотрим», nothing hidden", async () => {
    state.reportListing.mockResolvedValueOnce(reported(false));
    const { result } = hook();

    act(() => result.current.report("fraud"));
    await settle();

    expect(isHidden(100001)).toBe(false);
    expect(state.closeActions.mock.calls).toEqual([[100001, null]]);
    expect(state.closeListing).not.toHaveBeenCalled();
    expect(appToast()).toEqual({ key: "toast.reported" });
  });

  it("rented, dev051RentedUndo off: into hidden, the listing closes, «Отметили: уже сдано» without an action", async () => {
    state.reportListing.mockResolvedValueOnce(reported(false));
    const { result } = withDevFlags({ dev051RentedUndo: false }, (flags) => hook({ flags }));

    act(() => result.current.report("rented"));
    await settle();

    expect(isHidden(100001)).toBe(true);
    expect(state.closeListing.mock.calls).toEqual([[null, state.closeLayer, 100001]]);
    expect(appToast()).toEqual({ key: "toast.reportedRented" });
  });

  it("rented with the default flags (dev051RentedUndo on): «Вернуть» shows the listing at once and withdraws the report", async () => {
    state.reportListing.mockResolvedValueOnce(reported(true));
    const { result } = hook();

    act(() => result.current.report("rented"));
    await settle();
    expect(isHidden(100001)).toBe(true);
    expect(appToast()).toMatchObject({ text: "Отметили: уже сдано", action: "Вернуть" });

    const withdrawn = deferred<ActionResult<null>>();
    state.unreportListing.mockReturnValueOnce(withdrawn.promise);
    const undone = undoOf(appToast())();
    expect(isHidden(100001)).toBe(false);
    await act(async () => {
      withdrawn.resolve(DONE);
      await undone;
    });
    expect(state.unreportListing.mock.calls).toEqual([[{ number: 100001 }, undefined, "ru"]]);
    expect(state.unhideListing).not.toHaveBeenCalled();
    expect(isHidden(100001)).toBe(false);
    expect(appToast()).toMatchObject({ text: "Отметили: уже сдано" });
  });

  it("a failed withdrawal hides the listing again, with the error haptic and «Не получилось сохранить»", async () => {
    state.reportListing.mockResolvedValueOnce(reported(true));
    const { result } = hook();
    act(() => result.current.report("rented"));
    await settle();

    state.unreportListing.mockResolvedValueOnce({ ...FAILED, method: "DELETE", path: "listings/:number/reports" });
    await act(() => undoOf(appToast())());
    expect(isHidden(100001)).toBe(true);
    expect(haptics()).toEqual([LIGHT, SUCCESS, ERROR]);
    expect(appToast()).toEqual({ key: "common.saveFailed" });
  });

  it.each<[Partial<DevFlags>, boolean, string]>([
    [{ dev010AgentMarkedToast: true }, true, "toast.reportedAgent"],
    [{ dev010AgentMarkedToast: true }, false, "toast.reportedAgentNoted"],
    [{ dev010AgentMarkedToast: false }, true, "toast.reportedAgent"],
    [{ dev010AgentMarkedToast: false }, false, "toast.reportedAgent"],
    [{ dev010AgentMarkedToast: true, dev010RealtorVoteWording: true }, false, "toast.reportedAgentNoted"],
    [{ dev010AgentMarkedToast: false, dev010RealtorVoteWording: true }, false, "toast.reportedAgent"],
  ])("agent with %o and agent_marked %s: the sheet closes, the toast %s, nothing hidden", async (overrides, agentMarked, key) => {
    state.reportListing.mockResolvedValueOnce(reported(false, agentMarked));
    const { result } = withDevFlags(overrides, (flags) => hook({ flags }));

    act(() => result.current.report("agent"));
    await settle();

    expect(isHidden(100001)).toBe(false);
    expect(state.closeActions.mock.calls).toEqual([[100001, null]]);
    expect(appToast()).toEqual({ key });
  });

  it("rented, agent and fraud send the reason alone, without a detail key", async () => {
    state.reportListing.mockResolvedValue(reported(false));
    for (const reason of ["rented", "agent", "fraud"] as const) {
      const { result, unmount } = hook();
      act(() => result.current.report(reason));
      await settle();
      unmount();
    }
    const inputs = state.reportListing.mock.calls.map(([input]) => input as ReportInput);
    expect(inputs).toEqual([
      { number: 100001, reason: "rented" },
      { number: 100001, reason: "agent" },
      { number: 100001, reason: "fraud" },
    ]);
    expect(inputs.some((input) => "detail" in input)).toBe(false);
  });

  it("a detail sends wrong_data with its code; the sheet closes, «Спасибо! Посмотрим»", async () => {
    state.reportListing.mockResolvedValueOnce(reported(false));
    window.history.replaceState(null, "", "/ru/listing/100001/actions?step=detail");
    const { result } = hook();

    act(() => result.current.reportDetail("price"));
    await settle();

    expect(state.reportListing.mock.calls).toEqual([[{ number: 100001, reason: "wrong_data", detail: "price" }, undefined, "ru"]]);
    expect(state.closeActions.mock.calls).toEqual([[100001, "detail"]]);
    expect(appToast()).toEqual({ key: "toast.reported" });
    expect(haptics()).toEqual([LIGHT, SUCCESS]);
  });

  it.each<[string, (actions: ReturnType<typeof useListingActions>) => void, () => void]>([
    ["hide", (actions) => actions.hide(), () => state.hideListing.mockResolvedValueOnce(FAILED)],
    ["block", (actions) => actions.block(), () => state.blockAuthor.mockResolvedValueOnce(FAILED)],
    ["rented", (actions) => actions.report("rented"), () => state.reportListing.mockResolvedValueOnce(FAILED)],
    ["fraud", (actions) => actions.report("fraud"), () => state.reportListing.mockResolvedValueOnce(FAILED)],
    ["a detail", (actions) => actions.reportDetail("other"), () => state.reportListing.mockResolvedValueOnce(FAILED)],
  ])("a failed %s changes nothing: the sheet stays, «Не получилось сохранить» in its own host, the error haptic", async (_, start, fail) => {
    fail();
    const { result } = hook();

    act(() => start(result.current));
    await settle();

    expect(haptics()).toEqual([LIGHT, ERROR]);
    expect(sheetToast()).toEqual({ key: "common.saveFailed" });
    expect(appToast()).toBeNull();
    expect([100001, 101001, 101005].map(isHidden)).toEqual([false, false, false]);
    expect(state.closeActions).not.toHaveBeenCalled();
    expect(state.closeListing).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });

  it("the failure toast shows with dev016ErrorToastOnFailure off as well", async () => {
    state.hideListing.mockResolvedValueOnce(FAILED);
    const { result } = withDevFlags({ dev016ErrorToastOnFailure: false }, (flags) => hook({ flags }));
    act(() => result.current.hide());
    await settle();
    expect(sheetToast()).toEqual({ key: "common.saveFailed" });
  });

  it("an action that cannot be reached at all is a failure too", async () => {
    state.hideListing.mockRejectedValueOnce(new Error("network"));
    const { result } = hook();
    act(() => result.current.hide());
    await settle();
    expect(sheetToast()).toEqual({ key: "common.saveFailed" });
    expect(result.current.busy).toBe(false);
  });

  it("nothing reaches track() or reportError()", async () => {
    state.blockAuthor.mockResolvedValueOnce(BLOCKED);
    const { result } = hook();
    act(() => result.current.block());
    await settle();
    expect(recentTracked()).toEqual([]);
    expect(recentErrors()).toEqual([]);
  });
});

describe("useListingActions: busy, the number, leaving", () => {
  it("while a request runs every other action is ignored (no haptic, no request); after a failure the next one runs", async () => {
    const sent = deferred<ActionResult<null>>();
    state.hideListing.mockReturnValueOnce(sent.promise);
    state.reportListing.mockResolvedValue(reported(false));
    const { result } = hook();

    act(() => result.current.hide());
    act(() => {
      result.current.hide();
      result.current.block();
      result.current.report("agent");
      result.current.reportDetail("price");
      result.current.support("homi_help");
    });
    expect(state.hideListing).toHaveBeenCalledTimes(1);
    expect(state.blockAuthor).not.toHaveBeenCalled();
    expect(state.reportListing).not.toHaveBeenCalled();
    expect(haptics()).toEqual([LIGHT]);

    await act(async () => sent.resolve(FAILED));
    act(() => result.current.report("agent"));
    await settle();
    expect(state.reportListing).toHaveBeenCalledTimes(1);
  });

  it("after a success the sheet is closing: further taps are ignored until it is shown anew", async () => {
    state.reportListing.mockResolvedValue(reported(false));
    const { result, rerender } = hook();
    act(() => result.current.report("agent"));
    await settle();

    act(() => result.current.report("fraud"));
    expect(state.reportListing).toHaveBeenCalledTimes(1);

    // Hidden with its cached route, then shown again: a fresh showing.
    mode = "hidden";
    rerender({});
    mode = "visible";
    rerender({});
    expect(result.current.busy).toBe(false);
    act(() => result.current.report("fraud"));
    await settle();
    expect(state.reportListing).toHaveBeenCalledTimes(2);
  });

  it("a result applies to the number its action started with", async () => {
    const sent = deferred<ActionResult<null>>();
    state.hideListing.mockReturnValueOnce(sent.promise);
    const { result, rerender } = hook();

    act(() => result.current.hide());
    rerender({ number: 100002 });
    await act(async () => sent.resolve(DONE));

    expect(isHidden(100001)).toBe(true);
    expect(isHidden(100002)).toBe(false);
    state.unhideListing.mockResolvedValueOnce(DONE);
    await act(() => undoOf(appToast())());
    expect(state.unhideListing.mock.calls).toEqual([[{ number: 100001 }, undefined, "ru"]]);
  });

  it("close(): the sheet with all its steps, from the step in the address; a second close does nothing", () => {
    window.history.replaceState(null, "", "/ru/listing/100001/actions?step=report");
    const { result } = hook();

    act(() => {
      result.current.close();
      result.current.close();
    });

    expect(state.closeActions.mock.calls).toEqual([[100001, "report"]]);
    expect(haptics()).toEqual([]);
  });

  it("closed while its request ran: the result applies and toasts in the app's host, without moving the address again", async () => {
    const sent = deferred<ActionResult<null>>();
    state.hideListing.mockReturnValueOnce(sent.promise);
    const { result } = hook();

    act(() => result.current.hide());
    act(() => result.current.close());
    await act(async () => sent.resolve(DONE));

    expect(state.closeActions.mock.calls).toEqual([[100001, null]]);
    expect(state.closeListing).not.toHaveBeenCalled();
    expect(isHidden(100001)).toBe(true);
    expect(appToast()).toMatchObject({ text: "Объявление скрыто", action: "Вернуть" });
  });

  it("left with Telegram's Back while its request ran: a failure still shows, in the app's host", async () => {
    const sent = deferred<ActionResult<null>>();
    state.hideListing.mockReturnValueOnce(sent.promise);
    const { result, rerender } = hook();

    act(() => result.current.hide());
    mode = "hidden";
    rerender({});
    await act(async () => sent.resolve(FAILED));

    expect(appToast()).toEqual({ key: "common.saveFailed" });
    expect(sheetToast()).toBeNull();
    expect(state.closeActions).not.toHaveBeenCalled();
  });

  it("support: light, the support chat with the listing's start parameter, then the sheet closes; a bad account does nothing", () => {
    window.history.replaceState(null, "", "/ru/listing/100001/actions?step=report");
    const { result } = hook();

    act(() => result.current.support("no"));
    expect(haptics()).toEqual([]);
    expect(state.closeActions).not.toHaveBeenCalled();

    act(() => result.current.support("homi_help"));
    act(() => result.current.support("homi_help"));

    expect(haptics()).toEqual([LIGHT]);
    expect((fake?.calls ?? []).filter((entry) => entry.member === "openTelegramLink").map((entry) => entry.args[0])).toEqual([
      "https://t.me/homi_help?start=l_100001",
    ]);
    expect(state.closeActions.mock.calls).toEqual([[100001, "report"]]);
    expect(result.current.busy).toBe(true);
  });
});
