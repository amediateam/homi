import { defaultFilters, normalizeFilters } from "@homi/search";
import { describe, expect, it } from "vitest";

import { normalizeFlow } from "@/features/filters/useLiveStats";
import { normalizeMutation, normalizePatch, normalizeRadar, normalizeRadarList, PREVIEW_ITEMS } from "@/features/radars/normalize";

import { previewOf } from "../helpers/listing";

const ID = "01JD0000000000000000000001";
const FILTERS = { ...defaultFilters(), rooms_min: 2, rooms_max: 2 };

/** A radar as `RadarResource` sends it (WP-13 fixture `radars/list.json`). */
function rawRadar(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: ID, active: true, mode: "instant", hidden: 0, created_at: "2026-11-10T06:00:00+00:00", filters: FILTERS, ...overrides };
}

describe("normalizeRadar (WP-30)", () => {
  it("reads a radar of the contract; without include there is no preview key", () => {
    const radar = normalizeRadar(rawRadar({ mode: "digest", hidden: 3, active: false }));

    expect(radar).toEqual({ id: ID, active: false, mode: "digest", hidden: 3, filters: normalizeFilters(FILTERS), createdAt: "2026-11-10T06:00:00+00:00" });
    expect(radar).not.toHaveProperty("preview");
  });

  it("an unknown or missing mode reads as instant (LB-APP-002)", () => {
    expect(normalizeRadar(rawRadar({ mode: "weekly" }))?.mode).toBe("instant");
    expect(normalizeRadar(rawRadar({ mode: undefined }))?.mode).toBe("instant");
    expect(normalizeRadar(rawRadar({ mode: "DIGEST" }))?.mode).toBe("instant");
  });

  it("filters with a missing key take its default; missing filters are the defaults", () => {
    const partial: Record<string, unknown> = { ...FILTERS, near_metro: true };
    delete partial.rooms_min;
    delete partial.near_metro;

    const radar = normalizeRadar(rawRadar({ filters: partial }));

    expect(radar?.filters.rooms_min).toBeNull();
    expect(radar?.filters.near_metro).toBe(false);
    expect(radar?.filters.rooms_max).toBe(2);
    expect(Object.keys(radar?.filters ?? {})).toHaveLength(25);
    expect(normalizeRadar(rawRadar({ filters: null }))?.filters).toEqual(defaultFilters());
  });

  it("active only for true, hidden a non-negative integer, created_at a string or null", () => {
    expect(normalizeRadar(rawRadar({ active: "true", hidden: -1, created_at: 0 }))).toMatchObject({ active: false, hidden: 0, createdAt: null });
    expect(normalizeRadar(rawRadar({ active: 1, hidden: 1.5, created_at: "" }))).toMatchObject({ active: false, hidden: 0, createdAt: null });
    expect(normalizeRadar(rawRadar({ hidden: "3" }))?.hidden).toBe(0);
  });

  it("is null for anything that is not a radar with a ULID id", () => {
    for (const raw of [undefined, null, "radar", 42, [], {}, rawRadar({ id: "not-a-ulid" }), rawRadar({ id: 1 }), rawRadar({ id: `${ID}0` })]) {
      expect(normalizeRadar(raw), JSON.stringify(raw)).toBeNull();
    }
    expect(normalizeRadar(rawRadar({ id: ID.toLowerCase() }))?.id).toBe(ID.toLowerCase());
  });

  it("preview: copied when the key is there, null when it could not be computed", () => {
    const items = [previewOf({ number: 100001 }), previewOf({ number: 100002 })];

    expect(normalizeRadar(rawRadar({ preview: { items, count: 34, flow: { week: 21, days: 7 } } }))?.preview).toEqual({
      items,
      count: 34,
      flow: { week: 21, days: 7, options: [] },
    });
    expect(normalizeRadar(rawRadar({ preview: null }))?.preview).toBeNull();
    expect(normalizeRadar(rawRadar({ preview: "soon" }))?.preview).toBeNull();
  });

  it("preview: items without a listing number are dropped, at most five kept; a bad count or flow is null", () => {
    const many = Array.from({ length: 7 }, (_, index) => previewOf({ number: 100001 + index }));
    const preview = normalizeRadar(rawRadar({ preview: { items: [null, { number: "100009" }, { number: 0 }, ...many], count: -2, flow: { week: 3, days: 0 } } }))?.preview;

    expect(preview?.items.map((item) => item.number)).toEqual([100001, 100002, 100003, 100004, 100005]);
    expect(PREVIEW_ITEMS).toBe(5);
    expect(preview?.count).toBeNull();
    expect(preview?.flow).toBeNull();
    expect(normalizeRadar(rawRadar({ preview: { items: null, count: "34" } }))?.preview).toEqual({ items: [], count: null, flow: null });
  });
});

