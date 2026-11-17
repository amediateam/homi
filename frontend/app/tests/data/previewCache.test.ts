import { afterEach, describe, expect, it } from "vitest";

import { getPreview, resetPreviews, setPreview } from "@/lib/data/previewCache";

import { previewOf } from "../helpers/listing";

afterEach(() => resetPreviews());

describe("previewCache (WP-24)", () => {
  it("returns the card stored for a number, null for another", () => {
    const card = previewOf({ number: 7 });
    setPreview(7, card);

    expect(getPreview(7)).toBe(card);
    expect(getPreview(8)).toBeNull();
  });

  it("keeps the last 200 cards; storing a number again makes it the newest", () => {
    for (let number = 1; number <= 200; number += 1) {
      setPreview(number, previewOf({ number }));
    }
    const fresh = previewOf({ number: 1, title: "fresh" });
    setPreview(1, fresh);
    setPreview(201, previewOf({ number: 201 }));

    expect(getPreview(1)).toBe(fresh);
    expect(getPreview(2)).toBeNull();
    expect(getPreview(3)?.number).toBe(3);
    expect(getPreview(201)?.number).toBe(201);
  });
});
