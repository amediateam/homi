import { defaultFilters } from "@homi/search";
import { afterEach, describe, expect, it, vi } from "vitest";

/** The launch opened listing `number` (`launchListing`), and a fresh switch module. */
async function launched(number: number | null) {
  vi.resetModules();
  vi.doMock("@/lib/deeplinks/launch", () => ({ launchListing: () => number }));
  return import("@/features/listing/saleSwitch");
}

const rentFeed = defaultFilters("rent_long", "samarkand");
const saleHref = "/?city=samarkand&deal=sale";

afterEach(() => {
  vi.doUnmock("@/lib/deeplinks/launch");
});

describe("saleSwitch (WP-38, BR-APP-108)", () => {
  it("marks the launch listing whose first full record is a sale over a feed that is not, for the feed's city", async () => {
    const sale = await launched(100001);
    sale.saleSwitchRecord(100001, "sale", rentFeed, "tashkent");
    expect(sale.takeSaleSwitch(100001)).toBe(saleHref);
    expect(sale.takeSaleSwitch(100001)).toBeNull();
  });

  it("over daily rent the feed is not a sale either", async () => {
    const sale = await launched(100001);
    sale.saleSwitchRecord(100001, "sale", defaultFilters("rent_daily", "samarkand"), null);
    expect(sale.takeSaleSwitch(100001)).toBe(saleHref);
  });

  it("without a list shown in this launch, the sale defaults of the profile's city", async () => {
    const sale = await launched(100001);
    sale.saleSwitchRecord(100001, "sale", null, "bukhara");
    expect(sale.takeSaleSwitch(100001)).toBe("/?city=bukhara&deal=sale");
  });

  it("marks nothing for another listing than the launch's, for a launch without a listing, for daily rent or rent", async () => {
    const other = await launched(100001);
    other.saleSwitchRecord(100002, "sale", rentFeed, null);
    expect(other.takeSaleSwitch(100002)).toBeNull();

    const none = await launched(null);
    none.saleSwitchRecord(100001, "sale", rentFeed, null);
    expect(none.takeSaleSwitch(100001)).toBeNull();

    for (const deal of ["rent_daily", "rent_long", null] as const) {
      const sale = await launched(100001);
      sale.saleSwitchRecord(100001, deal, rentFeed, null);
      expect(sale.takeSaleSwitch(100001)).toBeNull();
    }
  });

  it("marks nothing over a sale feed, and the sort is not looked at", async () => {
    const sale = await launched(100001);
    sale.saleSwitchRecord(100001, "sale", defaultFilters("sale", "samarkand"), null);
    expect(sale.takeSaleSwitch(100001)).toBeNull();
  });

  it("only the first full record counts: a later load of the same listing changes nothing", async () => {
    const sale = await launched(100001);
    sale.saleSwitchRecord(100001, "rent_long", rentFeed, null);
    sale.saleSwitchRecord(100001, "sale", rentFeed, null);
    expect(sale.takeSaleSwitch(100001)).toBeNull();

    const again = await launched(100001);
    again.saleSwitchRecord(100001, "sale", rentFeed, null);
    expect(again.takeSaleSwitch(100001)).toBe(saleHref);
    again.saleSwitchRecord(100001, "sale", rentFeed, null);
    expect(again.takeSaleSwitch(100001)).toBeNull();
  });

  it("opening another listing drops the mark; opening the same one keeps it", async () => {
    const sale = await launched(100001);
    sale.saleSwitchRecord(100001, "sale", rentFeed, null);
    sale.saleSwitchOpened(100001);
    expect(sale.takeSaleSwitch(100001)).toBe(saleHref);

    const other = await launched(100001);
    other.saleSwitchRecord(100001, "sale", rentFeed, null);
    other.saleSwitchOpened(100002);
    expect(other.takeSaleSwitch(100001)).toBeNull();
  });

  it("the layer hiding without its close drops the mark of its number only", async () => {
    const sale = await launched(100001);
    sale.saleSwitchRecord(100001, "sale", rentFeed, null);
    sale.forgetSaleSwitch(100002);
    expect(sale.takeSaleSwitch(100001)).toBe(saleHref);

    const hidden = await launched(100001);
    hidden.saleSwitchRecord(100001, "sale", rentFeed, null);
    hidden.forgetSaleSwitch(100001);
    expect(hidden.takeSaleSwitch(100001)).toBeNull();
  });
});
