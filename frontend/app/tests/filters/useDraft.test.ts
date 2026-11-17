import { defaultFilters, normalizeFilters, resetAll, type SearchFilters } from "@homi/search";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useDraft } from "@/features/filters/useDraft";

afterEach(cleanup);

const SAMARKAND: SearchFilters = { ...defaultFilters("sale", "samarkand"), price_max: 90_000, near_metro: true };

const draftOf = (initial: SearchFilters = SAMARKAND) => renderHook(() => useDraft(initial));

describe("useDraft (WP-25)", () => {
  it("starts from the initial filters, normalised, with no relax option taken", () => {
    const { result } = draftOf({ ...SAMARKAND, furnished: undefined } as unknown as SearchFilters);

    expect(result.current.draft).toEqual(normalizeFilters(SAMARKAND));
    expect(result.current.draft.furnished).toBeNull();
    expect(result.current.relaxed).toBeNull();
  });

  it("update merges the patch and normalises the result, so no key is ever undefined (LB-APP-007)", () => {
    const { result } = draftOf();

    act(() => result.current.update({ rooms_min: 2, pets_only: true, pets: true }));
    expect(result.current.draft).toMatchObject({ city: "samarkand", deal: "sale", price_max: 90_000, rooms_min: 2, pets_only: true, pets: false });

    act(() => result.current.update({ below_median: undefined, types: ["land", "room"] } as unknown as Partial<SearchFilters>));
    expect(result.current.draft.below_median).toBe(false);
    expect(result.current.draft.types).toEqual(["land"]);
    expect(Object.values(result.current.draft)).not.toContain(undefined);
  });

  it("two updates of one tick both land", () => {
    const { result } = draftOf();

    act(() => {
      result.current.update({ rooms_min: 1 });
      result.current.update({ rooms_max: 3 });
    });

    expect(result.current.draft).toMatchObject({ rooms_min: 1, rooms_max: 3 });
  });

  it("replace takes a relax option's filters, re-normalised: unknown keys dropped, the draft's city kept when it has none", () => {
    const { result } = draftOf();
    const option = { deal: "sale", types: ["apartment"], price_max: "120000", hacked: "<b>x</b>", owner: "root" };

    act(() => {
      result.current.replace(option);
      result.current.setRelaxed("price_up");
    });

    expect(result.current.draft).toEqual({ ...defaultFilters("sale", "samarkand"), price_max: 120_000 });
    expect(result.current.draft).not.toHaveProperty("hacked");
    expect(result.current.relaxed).toBe("price_up");

    act(() => result.current.replace({ ...option, city: "bukhara" }));
    expect(result.current.draft.city).toBe("bukhara");
  });

  it("the relax option taken survives «Сбросить» (a replace) and is cleared only by setRelaxed", () => {
    const { result } = draftOf();

    act(() => result.current.setRelaxed("rooms_any"));
    act(() => result.current.replace(resetAll(result.current.draft)));

    expect(result.current.draft).toEqual(defaultFilters("sale", "samarkand"));
    expect(result.current.relaxed).toBe("rooms_any");

    act(() => result.current.setRelaxed(null));
    expect(result.current.relaxed).toBeNull();
  });

  it("a new initial value does not reset the draft: a fresh open remounts the form instead", () => {
    const { result, rerender } = renderHook((initial: SearchFilters) => useDraft(initial), { initialProps: SAMARKAND });

    act(() => result.current.update({ rooms_min: 4 }));
    rerender(defaultFilters());

    expect(result.current.draft).toMatchObject({ city: "samarkand", rooms_min: 4 });
  });

  it("update and replace keep their identity across renders", () => {
    const { result, rerender } = draftOf();
    const { update, replace } = result.current;

    act(() => update({ rooms_min: 2 }));
    rerender();

    expect(result.current.update).toBe(update);
    expect(result.current.replace).toBe(replace);
  });
});