describe("normalizeRadarList (WP-30)", () => {
  it("keeps the radars that normalise, in order, each id once; not a list is empty", () => {
    const second = "01JD0000000000000000000002";
    const list = normalizeRadarList([rawRadar(), null, rawRadar({ id: "bad" }), rawRadar({ id: second }), rawRadar({ id: ID.toLowerCase(), mode: "digest" })]);

    expect(list.map((radar) => radar.id)).toEqual([ID, second]);
    expect(list[0].mode).toBe("instant");
    for (const raw of [undefined, null, {}, "[]", { data: [] }]) {
      expect(normalizeRadarList(raw)).toEqual([]);
    }
  });
});

describe("normalizeMutation (WP-30, subscribe flow step 6, LB-APP-005)", () => {
  const created = { radar: rawRadar(), kind: "created", starter: 0, options: [{ code: "price_more", label: "до $700", rate: "≈5 в день", count: 34 }], relaxed: [{ text: "без района" }] };

  it("reads an answer of the contract", () => {
    expect(normalizeMutation(created)).toEqual({
      radar: normalizeRadar(rawRadar()),
      kind: "created",
      starter: 0,
      options: [{ code: "price_more", label: "до $700", rate: "≈5 в день", count: 34 }],
      relaxed: [{ text: "без района" }],
    });
  });

  it("relaxed missing or null, options null: empty arrays", () => {
    const withoutRelaxed: Record<string, unknown> = { ...created };
    delete withoutRelaxed.relaxed;

    expect(normalizeMutation(withoutRelaxed).relaxed).toEqual([]);
    expect(normalizeMutation({ ...created, relaxed: null }).relaxed).toEqual([]);
    expect(normalizeMutation({ ...created, options: null }).options).toEqual([]);
    expect(normalizeMutation({ ...created, options: "price_more" }).options).toEqual([]);
  });

  it("starter as a string reads as its number; anything else not a positive number is 0", () => {
    expect(normalizeMutation({ ...created, starter: "12" }).starter).toBe(12);
    expect(normalizeMutation({ ...created, starter: 3 }).starter).toBe(3);
    expect(normalizeMutation({ ...created, starter: 2.7 }).starter).toBe(2);
    for (const starter of ["many", "", " ", null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -4, {}]) {
      expect(normalizeMutation({ ...created, starter }).starter, String(starter)).toBe(0);
    }
  });

  it("malformed options and relaxed entries are dropped, never the answer", () => {
    const mutation = normalizeMutation({
      ...created,
      options: [
        { code: "price_more", label: "до $700", rate: "≈5 в день", count: "34" },
        { code: "Price-More", label: "x", rate: "y", count: 1 },
        { code: "districts_all", label: "все районы", rate: "≈12 в день" },
        { label: "no code", rate: "x", count: 1 },
        null,
      ],
      relaxed: [{ text: "" }, { text: 5 }, "без района", { text: "дороже" }],
    });

    expect(mutation.options).toEqual([
      { code: "price_more", label: "до $700", rate: "≈5 в день", count: null },
      { code: "districts_all", label: "все районы", rate: "≈12 в день", count: null },
    ]);
    expect(mutation.relaxed).toEqual([{ text: "дороже" }]);
  });

  it("the kinds of the contract are kept; an unknown kind reads as created", () => {
    for (const kind of ["created", "existing", "reactivated", "updated"]) {
      expect(normalizeMutation({ ...created, kind }).kind).toBe(kind);
    }
    expect(normalizeMutation({ ...created, kind: "merged" }).kind).toBe("created");
  });

  it("never throws: anything that is not an answer is an empty created mutation", () => {
    for (const raw of [undefined, null, "ok", 1, [], {}]) {
      expect(normalizeMutation(raw)).toEqual({ radar: null, kind: "created", starter: 0, options: [], relaxed: [] });
    }
  });
});

describe("normalizePatch (WP-30)", () => {
  it("reads the radar, the starter and ask_found", () => {
    expect(normalizePatch({ radar: rawRadar({ active: false }), ask_found: true })).toEqual({
      radar: normalizeRadar(rawRadar({ active: false })),
      starter: 0,
      askFound: true,
    });
    expect(normalizePatch({ radar: rawRadar(), starter: 2 })).toMatchObject({ starter: 2, askFound: false });
  });

  it("ask_found only for true; never throws", () => {
    expect(normalizePatch({ radar: rawRadar(), ask_found: "true" }).askFound).toBe(false);
    expect(normalizePatch(null)).toEqual({ radar: null, starter: 0, askFound: false });
  });
});

describe("normalizeFlow, as the radar previews use it (WP-25)", () => {
  it("is null for undefined, null, {} and days 0; week 0 is a valid flow", () => {
    expect(normalizeFlow(undefined)).toBeNull();
    expect(normalizeFlow(null)).toBeNull();
    expect(normalizeFlow({})).toBeNull();
    expect(normalizeFlow({ week: 4, days: 0 })).toBeNull();
    expect(normalizeFlow({ week: 0, days: 7 })).toEqual({ week: 0, days: 7, options: [] });
  });
});
