import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { type ComponentType, type ReactNode, Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ListingAuthor, ReportResult } from "@/features/listing/listingData";
import type { ActionResult } from "@/lib/actions/run";

type Call = (input: unknown, auth?: unknown, locale?: string) => Promise<ActionResult<unknown>>;

const state = vi.hoisted(() => ({
  /** Listeners of the mocked router hooks: told on every `pushState`, `replaceState` and `popstate`. */
  address: new Set<() => void>(),
  hideListing: vi.fn<Call>(),
  unhideListing: vi.fn<Call>(),
  blockAuthor: vi.fn<Call>(),
  unblockAuthor: vi.fn<Call>(),
  reportListing: vi.fn<Call>(),
  closeActions: vi.fn<(number: number, step: string | null) => Promise<void>>(),
  closeListing: vi.fn<(step: string | null) => Promise<void>>(),
}));
/** The router's view of the address follows the document's, as the App Router's does. */
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => {
    state.address.add(listener);
    return () => state.address.delete(listener);
  };
  const useHref = () => useSyncExternalStore(subscribe, () => window.location.pathname + window.location.search);
  return {
    usePathname: () => useHref().split("?")[0],
    useSearchParams: () => new URLSearchParams(useHref().split("?")[1] ?? ""),
  };
});
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/listing/100001/actions" }));
/** One step back, as `useBack().back` does at a depth above 0. */
vi.mock("@/lib/navigation/useBack", () => ({ useBack: () => ({ canGoBack: true, back: () => window.history.back() }) }));
/** The route loads the sheet with `next/dynamic`; here it is `React.lazy` under the test's `Suspense`. */
vi.mock("next/dynamic", async () => {
  const { lazy } = await import("react");
  return {
    default: (load: () => Promise<ComponentType<Record<string, unknown>>>) => lazy(async () => ({ default: await load() })),
  };
});
vi.mock("@/lib/actions/hidden", () => ({
  hideListing: state.hideListing,
  unhideListing: state.unhideListing,
  blockAuthor: state.blockAuthor,
  unblockAuthor: state.unblockAuthor,
}));
vi.mock("@/lib/actions/reports", () => ({ reportListing: state.reportListing }));
vi.mock("@/features/listing/closeListing", () => ({ closeActions: state.closeActions, closeListing: state.closeListing }));

import { ListingActionsRoute } from "@/features/listing/actions/ListingActionsRoute";
import { BLOCK_COUNT_FROM, ListingActionsSheet, type ListingActionsSheetProps } from "@/features/listing/actions/ListingActionsSheet";
import { REPORT_DETAILS } from "@/features/listing/actions/ReportDetailStep";
import type { ListingActions } from "@/features/listing/actions/useListingActions";
import { listingKey, type ListingRecord } from "@/features/listing/listingData";
import { ListingLayerContext } from "@/features/listing/useListing";
import { resetPreviews, setPreview } from "@/lib/data/previewCache";
import { resetSessionMaps } from "@/lib/data/sessionMaps";
import { resetResources, seedResource } from "@/lib/data/useResource";
import { resetReference } from "@/lib/reference/useReference";
import { dismissToast } from "@/lib/ui/toast";

import { detailsOf } from "../helpers/details";
import { previewOf } from "../helpers/listing";
import { feedReference } from "../helpers/reference";

const PHONE: ListingAuthor = { kind: "phone", label: "+998 ** *** ** 67", count: 3 };
/** The catalogue binds the label to its preposition with a no-break space. */
const NBSP = String.fromCharCode(0xa0);
const PHONE_HINT = `Не показывать объявления с номера${NBSP}+998 ** *** ** 67`;
const reported = (hidden: boolean): ActionResult<ReportResult> => ({ ok: true, data: { hidden }, meta: { source: "stub" } });
const FAILED: ActionResult<never> = { ok: false, error: "source_unavailable", status: 503, code: "source_unavailable", method: "PUT", path: "hidden/listings/:number" };

function withIntl(children: ReactNode) {
  return (
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      {children}
    </NextIntlClientProvider>
  );
}

function fakeActions(overrides: Partial<ListingActions> = {}): ListingActions {
  return {
    busy: false,
    hide: vi.fn(),
    block: vi.fn(),
    report: vi.fn(),
    reportDetail: vi.fn(),
    support: vi.fn(),
    close: vi.fn(),
    ...overrides,
  };
}

