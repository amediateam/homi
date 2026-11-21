import { describe, expect, it } from "vitest";

import {
  couple,
  defaultsFor,
  fieldsOfError,
  floorAboveFloors,
  inUzbekistanBox,
  missingParts,
  parseArea,
  parseFloor,
} from "@/features/owner/form/rules";
import { normalizeForm } from "@/features/owner/normalize";

const PHOTO = { id: "01JF0000000000000000000101", url: "https://cdn.test/1.jpg" };
const COMPLETE = normalizeForm({ city: "tashkent", district_code: "yunusobod", rooms: 2, price: 600, currency: "USD" });

describe("owner form rules (WP-81, SCR-052)", () => {
  it("checks a point against the rectangle of Uzbekistan", () => {
    expect(inUzbekistanBox(41.31, 69.24)).toBe(true);
    expect(inUzbekistanBox(37, 55)).toBe(true);
    expect(inUzbekistanBox(46.01, 69)).toBe(false);
    expect(inUzbekistanBox(41, 74.5)).toBe(false);
    expect(inUzbekistanBox(55.75, 37.62)).toBe(false);
  });

  it("parses «Площадь» with a point or a comma, one decimal kept, above 0", () => {
    expect(parseArea("45,5")).toBe(45.5);
    expect(parseArea("54")).toBe(54);
    expect(parseArea(" 33.25 ")).toBe(33.3);
    for (const text of ["", "0", "0,0", "abc", "4,5,6", "-3", "1e3"]) {
      expect(parseArea(text), text).toBeNull();
    }
  });

  it("parses «Этаж» as a number or «a/b», which also gives the floors", () => {
    expect(parseFloor("4")).toEqual({ floor: 4, floors: null });
    expect(parseFloor("5/9")).toEqual({ floor: 5, floors: 9 });
    expect(parseFloor(" 5 / 9 ")).toEqual({ floor: 5, floors: 9 });
    expect(parseFloor("0")).toEqual({ floor: 0, floors: null });
    expect(parseFloor("-1")).toEqual({ floor: -1, floors: null });
    for (const text of ["", "a", "5/0", "5/", "/9", "1.5", "1234"]) {
      expect(parseFloor(text), text).toBeNull();
    }
  });

  it("knows a floor above the floors", () => {
    expect(floorAboveFloors({ floor: 10, floors_total: 9 })).toBe(true);
    expect(floorAboveFloors({ floor: 9, floors_total: 9 })).toBe(false);
    expect(floorAboveFloors({ floor: null, floors_total: 9 })).toBe(false);
  });

  it("couples: a price sets its currency, room and rooms exclude each other, another city clears district and point", () => {
    const form = normalizeForm({ city: "tashkent", district_code: "yunusobod", lat: 41.3, lon: 69.2, rooms: 2, currency: "UZS" });
    expect(couple(form, { price: 5_000_000 })).toEqual({ price: 5_000_000, currency: "UZS" });
    expect(couple(form, { room: true })).toEqual({ room: true, rooms: null });
    expect(couple(form, { rooms: 3 })).toEqual({ rooms: 3, room: false });
    expect(couple(form, { city: "samarkand" })).toEqual({ city: "samarkand", district_code: null, lat: null, lon: null });
    expect(couple(form, { city: "tashkent" })).toEqual({ city: "tashkent" });
    // DEV-058: clearing the address text keeps the point.
    expect(couple(form, { landmark: null })).toEqual({ landmark: null });
  });

  it("a draft without a city takes the profile's", () => {
    expect(defaultsFor(normalizeForm({}), "tashkent")).toEqual({ city: "tashkent" });
    expect(defaultsFor(normalizeForm({ city: "bukhara" }), "tashkent")).toEqual({});
    expect(defaultsFor(normalizeForm({}), null)).toEqual({});
  });

  it("names the missing parts in their order; a district, a landmark or a point is a place; «Комната» counts as rooms", () => {
    expect(missingParts(normalizeForm({}), [])).toEqual(["city", "place", "rooms", "price", "photos"]);
    expect(missingParts(COMPLETE, [PHOTO])).toEqual([]);
    expect(missingParts({ ...COMPLETE, district_code: null, landmark: "Мегапланет" }, [PHOTO])).toEqual([]);
    expect(missingParts({ ...COMPLETE, district_code: null, lat: 41.3, lon: 69.2 }, [PHOTO])).toEqual([]);
    expect(missingParts({ ...COMPLETE, district_code: null, lat: 41.3 }, [PHOTO])).toEqual(["place"]);
    expect(missingParts({ ...COMPLETE, rooms: null, room: true }, [PHOTO])).toEqual([]);
    expect(missingParts(COMPLETE, [])).toEqual(["photos"]);
  });

  it("maps a 422 key to the fields it highlights", () => {
    expect(fieldsOfError("floor")).toEqual(["floor", "floors_total"]);
    expect(fieldsOfError("point")).toEqual(["lat", "lon"]);
    expect(fieldsOfError("price")).toEqual(["price"]);
  });
});
