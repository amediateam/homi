import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/actions/run";

const state = vi.hoisted(() => ({
  answer: vi.fn<(input: unknown) => Promise<ActionResult<unknown>>>(),
  toast: vi.fn(),
  report: vi.fn(),
  refresh: vi.fn(async () => undefined),
  pages: [] as { items: unknown[]; next: string | null }[],
  reads: [] as string[],
  failFirst: false,
}));

vi.mock("@/lib/session/bootstrap", () => ({ refresh: state.refresh, reauthenticate: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: async (path: string, options: { query?: Record<string, unknown> } = {}) => {
    const cursor = typeof options.query?.cursor === "string" ? options.query.cursor : null;
    state.reads.push(`${path}${cursor === null ? "" : `?cursor=${cursor}`}`);
    if (state.failFirst) {
      return { ok: false, error: "server", status: 500, method: "GET", path };
    }
    const page = cursor === null ? state.pages[0]! : state.pages[Number(cursor)]!;
    return { ok: true, data: page.items, meta: { source: "stub", next_cursor: page.next } };
  },
}));
vi.mock("@/lib/actions/owner", () => ({ answerRequest: (input: unknown) => state.answer(input) }));
vi.mock("@/lib/actions/useAction", () => ({ useAction: (action: (input: unknown) => unknown) => (input: unknown) => action(input) }));
vi.mock("@/lib/ui/toast", () => ({ showToast: state.toast }));
vi.mock("@/lib/errors/report", () => ({ reportError: state.report }));

import { RequestList } from "@/features/owner/requests/RequestList";
import { resetChosenReasons } from "@/features/owner/requests/useAnswer";
import { requestTipDone } from "@/features/owner/signals/requestTip";
import { resetResources } from "@/lib/data/useResource";

import { withIntl } from "../settings/harness";

const LISTING = "01JF0000000000000000000003";
const rid = (n: number) => `01JF0000000000000000000${200 + n}`;
const request = (n: number, fields: Record<string, unknown> = {}) => ({
  id: rid(n),
  name: "Азиз",
  who: "couple",
  people: 2,
  move_in: "с 1 декабря",
  message: "Можно в субботу?",
  status: "pending",
  agent_marked: false,
  can_reason: false,
  can_undo: false,
  can_late: false,
  ...fields,
});
const ok = (data: unknown): ActionResult<unknown> => ({ ok: true, data, meta: { source: "stub" } });

let fake: FakeTelegram | null = null;
const card = (n: number) => document.querySelector<HTMLElement>(`[data-request="${rid(n)}"]`);
const button = (n: number, action: string) => card(n)?.querySelector<HTMLButtonElement>(`[data-action="${action}"]`) ?? null;

async function mount() {
  render(withIntl(<RequestList listingId={LISTING} />));
  await act(async () => undefined);
  await act(async () => undefined);
}

beforeEach(() => {
  for (const mock of [state.answer, state.toast, state.report, state.refresh]) {
    mock.mockReset();
  }
  state.reads = [];
  state.failFirst = false;
  state.pages = [{ items: [request(1), request(3, { status: "declined", who: "one", people: 1, can_reason: true, can_undo: true }), request(4, { status: "given", who: "students", can_late: true, name: null })], next: null }];
  resetResources();
  resetChosenReasons();
  window.localStorage.clear();
  fake = fakeTelegram({ version: "8.0" });
});

afterEach(() => {
  cleanup();
  fake?.uninstall();
  fake = null;
});