function sheet(props: Partial<ListingActionsSheetProps> = {}) {
  const all: ListingActionsSheetProps = {
    step: "menu",
    author: PHONE,
    isOwner: null,
    supportUsername: "homi_help",
    actions: fakeActions(),
    onOpenStep: vi.fn(),
    onBack: vi.fn(),
    agentReview: false,
    ...props,
  };
  render(withIntl(<ListingActionsSheet {...all} />));
  return all;
}

const row = (action: string) => document.querySelector<HTMLButtonElement>(`button[data-action-row="${action}"]`);
const rows = () => [...document.querySelectorAll<HTMLButtonElement>("button[data-action-row]")].map((button) => button.dataset.actionRow);
const hintOf = (action: string) => row(action)?.querySelector("span > span:nth-child(2)") ?? null;
const chevron = () => document.querySelector<HTMLButtonElement>("button[data-sheet-back]");
const step = () => document.querySelector<HTMLElement>('[data-route="listing/actions"]')?.dataset.step ?? null;
const arrowIn = (action: string) => row(action)?.querySelector(".lucide-chevron-right") !== null;

let fake: FakeTelegram | null = null;
const haptics = () =>
  (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);
const LIGHT = "HapticFeedback.impactOccurred(light)";

/** The document's own `pushState`, without telling the mocked router. */
let pushStateQuietly: History["pushState"] = () => {};
const pushes = () => vi.mocked(window.history.pushState).mock.calls.length;

const notify = () => {
  for (const listener of state.address) {
    listener();
  }
};

beforeEach(() => {
  window.history.replaceState(null, "", "/ru/listing/100001/actions");
  pushStateQuietly = window.history.pushState.bind(window.history);
  vi.spyOn(window.history, "pushState").mockImplementation((...args) => {
    pushStateQuietly(...args);
    notify();
  });
  window.addEventListener("popstate", notify);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(400);
  for (const mock of [state.hideListing, state.unhideListing, state.blockAuthor, state.unblockAuthor, state.reportListing]) {
    mock.mockReset();
  }
  state.closeActions.mockReset().mockResolvedValue(undefined);
  state.closeListing.mockReset().mockResolvedValue(undefined);
  fake = fakeTelegram({ version: "8.0" });
});

afterEach(() => {
  cleanup();
  window.removeEventListener("popstate", notify);
  dismissToast("app");
  dismissToast("sheet");
  resetResources();
  resetPreviews();
  resetReference();
  resetSessionMaps();
  fake?.uninstall();
  fake = null;
});

