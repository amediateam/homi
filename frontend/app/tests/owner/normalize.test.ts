import { describe, expect, it } from "vitest";

import { normalizeForm, normalizeOwnerListing } from "@/features/owner/normalize";

const LISTING = {
  id: "01JF0000000000000000000003",
  number: 10000008,
  status: "active",
  withdrawn: false,
  held: false,
  hold_reason: null,
  published_at: "2026-11-18T09:00:00+05:00",
  photos: [
    { id: "01JF0000000000000000000101", url: "https://cdn.test/1.jpg" },
    { id: "01JF0000000000000000000102", url: "https://cdn.test/2.jpg" },
  ],
  form: {
    city: "tashkent",
    district_code: "yunusobod",
    landmark: "Мегапланет",
    lat: 41.36512,
    lon: 69.28431,
    room: false,
    rooms: 2,
    area_m2: 54,
    floor: 4,
    floors_total: 9,
    price: 600,
    currency: "USD",
    renovation: "euro",
    furniture: true,
    tenants: ["family"],
    pets: false,
    description: "Светлая",
  },
  stats: {},
  contact_mode: "request",
  phone_set: true,
  phone_display: "+998 90 *** ** 67",
  phone_error: null,
  reject_reason: null,
  shown_point: { lat: 41.36671, lon: 69.28602, radius_m: 500 },
};

describe("normalizeOwnerListing (WP-81, LB-APP-064)", () => {
  it("reads every field of the WP-80 listing", () => {
    expect(normalizeOwnerListing(LISTING)).toEqual({
      id: LISTING.id,
      number: 10000008,
      status: "active",
      held: false,
      withdrawn: false,
      holdReason: null,
      publishedAt: LISTING.published_at,
      photos: LISTING.photos,
      form: LISTING.form,
      contactMode: "request",
      phoneSet: true,
      phoneDisplay: "+998 90 *** ** 67",
      phoneError: null,
      rejectReason: null,
      shownPoint: LISTING.shown_point,
      locked: false,
    });
  });

  it("reads an unknown status as unknown, an unknown reason or error as null, a rejected listing's unknown reason as denied", () => {
    expect(normalizeOwnerListing({ ...LISTING, status: "archived", contact_mode: "fax", phone_error: "busy" })).toMatchObject({
      status: "unknown",
      contactMode: null,
      phoneError: null,
    });
    expect(normalizeOwnerListing({ ...LISTING, status: "rejected", reject_reason: "agent" })?.rejectReason).toBe("denied");
    expect(normalizeOwnerListing({ ...LISTING, status: "rejected", reject_reason: "limit" })?.rejectReason).toBe("limit");
  });

  it("is locked when held, withdrawn, let or removed, as the server's locked() says", () => {
    expect(normalizeOwnerListing({ ...LISTING, held: true })?.locked).toBe(true);
    expect(normalizeOwnerListing({ ...LISTING, withdrawn: true })?.locked).toBe(true);
    expect(normalizeOwnerListing({ ...LISTING, status: "rented" })?.locked).toBe(true);
    expect(normalizeOwnerListing({ ...LISTING, status: "removed" })?.locked).toBe(true);
    expect(normalizeOwnerListing({ ...LISTING, status: "paused" })?.locked).toBe(false);
  });

  it("never throws: without an id it is null; fields of the wrong type read as null or neutral", () => {
    for (const value of [null, undefined, 42, "x", [], {}, { id: "" }]) {
      expect(normalizeOwnerListing(value)).toBeNull();
    }
    const odd = normalizeOwnerListing({ id: "x", number: "10000008", photos: [{ id: 1 }, "x", { id: "p", url: "u" }], shown_point: { lat: 1 }, form: "?" });
    expect(odd).toMatchObject({ number: null, photos: [{ id: "p", url: "u" }], shownPoint: null, status: "unknown", locked: false });
    expect(odd?.form).toEqual(normalizeForm(undefined));
  });
});

describe("normalizeForm", () => {
  it("defaults the empty form: a flat, dollars, no tenants", () => {
    expect(normalizeForm({})).toMatchObject({ room: false, currency: "USD", tenants: [], rooms: null, price: null });
  });

  it("keeps known tenants once each, and reads an unknown currency or renovation as the default or null", () => {
    expect(normalizeForm({ tenants: ["family", "cats", "family", "girls"], currency: "EUR", renovation: "luxury" })).toMatchObject({
      tenants: ["family", "girls"],
      currency: "USD",
      renovation: null,
    });
  });
});
