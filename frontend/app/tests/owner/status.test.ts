import { describe, expect, it } from "vitest";

import { normalizeOwnerListing, type OwnerListingView } from "@/features/owner/normalize";
import { actionsOf, daysListed, firstPending, isPast, manageable, mineRowValue, splitLists, statusLabel } from "@/features/owner/status";

const ID = "01JF0000000000000000000003";

function listing(fields: Record<string, unknown> = {}, stats: Record<string, unknown> | null = null): OwnerListingView {
  return normalizeOwnerListing({ id: ID, status: "active", withdrawn: false, held: false, published_at: "2026-11-20T10:00:00Z", form: {}, photos: [], stats, ...fields })!;
}

/** 2026-11-21 12:00 in Tashkent (07:00 UTC). */
const NOW = Date.parse("2026-11-21T07:00:00Z");

describe("daysListed (Asia/Tashkent, fix of LB-APP-062)", () => {
  it("counts calendar days in Tashkent, 0 on the day of publication", () => {
    expect(daysListed("2026-11-21T01:00:00Z", NOW)).toBe(0);
    // 20 Nov 23:30 Tashkent = 18:30 UTC: a day before by the calendar, though less than 24 h ago.
    expect(daysListed("2026-11-20T18:30:00Z", NOW)).toBe(1);
    // 20 Nov 19:30 UTC is already 21 Nov 00:30 in Tashkent.
    expect(daysListed("2026-11-20T19:30:00Z", NOW)).toBe(0);
    expect(daysListed("2026-11-11T07:00:00Z", NOW)).toBe(10);
  });

  it("is null without a valid time; a future time reads 0", () => {
    expect(daysListed(null, NOW)).toBeNull();
    expect(daysListed("yesterday", NOW)).toBeNull();
    expect(daysListed("2026-12-01T00:00:00Z", NOW)).toBe(0);
  });
});

describe("statusLabel (BR-APP-094)", () => {
  it.each([
    [{ status: "active", published_at: "2026-11-21T02:00:00Z" }, { key: "own.status.activeToday" }],
    [{ status: "active", published_at: "2026-11-16T02:00:00Z" }, { key: "own.status.active", values: { days: 5 } }],
    [{ status: "active", published_at: null }, { key: "own.status.activeToday" }],
    [{ status: "paused" }, { key: "own.status.paused" }],
    [{ status: "draft" }, { key: "own.status.draft" }],
    [{ status: "rented" }, { key: "own.status.rented" }],
    [{ status: "removed" }, { key: "own.status.removed" }],
    [{ status: "rejected" }, { key: "own.status.rejected" }],
    [{ status: "archived" }, { key: "fallback.other" }],
    // Withdrawn and held win over the status; the hold reason is never shown (default 26).
    [{ status: "paused", withdrawn: true }, { key: "own.status.withdrawn" }],
    [{ status: "paused", held: true, hold_reason: "votes_agent" }, { key: "own.review.title" }],
  ])("%j → %j", (fields, label) => {
    expect(statusLabel(listing(fields), NOW)).toEqual(label);
  });
});

describe("the split and the manageable rule (BR-APP-095, DEC-73)", () => {
  it("«История» holds rented, removed and every withdrawn listing; «Актуальные» the rest, drafts and held included", () => {
    const items = [
      listing({ id: "a", status: "draft" }),
      listing({ id: "b", status: "active" }),
      listing({ id: "c", status: "paused", held: true }),
      listing({ id: "d", status: "rejected" }),
      listing({ id: "e", status: "rented" }),
      listing({ id: "f", status: "removed" }),
      listing({ id: "g", status: "active", withdrawn: true }),
    ];
    const { current, past } = splitLists(items);
    expect(current.map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
    expect(past.map((item) => item.id)).toEqual(["e", "f", "g"]);
    expect(items.map(isPast)).toEqual([false, false, false, false, true, true, true]);
  });

  it("only an active or paused listing that is neither withdrawn nor held is manageable", () => {
    expect(manageable(listing({ status: "active" }))).toBe(true);
    expect(manageable(listing({ status: "paused" }))).toBe(true);
    expect(manageable(listing({ status: "paused", held: true }))).toBe(false);
    expect(manageable(listing({ status: "active", withdrawn: true }))).toBe(false);
    expect(manageable(listing({ status: "draft" }))).toBe(false);
  });
});

describe("actionsOf × the cabinet switch (BR-APP-088, DEC-73, DEC-81, DEV-056)", () => {
  const withRequests = { requests: 3, pending: 0 };
  // [listing, stats, card with the cabinet on, panel on, card off, panel off]
  it.each([
    ["draft", { status: "draft" }, null, ["delete", "continue"], ["delete", "continue"], ["delete"], ["delete"]],
    ["active", { status: "active" }, null, ["requests", "pause", "rented"], ["requests", "edit", "pause", "rented", "remove"], ["requests", "pause", "rented"], ["requests", "pause", "rented", "remove"]],
    ["paused", { status: "paused" }, null, ["requests", "resume", "rented"], ["requests", "edit", "resume", "rented", "remove"], ["requests", "rented"], ["requests", "rented", "remove"]],
    ["held, no requests", { status: "paused", held: true }, null, ["support"], ["support"], ["support"], ["support"]],
    ["held with requests", { status: "paused", held: true }, withRequests, ["requests", "support"], ["support"], ["requests", "support"], ["support"]],
    ["withdrawn with requests", { status: "active", withdrawn: true }, withRequests, ["requests", "support"], ["support"], ["requests", "support"], ["support"]],
    ["rejected", { status: "rejected" }, null, ["support", "delete"], ["support", "delete"], ["support", "delete"], ["support", "delete"]],
    ["rented, no requests", { status: "rented" }, null, [], ["again"], [], []],
    ["rented with requests", { status: "rented" }, withRequests, ["requests"], ["requests", "again"], ["requests"], ["requests"]],
    ["removed", { status: "removed" }, withRequests, ["requests"], ["requests", "again"], ["requests"], ["requests"]],
    ["unknown", { status: "archived" }, null, [], ["again"], [], []],
  ] as const)("%s", (_name, fields, stats, cardOn, panelOn, cardOff, panelOff) => {
    const item = listing(fields, stats);
    expect(actionsOf(item, "card", { cabinetOn: true })).toEqual(cardOn);
    expect(actionsOf(item, "panel", { cabinetOn: true })).toEqual(panelOn);
    expect(actionsOf(item, "card", { cabinetOn: false })).toEqual(cardOff);
    expect(actionsOf(item, "panel", { cabinetOn: false })).toEqual(panelOff);
  });
});

describe("mineRowValue (SCR-032) and firstPending", () => {
  const draft = listing({ id: "d", status: "draft" });
  const active = listing({ id: "a", status: "active" }, { pending: 2, requests: 2 });
  const held = listing({ id: "h", status: "paused", held: true });

  it("is the pending count first, then the running listings, then «Черновик», else nothing", () => {
    expect(mineRowValue([draft, active], 2)).toEqual({ key: "own.pendingShort", values: { n: 2 } });
    expect(mineRowValue([draft, active, held], 0)).toEqual({ count: 1 });
    expect(mineRowValue([draft, held], 0)).toEqual({ key: "own.draftShort" });
    expect(mineRowValue([held], 0)).toBeNull();
    expect(mineRowValue([], 0)).toBeNull();
  });

  it("finds the first listing with requests waiting", () => {
    expect(firstPending([draft, held, active])?.id).toBe("a");
    expect(firstPending([draft, held])).toBeNull();
  });
});
