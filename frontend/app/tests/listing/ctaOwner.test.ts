import { describe, expect, it } from "vitest";

import { requestOutcome } from "@/features/listing/contact/requestErrors";
import { ctaActionOf } from "@/features/listing/cta/ListingCtaBar";
import { isRequestMode, ownerCtaOf } from "@/features/listing/cta/owner";
import type { ListingDetails } from "@/features/listing/listingData";

const card = (contact: Record<string, unknown>) =>
  ({ number: 10000001, contact: { has_phone: false, contact_url: null, contact_paid: false, mode: null, request: null, ...contact }, original: { deleted: false, url: "https://t.me/x/1" } }) as unknown as ListingDetails;
const request = (status: string) => ({ status, sent_at: null });

describe("the owner bar (WP-83, BR-APP-098, DEV-060, DEC-74, DEC-75)", () => {
  it.each([
    ["hidden", card({ mode: "hidden" }), "hidden"],
    ["request mode, no request", card({ mode: "request" }), "request"],
    ["pending", card({ mode: "request", request: request("pending") }), "requestSent"],
    ["given", card({ mode: "request", request: request("given") }), "given"],
    ["expired asks once more", card({ mode: "request", request: request("expired") }), "request"],
    ["declined", card({ mode: "request", request: request("declined") }), "closed"],
    ["agent reaches the seeker as declined", card({ mode: "request", request: request("agent") }), "closed"],
    ["cancelled", card({ mode: "request", request: request("cancelled") }), "closed"],
    ["an unknown status", card({ mode: "request", request: request("archived") }), "request"],
    ["phone mode keeps WP-26's order", card({ mode: "phone", has_phone: true }), "call"],
    ["no mode, a post", card({}), "openPost"],
  ])("%s", (_name, details, action) => {
    expect(ctaActionOf(details)).toBe(action);
  });

  it("the expired note, the closed kinds and the predicate", () => {
    expect(ownerCtaOf(card({ mode: "request", request: request("expired") }))).toEqual({ action: "request", note: "expired" });
    expect(ownerCtaOf(card({ mode: "request", request: request("cancelled") }))).toEqual({ action: "closed", closed: "cancelled" });
    expect(isRequestMode(card({ mode: "request" }))).toBe(true);
    expect(isRequestMode(card({ mode: "phone" }))).toBe(false);
  });

  it("closed in this launch (DEC-85): a card still offering a request shows the closed bar", () => {
    expect(ctaActionOf(card({ mode: "request" }), { closedHere: true })).toBe("closed");
    expect(ctaActionOf(card({ mode: "request", request: request("expired") }), { closedHere: true })).toBe("closed");
    expect(ctaActionOf(card({ mode: "request", request: request("given") }), { closedHere: true })).toBe("given");
  });
});

describe("requestOutcome (SCR-061)", () => {
  const limits = { day: 10, week: 30, pauseMinutes: 15 };
  const failure = (code: string, reason?: string) => ({ ok: false as const, error: "conflict" as const, status: 409, code, method: "POST", path: "p", ...(reason === undefined ? {} : { detail: { status: 429, reason } }) });

  it("maps every refusal to its line and effect", () => {
    expect(requestOutcome(failure("no_chat"), limits)).toMatchObject({ line: { key: "contact.err.noChat" }, reread: false, close: false });
    expect(requestOutcome(failure("rate_limited", "requests_fast"), limits).line).toEqual({ key: "contact.err.requestsFast", values: { minutes: 15 } });
    expect(requestOutcome(failure("rate_limited", "requests_day"), limits).line).toEqual({ key: "contact.err.requestsDay", values: { day: 10 } });
    expect(requestOutcome(failure("rate_limited", "requests_week"), limits).line).toEqual({ key: "contact.err.requestsWeek", values: { week: 30 } });
    expect(requestOutcome(failure("requests_blocked"), limits).line).toEqual({ key: "contact.err.blocked" });
    expect(requestOutcome(failure("request_closed"), limits)).toEqual({ line: { key: "contact.err.closed" }, reread: true, close: false, closeHere: true });
    expect(requestOutcome(failure("own_listing"), limits)).toEqual({ line: null, reread: true, close: true, closeHere: false });
    expect(requestOutcome(failure("contact_open"), limits)).toEqual({ line: null, reread: true, close: true, closeHere: false });
    expect(requestOutcome(failure("server_error"), limits).line).toEqual({ key: "common.saveFailed" });
  });
});