describe("ListingActionsSheet: the menu", () => {
  it("rows in order — hide, block, report (with ›), support — with their texts, in a dialog named «Объявление» without a chevron", () => {
    sheet();
    expect(rows()).toEqual(["hide", "block", "report", "support"]);
    expect(screen.getByRole("dialog", { name: "Объявление" })).toBeTruthy();
    expect(chevron()).toBeNull();
    expect(row("hide")?.textContent).toBe("Скрыть объявлениеБольше не покажем ни его, ни его копии");
    expect(row("report")?.textContent).toBe("ПожаловатьсяСдано, риелтор, ошибка или обман");
    expect(arrowIn("report")).toBe(true);
    expect(arrowIn("hide")).toBe(false);
    expect(row("support")?.textContent).toBe("Написать в поддержкуУже сдано, мошенник или это ваше объявление — разберёмся");
  });

  it.each<[string, ListingAuthor | null, string, boolean]>([
    ["a phone", PHONE, PHONE_HINT, true],
    ["a source, its label as given", { kind: "source", label: "stub_channel_a", count: 1 }, `Не показывать объявления из${NBSP}stub_channel_a`, false],
    ["no author", null, "Не показывать его объявления", false],
    ["another kind", { kind: "channel", label: "x", count: 2 }, "Не показывать его объявления", false],
  ])("block hint for %s", (_, author, text, masked) => {
    sheet({ author });
    expect(hintOf("block")?.textContent).toBe(text);
    expect(hintOf("block")?.classList.contains("ph-mask")).toBe(masked);
  });

  it(`the count from ${BLOCK_COUNT_FROM} listings: none at 19, «— скроет 20 объявлений» at 20`, () => {
    sheet({ author: { ...PHONE, count: 19 } });
    expect(hintOf("block")?.textContent).toBe(PHONE_HINT);
    cleanup();

    sheet({ author: { ...PHONE, count: 20 } });
    expect(hintOf("block")?.textContent).toBe(`${PHONE_HINT} — скроет 20 объявлений`);
    cleanup();

    sheet({ author: { kind: "source", label: "stub_channel_c", count: 23 } });
    expect(hintOf("block")?.textContent).toBe(`Не показывать объявления из${NBSP}stub_channel_c — скроет 23 объявления`);
  });

  it("the support row only with a support account; a tap asks for that account", () => {
    const props = sheet();
    fireEvent.click(row("support")!);
    expect(props.actions.support).toHaveBeenCalledWith("homi_help");
    cleanup();

    sheet({ supportUsername: null });
    expect(rows()).toEqual(["hide", "block", "report"]);
  });

  it("hide and block start their action; «Пожаловаться» opens the report step", () => {
    const props = sheet();
    fireEvent.click(row("hide")!);
    fireEvent.click(row("block")!);
    fireEvent.click(row("report")!);
    expect(props.actions.hide).toHaveBeenCalledTimes(1);
    expect(props.actions.block).toHaveBeenCalledTimes(1);
    expect(props.onOpenStep).toHaveBeenCalledWith("report");
  });

  it("× closes every step through the actions' close", () => {
    const props = sheet({ step: "detail" });
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(props.actions.close).toHaveBeenCalledTimes(1);
  });

  it("is portalled to body with its own toast host inside the dialog", () => {
    const { container } = render(withIntl(<ListingActionsSheet step="menu" author={PHONE} isOwner={null} supportUsername={null} actions={fakeActions()} onOpenStep={vi.fn()} onBack={vi.fn()} agentReview={false} />));
    expect(container.querySelector('[data-route="listing/actions"]')).toBeNull();
    expect(document.querySelector('[role="dialog"] [data-route="listing/actions"][data-step="menu"]')).toBeTruthy();
    expect(document.querySelector('[role="dialog"] [data-toast-host="sheet"]')).toBeTruthy();
    expect(document.querySelector('[data-route="listing/actions"]')?.hasAttribute("data-layer")).toBe(false);
  });

  it("busy: every row is disabled and a tap starts nothing", () => {
    const props = sheet({ actions: fakeActions({ busy: true }) });
    for (const action of ["hide", "block", "report", "support"]) {
      expect(row(action)?.disabled, action).toBe(true);
      fireEvent.click(row(action)!);
    }
    expect(props.actions.hide).not.toHaveBeenCalled();
    expect(props.actions.block).not.toHaveBeenCalled();
    expect(props.actions.support).not.toHaveBeenCalled();
    expect(props.onOpenStep).not.toHaveBeenCalled();
    expect(document.querySelector('[data-route="listing/actions"]')?.getAttribute("aria-busy")).toBe("true");
  });
});

