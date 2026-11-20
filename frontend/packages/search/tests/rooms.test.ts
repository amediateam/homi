import { describe, expect, it } from "vitest";

import { defaultFilters } from "../src/defaults";
import { isRoomPicked, pickRooms, ROOM_OPTIONS } from "../src/rooms";
import type { SearchFilters } from "../src/types";

const rooms = (f: SearchFilters) => [f.rooms_min, f.rooms_max];
const tap = (...values: (number | null)[]) => values.reduce((f, value) => pickRooms(f, value), defaultFilters());

describe("pickRooms", () => {
  it("BR-APP-007 one tap picks one value", () => {
    expect(rooms(tap(2))).toEqual([2, 2]);
  });

  it("BR-APP-007 a second different value makes a range: 1 → 3 gives 1–3", () => {
    expect(rooms(tap(1, 3))).toEqual([1, 3]);
    expect(rooms(tap(3, 1))).toEqual([1, 3]);
  });

  it("BR-APP-007 4 means 4 or more: 4 alone, and 4 → 2 gives 2–4+", () => {
    expect(rooms(tap(4))).toEqual([4, null]);
    expect(rooms(tap(4, 2))).toEqual([2, null]);
    expect(rooms(tap(2, 4))).toEqual([2, null]);
  });

  it("BR-APP-007 the same value again stays: 2 → 2 gives 2", () => {
    expect(rooms(tap(2, 2))).toEqual([2, 2]);
    expect(rooms(tap(4, 4))).toEqual([4, null]);
  });

  it("BR-APP-007 a tap while a range is picked starts over with one value", () => {
    expect(rooms(tap(1, 3, 2))).toEqual([2, 2]);
    expect(rooms(tap(2, 4, 1))).toEqual([1, 1]);
  });

  it("BR-APP-007 null clears", () => {
    expect(rooms(tap(1, 3, null))).toEqual([null, null]);
  });

  it("BR-APP-007 keeps every other filter", () => {
    const before = { ...defaultFilters(), near_metro: true, price_max: 600 };
    expect(pickRooms(before, 2)).toEqual({ ...before, rooms_min: 2, rooms_max: 2 });
  });
});

describe("isRoomPicked", () => {
  it("BR-APP-007 marks the values inside the picked range, 4+ open-ended", () => {
    const range = tap(2, 4);
    expect(ROOM_OPTIONS.filter((value) => isRoomPicked(range, value))).toEqual([2, 3, 4]);
    expect(ROOM_OPTIONS.filter((value) => isRoomPicked(tap(1, 3), value))).toEqual([1, 2, 3]);
    expect(ROOM_OPTIONS.filter((value) => isRoomPicked(defaultFilters(), value))).toEqual([]);
  });

  it("BR-APP-007 only an upper bound («до 2», a radar's filters) counts from 1", () => {
    const upTo = (rooms_max: number) => ({ rooms_min: null, rooms_max });
    expect(ROOM_OPTIONS.filter((value) => isRoomPicked(upTo(2), value))).toEqual([1, 2]);
    expect(ROOM_OPTIONS.filter((value) => isRoomPicked(upTo(1), value))).toEqual([1]);
    expect(ROOM_OPTIONS.filter((value) => isRoomPicked({ rooms_min: null, rooms_max: null }, value))).toEqual([]);
  });
});