describe("«Отклики» (WP-82, SCR-058, BR-APP-090)", () => {
  it("draws each request: the name or «Без имени», who · people · move-in, the message, all masked", async () => {
    await mount();
    expect(card(1)?.textContent).toContain("Азиз");
    expect(card(1)?.textContent).toContain("Пара · 2 чел. · въезд: с 1 декабря");
    expect(card(1)?.textContent).toContain("«Можно в субботу?»");
    expect(card(3)?.textContent).toContain("Один · въезд");
    expect(card(4)?.textContent).toContain("Без имени");
    expect(card(1)?.querySelectorAll(".ph-mask")).toHaveLength(3);
    expect(document.querySelector("[data-requests-foot]")?.textContent).toMatch(/^Человек видит только ваш ответ/);
  });

  it("opening the page dismisses the request tips for good (BR-APP-092)", async () => {
    expect(requestTipDone()).toBe(false);
    await mount();
    expect(requestTipDone()).toBe(true);
  });

  it("«Дать номер»: the medium haptic, the answer replaces the card keeping the name, the toast, the invalidation", async () => {
    state.answer.mockResolvedValueOnce(ok(request(1, { status: "given", name: null, can_late: true })));
    await mount();
    await act(async () => fireEvent.click(button(1, "give")!));

    expect(state.answer).toHaveBeenCalledWith({ id: rid(1), action: "give" });
    const haptics = (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);
    expect(haptics.slice(0, 2)).toEqual(["HapticFeedback.impactOccurred(medium)", "HapticFeedback.notificationOccurred(success)"]);
    expect(card(1)?.getAttribute("data-request-state")).toBe("given");
    expect(card(1)?.textContent).toContain("Азиз");
    expect(button(1, "late")).not.toBeNull();
    expect(state.toast).toHaveBeenCalledWith({ key: "own.answered.give" });
    expect(state.refresh).toHaveBeenCalled();
  });

  it("the reason question until a reason is chosen; «Уже договорился» leaves its line; the undo row", async () => {
    state.answer.mockResolvedValueOnce(ok(request(3, { status: "declined", who: "one", people: 1, can_reason: false, can_undo: false })));
    await mount();
    expect(card(3)?.querySelector("[data-request-reasons]")).not.toBeNull();
    expect(card(3)?.querySelector("[data-request-undo]")?.textContent).toMatch(/^Передумали/);

    await act(async () => fireEvent.click(button(3, "reason_found")!));
    expect(card(3)?.querySelector("[data-request-reasons]")).toBeNull();
    expect(card(3)?.textContent).toContain("Причина: уже договорились с другим.");
    expect(state.toast).toHaveBeenCalledWith({ key: "own.answered.reason_found" });
  });

  it("«Отменить» on a given request says «Отметку сняли»; a closed undo reads the list again and says it is late", async () => {
    state.pages[0]!.items[2] = request(4, { status: "given", can_undo: true });
    state.answer.mockResolvedValueOnce(ok(request(4, { status: "pending" })));
    await mount();
    await act(async () => fireEvent.click(button(4, "undo")!));
    expect(state.toast).toHaveBeenCalledWith({ key: "own.unmarked" });

    state.answer.mockResolvedValueOnce({ ok: false, error: "conflict", status: 409, code: "request_answer_closed", method: "POST", path: "p" } as never);
    const before = state.reads.length;
    await act(async () => fireEvent.click(button(3, "undo")!));
    expect(state.toast).toHaveBeenLastCalledWith({ key: "own.undoLate" });
    expect(state.reads.length).toBe(before + 1);
  });

  it("a failed answer reaches the error facade by its code only, never the seeker's text", async () => {
    state.answer.mockResolvedValueOnce({ ok: false, error: "server", status: 500, code: "server_error", method: "POST", path: "p" } as never);
    await mount();
    await act(async () => fireEvent.click(button(1, "decline")!));
    expect(state.report).toHaveBeenCalledTimes(1);
    const [error, context] = state.report.mock.calls[0] as [Error, unknown];
    expect(error.message).toBe("owner request answer failed: server_error");
    expect(JSON.stringify([error.message, context])).not.toMatch(/Азиз|субботу|декабря/);
    expect(state.toast).toHaveBeenCalledWith({ key: "common.saveFailed" });
  });

  it("an unknown who reads «Другое»; a later page by the cursor; an empty list; a failed first page", async () => {
    state.pages = [
      { items: [request(1, { who: "colleagues" })], next: "1" },
      { items: [request(1), request(5)], next: null },
    ];
    await mount();
    expect(card(1)?.textContent).toContain("Другое");
    expect(state.reads).toEqual([`owner/listings/${LISTING}/requests`, `owner/listings/${LISTING}/requests?cursor=1`]);
    expect(document.querySelectorAll("[data-request]")).toHaveLength(2);

    cleanup();
    resetResources();
    state.pages = [{ items: [], next: null }];
    await mount();
    expect(document.querySelector('[data-requests-state="empty"]')?.textContent).toBe("Откликов пока нет.");

    cleanup();
    resetResources();
    state.failFirst = true;
    await mount();
    expect(document.body.textContent).toMatch(/Повторить/);
  });
});
