import { describe, expect, it } from "vitest";

import { inlineSlotIndex } from "@/features/feed/inlineSlot";

describe("inlineSlotIndex (SCR-047, BR-APP-072)", () => {
  it.each([
    { visible: 20, done: false, noteShown: false, slot: 8, row: "20 visible → after the 8th" },
    { visible: 9, done: true, noteShown: true, slot: 8, row: "9 with the note → after the 8th" },
    { visible: 9, done: false, noteShown: false, slot: 8, row: "9 still loading → after the 8th" },
    { visible: 8, done: true, noteShown: false, slot: 8, row: "8, fully loaded, no note → after the 8th" },
    { visible: 8, done: false, noteShown: false, slot: null, row: "8 still loading → none" },
    { visible: 5, done: true, noteShown: false, slot: 5, row: "5 fully loaded, no note → after the 5th" },
    { visible: 5, done: true, noteShown: true, slot: null, row: "5 with the note → none" },
    { visible: 5, done: false, noteShown: false, slot: null, row: "5 still loading (or failed) → none" },
    { visible: 1, done: true, noteShown: false, slot: 1, row: "1 fully loaded, no note → after the 1st" },
    { visible: 0, done: true, noteShown: false, slot: null, row: "0 → none (the empty state shows instead)" },
  ])("$row", ({ visible, done, noteShown, slot }) => {
    expect(inlineSlotIndex(visible, done, noteShown)).toBe(slot);
  });
});
