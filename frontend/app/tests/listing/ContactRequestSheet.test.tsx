import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/actions/run";

const state = vi.hoisted(() => ({
  send: vi.fn<(input: unknown) => Promise<ActionResult<unknown>>>(),
  back: vi.fn(),
  report: vi.fn(),
  address: "/listing/10000001/contact",
}));

vi.mock("@/lib/actions/listing", () => ({ sendContactRequest: (input: unknown) => state.send(input) }));
vi.mock("@/lib/actions/useAction", () => ({ useAction: (action: (input: unknown) => unknown) => (input: unknown) => action(input) }));
vi.mock("@/lib/navigation/useBack", () => ({ useBack: () => ({ back: state.back, canGoBack: true }) }));
vi.mock("@/lib/errors/report", () => ({ reportError: state.report }));
vi.mock("@/lib/navigation/address", () => ({ currentAddress: () => state.address }));
vi.mock("@/features/shell/RouteSheet", () => ({
  RouteSheet: ({ title, children, footer }: { title: string; children: React.ReactNode; footer: React.ReactNode }) => (
    <div data-sheet-title={title}>
      {children}
      {footer}
    </div>
  ),
}));

import { ContactRequestSheet } from "@/features/listing/contact/ContactRequestSheet";
import { resetRequestState, useRequestClosedHere } from "@/features/listing/contact/requestState";
import type { ListingDetails } from "@/features/listing/listingData";
import { resetResources } from "@/lib/data/useResource";
import { resetReference } from "@/lib/reference/useReference";

import { feedReference } from "../helpers/reference";
import { withIntl } from "../settings/harness";

const details = (fields: Record<string, unknown> = {}) =>
  ({ number: 10000001, origin: "native", owner: { tier: "self", mine: false, listing_id: null, entry: true, response_minutes: 180, description: null }, contact: { has_phone: false, contact_url: null, contact_paid: false, mode: "request", request: null }, ...fields }) as unknown as ListingDetails;

let fake: FakeTelegram | null = null;
const send = () => document.querySelector<HTMLButtonElement>('[data-action="send-request"]')!;

function Probe() {
  return <span data-closed-here={String(useRequestClosedHere(10000001))} />;
}

function mount(card: ListingDetails = details()) {
  render(
    withIntl(
      <>
        <ContactRequestSheet details={card} presentation="layer" />
        <Probe />
      </>,
    ),
  );
}

beforeEach(() => {
  for (const mock of [state.send, state.back, state.report]) {
    mock.mockReset();
  }
  state.address = "/listing/10000001/contact";
  resetResources();
  resetRequestState();
  feedReference({ reference: { limits: { radars: 5, owner_listings: 2, owner_photos: 10, requests: { day: 12, week: 40, pause_minutes: 15 } } } as never });
  fake = fakeTelegram({ version: "8.0", initData: "query_id=7&hash=x" });
});

afterEach(() => {
  cleanup();
  resetReference();
  fake?.uninstall();
  fake = null;
});