describe("ListingActionsSheet: the report and detail steps", () => {
  it("report: «Что не так?», the chevron «Назад», four reasons with «Неверные данные» carrying ›", () => {
    const props = sheet({ step: "report" });
    expect(screen.getByRole("dialog", { name: "Что не так?" })).toBeTruthy();
    expect(rows()).toEqual(["rented", "agent", "wrong_data", "fraud"]);
    expect(row("agent")?.textContent).toBe("Это риелтор, а не хозяинОтметим номер как риелторский");
    expect(row("wrong_data")?.textContent).toBe("Неверные данныеЦена, район или комнаты не совпадают");
    expect(arrowIn("wrong_data")).toBe(true);
    expect(arrowIn("fraud")).toBe(false);

    expect(chevron()?.getAttribute("aria-label")).toBe("Назад");
    fireEvent.click(chevron()!);
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it("the agent row is hidden for a listing not from an owner and kept for an unknown one", () => {
    sheet({ step: "report", isOwner: false });
    expect(rows()).toEqual(["rented", "wrong_data", "fraud"]);
    cleanup();
    sheet({ step: "report", isOwner: true });
    expect(rows()).toContain("agent");
  });

  it("dev010RealtorVoteWording picks the review hint", () => {
    sheet({ step: "report", agentReview: true });
    expect(hintOf("agent")?.textContent).toBe("Проверим номер — если это риелтор, отметим его");
  });

  it("the reasons: rented, agent, fraud start a report; «Неверные данные» opens the detail step and starts nothing", () => {
    const props = sheet({ step: "report" });
    fireEvent.click(row("rented")!);
    fireEvent.click(row("agent")!);
    fireEvent.click(row("fraud")!);
    fireEvent.click(row("wrong_data")!);
    expect(vi.mocked(props.actions.report).mock.calls).toEqual([["rented"], ["agent"], ["fraud"]]);
    expect(props.onOpenStep).toHaveBeenCalledWith("detail");
    expect(props.actions.reportDetail).not.toHaveBeenCalled();
  });

  it("detail: «Что именно неверно?», the chevron, five rows in order without icons or arrows", () => {
    const props = sheet({ step: "detail" });
    expect(screen.getByRole("dialog", { name: "Что именно неверно?" })).toBeTruthy();
    expect(chevron()).toBeTruthy();
    expect(rows()).toEqual([...REPORT_DETAILS]);
    expect([...document.querySelectorAll("button[data-action-row]")].map((button) => button.textContent)).toEqual([
      "ЦенаДругая сумма или валюта",
      "Комнаты, площадь или этажНе совпадают с постом или квартирой",
      "Район или место на картеКвартира в другом районе",
      "ФотоФото не от этой квартиры",
      "ДругоеТип жилья, ремонт, условия",
    ]);
    expect(document.querySelectorAll("button[data-action-row] svg")).toHaveLength(0);

    fireEvent.click(row("place")!);
    expect(props.actions.reportDetail).toHaveBeenCalledWith("place");
  });

  it("busy on a step: the rows are disabled", () => {
    const props = sheet({ step: "detail", actions: fakeActions({ busy: true }) });
    fireEvent.click(row("price")!);
    expect(props.actions.reportDetail).not.toHaveBeenCalled();
    cleanup();
    const report = sheet({ step: "report", actions: fakeActions({ busy: true }) });
    fireEvent.click(row("wrong_data")!);
    expect(report.onOpenStep).not.toHaveBeenCalled();
  });
});

describe("ListingActionsRoute: the sheet over the listing's resource", () => {
  function route(record: ListingRecord | null = { listing: detailsOf({ is_owner: true }) }) {
    if (record !== null) {
      seedResource(listingKey(100001), record);
    }
    feedReference({ reference: { bot: { username: "homi_bot", support_username: "homi_help" } } });
    return render(
      withIntl(
        <ListingLayerContext value={{ number: 100001, scrollToTop: () => {}, reportView: () => {}, view: null }}>
          <Suspense fallback={null}>
            <ListingActionsRoute />
          </Suspense>
        </ListingLayerContext>,
      ),
    );
  }
  const title = () => document.querySelector('[data-slot="bottom-sheet-title"]')?.textContent ?? null;
  const here = () => window.location.pathname + window.location.search;
  const popped = () => new Promise<void>((resolve) => window.addEventListener("popstate", () => resolve(), { once: true }));

  it("step order with Back: menu → report → detail, then the chevron walks detail → report → menu", async () => {
    route();
    await screen.findByRole("dialog", { name: "Объявление" });

    fireEvent.click(row("report")!);
    expect(here()).toBe("/ru/listing/100001/actions?step=report");
    expect(title()).toBe("Что не так?");
    expect(step()).toBe("report");
    expect(haptics()).toEqual([LIGHT]);

    fireEvent.click(row("wrong_data")!);
    expect(here()).toBe("/ru/listing/100001/actions?step=detail");
    expect(title()).toBe("Что именно неверно?");
    expect(haptics()).toEqual([LIGHT, LIGHT]);
    expect(state.reportListing).not.toHaveBeenCalled();
    expect(pushes()).toBe(2);

    let back = popped();
    fireEvent.click(chevron()!);
    await back;
    await waitFor(() => expect(title()).toBe("Что не так?"));
    expect(here()).toBe("/ru/listing/100001/actions?step=report");

    back = popped();
    fireEvent.click(chevron()!);
    await back;
    await waitFor(() => expect(title()).toBe("Объявление"));
    expect(chevron()).toBeNull();
    // The chevron plays no haptic.
    expect(haptics()).toEqual([LIGHT, LIGHT]);
  });

  it("a second tap on the chevron before Back has landed steps back once: report → menu, the sheet stays", async () => {
    route();
    await screen.findByRole("dialog", { name: "Объявление" });
    fireEvent.click(row("report")!);
    expect(title()).toBe("Что не так?");
    const historyBack = vi.spyOn(window.history, "back");

    const back = popped();
    fireEvent.click(chevron()!);
    fireEvent.click(chevron()!);
    expect(historyBack).toHaveBeenCalledTimes(1);
    await back;
    await waitFor(() => expect(title()).toBe("Объявление"));
    expect(here()).toBe("/ru/listing/100001/actions");
    historyBack.mockRestore();
  });

  it("a second tap on «Пожаловаться» before the router follows the address pushes nothing", async () => {
    route();
    await screen.findByRole("dialog");
    // The router's `useSearchParams` follows `pushState` only in a transition: the menu is still on screen.
    vi.mocked(window.history.pushState).mockImplementation((...args) => pushStateQuietly(...args));

    fireEvent.click(row("report")!);
    fireEvent.click(row("report")!);

    expect(pushes()).toBe(1);
    expect(here()).toBe("/ru/listing/100001/actions?step=report");
    expect(haptics()).toEqual([LIGHT]);
  });

  it.each(REPORT_DETAILS)("the detail row %s sends wrong_data with its code at once", async (code) => {
    window.history.replaceState(null, "", "/ru/listing/100001/actions?step=detail");
    state.reportListing.mockResolvedValueOnce(reported(false));
    route();
    await screen.findByRole("dialog", { name: "Что именно неверно?" });

    fireEvent.click(row(code)!);
    await act(async () => {});

    expect(state.reportListing.mock.calls).toEqual([[{ number: 100001, reason: "wrong_data", detail: code }, undefined, "ru"]]);
    expect(state.closeActions.mock.calls).toEqual([[100001, "detail"]]);
  });

  it.each(["rented", "agent", "fraud"] as const)("%s from the report step sends no detail", async (reason) => {
    window.history.replaceState(null, "", "/ru/listing/100001/actions?step=report");
    state.reportListing.mockResolvedValueOnce(reported(false));
    route();
    await screen.findByRole("dialog", { name: "Что не так?" });

    fireEvent.click(row(reason)!);
    await act(async () => {});

    expect(state.reportListing.mock.calls).toEqual([[{ number: 100001, reason }, undefined, "ru"]]);
  });

  it("busy: a second row during the request starts nothing; a failure shows «Не получилось сохранить» inside the sheet", async () => {
    let fail: (result: ActionResult<never>) => void = () => {};
    state.hideListing.mockReturnValueOnce(new Promise((resolve) => (fail = resolve)));
    route();
    await screen.findByRole("dialog");

    fireEvent.click(row("hide")!);
    expect(row("block")?.disabled).toBe(true);
    fireEvent.click(row("block")!);
    expect(state.blockAuthor).not.toHaveBeenCalled();

    await act(async () => fail(FAILED));

    expect(document.querySelector('[role="dialog"] [data-toast-host="sheet"] [data-toast]')?.textContent).toBe("Не получилось сохранить");
    expect(row("block")?.disabled).toBe(false);
    expect(step()).toBe("menu");
  });

  it("the author and is_owner come from the listing's resource; before the details, the generic hint and the preview's owner flag", async () => {
    route();
    await screen.findByRole("dialog");
    expect(hintOf("block")?.textContent).toBe(PHONE_HINT);
    expect(rows()).toEqual(["hide", "block", "report", "support"]);
    cleanup();
    resetResources();

    setPreview(100001, previewOf({ is_owner: false }));
    window.history.replaceState(null, "", "/ru/listing/100001/actions?step=report");
    route(null);
    await screen.findByRole("dialog");
    expect(rows()).toEqual(["rented", "wrong_data", "fraud"]);
  });

  it("an unknown step value shows the menu", async () => {
    window.history.replaceState(null, "", "/ru/listing/100001/actions?step=other");
    route();
    await screen.findByRole("dialog", { name: "Объявление" });
    expect(step()).toBe("menu");
    expect(chevron()).toBeNull();
  });

  it("renders nothing for a layer without a valid number", () => {
    render(
      withIntl(
        <ListingLayerContext value={{ number: null, scrollToTop: () => {}, reportView: () => {}, view: null }}>
          <ListingActionsRoute />
        </ListingLayerContext>,
      ),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
