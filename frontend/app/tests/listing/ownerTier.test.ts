import { afterEach, describe, expect, it } from "vitest";

import { chipShown, infoPoints } from "@/features/listing/owner/ownerTier";
import { countOwnerTip, dismissOwnerTip, ownerTipDue } from "@/features/listing/owner/ownerTip";
import type { ListingDetails } from "@/features/listing/listingData";

const owner = (tier: string | null, fields: Record<string, unknown> = {}) => ({ tier, mine: false, listing_id: null, entry: false, response_minutes: null, description: null, ...fields });
const details = (fields: Record<string, unknown>) =>
  ({ number: 1, origin: "native", is_owner: true, owner: owner("self"), contact: { has_phone: false, contact_url: null, contact_paid: false, mode: null, request: null }, ...fields }) as unknown as ListingDetails;

afterEach(() => window.localStorage.clear());

describe("chipShown (BR-APP-100, default 21)", () => {
  it("shows for self and verified, a preview with owner_verified; never for a realtor mark or a claimed owner", () => {
    expect(chipShown({ is_owner: true, owner: owner("self") as never })).toBe(true);
    expect(chipShown({ is_owner: true, owner: owner("verified") as never })).toBe(true);
    expect(chipShown({ is_owner: true, owner: owner("claimed") as never })).toBe(false);
    expect(chipShown({ is_owner: true, owner_verified: true })).toBe(true);
    expect(chipShown({ is_owner: false, owner: owner("verified") as never })).toBe(false);
    expect(chipShown({ is_owner: null, owner_verified: false })).toBe(false);
  });
});

describe("infoPoints (SCR-062, DEC-77, fix of LB-APP-078)", () => {
  const keys = (d: ListingDetails, time: string | null = null) => {
    const { points, foot } = infoPoints(d, time);
    return { points: points.map((point) => point.key), foot };
  };

  it("a native self-placed listing in request mode names HOMI, its check, the gate and the usual time", () => {
    expect(keys(details({ contact: { mode: "request", request: null } }), "3 ч")).toEqual({
      points: ["owner.info.selfHomi", "owner.info.phone", "owner.info.checked", "owner.info.gate", "contact.usuallyTime"],
      foot: "owner.info.foot",
    });
  });

  it("the gate goes once the request is given; a legacy listing keeps legacy's claim and its gate foot", () => {
    expect(keys(details({ contact: { mode: "request", request: { status: "given" } } })).points).not.toContain("owner.info.gate");
    expect(keys(details({ origin: "legacy", contact: { mode: "request", request: null } }))).toEqual({
      points: ["owner.info.self", "owner.info.phone", "owner.info.notAgent", "owner.info.gate"],
      foot: "owner.info.footGate",
    });
    expect(keys(details({ origin: "legacy", owner: owner("verified"), contact: { mode: "phone", request: null } }))).toEqual({
      points: ["owner.info.verified", "owner.info.phone", "owner.info.notAgent"],
      foot: "owner.info.foot",
    });
  });
});

describe("the chip's tip counter (BR-APP-101, homi-owner-tip)", () => {
  it("is due twice, then never; a dismissal ends it at once", () => {
    expect(ownerTipDue()).toBe(true);
    countOwnerTip();
    expect(ownerTipDue()).toBe(true);
    countOwnerTip();
    expect(ownerTipDue()).toBe(false);
    window.localStorage.clear();
    dismissOwnerTip();
    expect(ownerTipDue()).toBe(false);
    expect(window.localStorage.getItem("homi-owner-tip")).toBe("done");
  });
});