describe("«Отклик хозяину» (WP-83, SCR-061)", () => {
  it("the lead with the usual time, the note with the day's limit, the footer until a who is picked", () => {
    mount();
    expect(document.querySelector("[data-sheet-title]")?.getAttribute("data-sheet-title")).toBe("Отклик хозяину");
    expect(document.body.textContent).toContain("обычно в течение 3 ч.");
    expect(document.querySelector("[data-request-note]")?.textContent).toContain("до 12 откликов в день");
    expect(document.querySelector("[data-request-note]")?.textContent).not.toContain("сервису");
    expect(send().disabled).toBe(true);
    expect(send().textContent).toBe("Выберите, кто будет жить");
    expect((document.querySelector('[data-field="message"]') as HTMLTextAreaElement).value).toBe("Здравствуйте! Можно посмотреть?");
  });

  it("a legacy listing in request mode says the request leaves HOMI (DEC-71)", () => {
    mount(details({ origin: "legacy" }));
    expect(document.querySelector("[data-request-note]")?.textContent).toContain("Отклик передаётся сервису, где размещена квартира.");
  });

  it("a chip sets its count until the stepper is touched; send carries the launch data and closes on success", async () => {
    state.send.mockResolvedValueOnce({ ok: true, data: { status: "pending" }, meta: { source: "stub" } } as never);
    mount();
    fireEvent.click(document.querySelector('[data-who="family"]')!);
    expect(document.querySelector("[data-people]")?.getAttribute("data-people")).toBe("3");
    fireEvent.click(document.querySelector('[data-action="people-more"]')!);
    fireEvent.click(document.querySelector('[data-who="one"]')!);
    expect(document.querySelector("[data-people]")?.getAttribute("data-people")).toBe("4");
    fireEvent.change(document.querySelector('[data-field="move_in"]')!, { target: { value: "  " } });

    await act(async () => fireEvent.click(send()));
    expect(state.send).toHaveBeenCalledWith({ number: 10000001, who: "one", people: 4, move_in: null, message: "Здравствуйте! Можно посмотреть?", init_data: "query_id=7&hash=x" });
    expect(state.back).toHaveBeenCalled();
  });

  it("no_chat asks Telegram for write access and sends once more", async () => {
    state.send
      .mockResolvedValueOnce({ ok: false, error: "conflict", status: 409, code: "no_chat", method: "POST", path: "p" } as never)
      .mockResolvedValueOnce({ ok: true, data: { status: "pending" }, meta: { source: "stub" } } as never);
    fake?.uninstall();
    fake = fakeTelegram({ version: "8.0", initData: "query_id=7&hash=x", answers: { writeAccess: true } as never });
    mount();
    fireEvent.click(document.querySelector('[data-who="couple"]')!);
    await act(async () => fireEvent.click(send()));
    expect(state.send).toHaveBeenCalledTimes(2);
    expect(state.back).toHaveBeenCalled();
  });

  it("a send that answers after the sheet was closed goes Back no more (review)", async () => {
    state.send.mockImplementationOnce(async () => {
      // The seeker closed the sheet while the request was out.
      state.address = "/listing/10000001";
      return { ok: true, data: { status: "pending" }, meta: { source: "stub" } } as never;
    });
    mount();
    fireEvent.click(document.querySelector('[data-who="couple"]')!);
    await act(async () => fireEvent.click(send()));
    expect(state.back).not.toHaveBeenCalled();
  });

  it("request_closed: its line, and the bar stays closed for this number (DEC-85)", async () => {
    state.send.mockResolvedValueOnce({ ok: false, error: "conflict", status: 409, code: "request_closed", method: "POST", path: "p" } as never);
    mount();
    fireEvent.click(document.querySelector('[data-who="couple"]')!);
    await act(async () => fireEvent.click(send()));
    expect(document.querySelector("[data-request-line]")?.textContent).toBe("Хозяин уже не принимает отклики — квартиру, скорее всего, сдали.");
    expect(document.querySelector("[data-closed-here]")?.getAttribute("data-closed-here")).toBe("true");
    expect(state.back).not.toHaveBeenCalled();
  });

  it("contact_open closes the sheet; an unknown failure says «Не получилось сохранить» and reports its code only", async () => {
    state.send.mockResolvedValueOnce({ ok: false, error: "conflict", status: 409, code: "contact_open", method: "POST", path: "p" } as never);
    mount();
    fireEvent.click(document.querySelector('[data-who="couple"]')!);
    await act(async () => fireEvent.click(send()));
    expect(state.back).toHaveBeenCalled();

    cleanup();
    state.send.mockResolvedValueOnce({ ok: false, error: "server", status: 500, code: "server_error", method: "POST", path: "p" } as never);
    mount();
    fireEvent.click(document.querySelector('[data-who="couple"]')!);
    fireEvent.change(document.querySelector('[data-field="message"]')!, { target: { value: "Мой номер 90 123 45 67" } });
    await act(async () => fireEvent.click(send()));
    expect(document.querySelector("[data-request-line]")?.textContent).toBe("Не получилось сохранить");
    expect(JSON.stringify(state.report.mock.calls)).not.toMatch(/90 123|query_id/);
  });
});
