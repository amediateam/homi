import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { hide, isFavorite, isHidden, isSeen, markSeen, resetHidden, resetSessionMaps, setFav, unhide, useSessionMap } from "@/lib/data/sessionMaps";

afterEach(() => resetSessionMaps());

/** `03` §1.11: what this launch changed overrides the server's flags until a reload; the server stays the truth. */
describe("session maps (WP-22)", () => {
  it("a favourite toggle overrides the server's flag, either way", () => {
    expect(isFavorite(1, false)).toBe(false);
    setFav(1, true);
    setFav(2, false);

    expect(isFavorite(1, false)).toBe(true);
    expect(isFavorite(2, true)).toBe(false);
    expect(isFavorite(3, true)).toBe(true);
  });

  it("seen marks a listing opened in this launch on top of the server's viewed flag", () => {
    markSeen(5);

    expect(isSeen(5, false)).toBe(true);
    expect(isSeen(6, false)).toBe(false);
    expect(isSeen(6, true)).toBe(true);
  });

  it("hide and unhide take lists; resetHidden forgets every override", () => {
    hide([1, 2, 3]);
    unhide([2]);
    expect([1, 2, 3].map((n) => isHidden(n))).toEqual([true, false, true]);

    resetHidden();
    expect([1, 2, 3].map((n) => isHidden(n))).toEqual([false, false, false]);
  });

  it("useSessionMap re-renders on a change, with a new value only for the changed map", () => {
    const favs = renderHook(() => useSessionMap("favs"));
    const seen = renderHook(() => useSessionMap("seen"));
    const before = seen.result.current;

    act(() => setFav(9, true));

    expect(favs.result.current.get(9)).toBe(true);
    expect(seen.result.current).toBe(before);
  });
});
