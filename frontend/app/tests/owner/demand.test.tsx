import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { demandLine, demandQuery } from "@/features/owner/demand/useDemand";
import { UsualPrice } from "@/features/owner/demand/UsualPrice";
import { normalizeForm } from "@/features/owner/normalize";
import { resetReference } from "@/lib/reference/useReference";

import { cityOf, feedReference } from "../helpers/reference";
import { withIntl } from "../settings/harness";

const DEMAND = { count: null, few: false, usualLowUsd: 550, usualHighUsd: 700 };

beforeEach(() => {
  feedReference({ cities: [cityOf()], reference: { rates: { usd_uzs: 12_800 } } as never });
});

afterEach(() => {
  cleanup();
  resetReference();
});

describe("the demand of the owner form (WP-81, BR-APP-083, DEC-78, DEC-84)", () => {
  it("reads never without a city; the price only with its currency; a room or the rooms", () => {
    expect(demandQuery(normalizeForm({}))).toBeNull();
    expect(demandQuery(normalizeForm({ city: "tashkent", district_code: "yunusabad", rooms: 2, price: 600, currency: "USD" }))).toEqual({
      city: "tashkent",
      district: "yunusabad",
      rooms: 2,
      price: 600,
      currency: "USD",
    });
    expect(demandQuery(normalizeForm({ city: "tashkent", room: true }))).toEqual({ city: "tashkent", room: 1 });
  });

  it("the line: the number from 5, «несколько человек» for few, none for 0", () => {
    expect(demandLine({ ...DEMAND, count: 7 })).toEqual({ kind: "count", n: 7 });
    expect(demandLine({ ...DEMAND, few: true })).toEqual({ kind: "few" });
    expect(demandLine({ ...DEMAND, count: 0 })).toBeNull();
    expect(demandLine(null)).toBeNull();
  });

  it("the usual price in dollars, or in millions of sum in a UZS form; absent without both bounds or rooms", () => {
    const form = normalizeForm({ city: "tashkent", district_code: "yunusabad", rooms: 2 });
    const { unmount } = render(withIntl(<UsualPrice demand={DEMAND} form={form} />));
    expect(document.querySelector("[data-usual-price]")?.textContent).toBe("≈ обычная цена: $550–700 — 2-комн., Юнусабад");
    unmount();

    const uzs = render(withIntl(<UsualPrice demand={DEMAND} form={{ ...form, currency: "UZS" }} />));
    expect(document.querySelector("[data-usual-price]")?.textContent).toBe("≈ обычная цена: 7–9 млн сум — 2-комн., Юнусабад");
    uzs.unmount();

    render(withIntl(<UsualPrice demand={{ ...DEMAND, usualHighUsd: null }} form={form} />));
    expect(document.querySelector("[data-usual-price]")).toBeNull();
    render(withIntl(<UsualPrice demand={DEMAND} form={normalizeForm({ city: "tashkent" })} />));
    expect(document.querySelector("[data-usual-price]")).toBeNull();
  });
});
