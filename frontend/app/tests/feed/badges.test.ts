import { describe, expect, it } from "vitest";

import { cardBadge } from "@/features/feed/badges";

import { previewOf } from "../helpers/listing";

type Signals = { tone?: string; delta?: number | null; verified?: boolean; owner?: boolean | null };

function badge({ tone, delta = -0.3, verified = false, owner = null }: Signals) {
  return cardBadge(
    previewOf({
      market: { label: null, median_delta: tone === undefined ? null : delta, tone: tone ?? null },
      owner_verified: verified,
      is_owner: owner,
    }),
  );
}

const kind = (signals: Signals) => badge(signals)?.kind ?? null;

describe("BR-APP-026: card badge priority", () => {
  it("gives each badge its key and the kind it is drawn with (since index-CBlEKxdL.js)", () => {
    expect(badge({ tone: "suspicious" })).toEqual({ kind: "suspiciousCheap", tone: "warn", key: "card.suspiciousCheap" });
    expect(badge({ tone: "check" })).toEqual({ kind: "checkPrice", tone: "warn", key: "card.checkPrice" });
    expect(badge({ verified: true })).toEqual({ kind: "ownerVerified", tone: "verified", key: "card.ownerVerified" });
    expect(badge({ owner: true })).toEqual({ kind: "owner", tone: "quiet", key: "card.owner" });
    expect(badge({ tone: "good" })).toEqual({ kind: "belowMarket", tone: "plain", key: "card.belowMarket" });
  });

  it("ranks every pair of adjacent badges", () => {
    expect(kind({ tone: "suspicious", verified: true, owner: true })).toBe("suspiciousCheap");
    expect(kind({ tone: "check", verified: true, owner: true })).toBe("checkPrice");
    expect(kind({ verified: true, owner: true, tone: "good" })).toBe("ownerVerified");
    expect(kind({ owner: true, tone: "good" })).toBe("owner");
    expect(kind({ tone: "good" })).toBe("belowMarket");
  });

  it("puts the owner marks above «Ниже рынка» (since index-Dbpp463V.js)", () => {
    expect(badge({ owner: true, tone: "good" })?.key).toBe("card.owner");
    expect(badge({ verified: true, tone: "good" })?.key).toBe("card.ownerVerified");
  });

  it("takes «Ниже рынка» from the tone good, not from a negative delta, and only with a delta", () => {
    expect(kind({ tone: "no_repair", delta: -0.25 })).toBeNull();
    expect(kind({ tone: "weird", delta: -0.25 })).toBeNull();
    expect(kind({ tone: "good", delta: null })).toBeNull();
    expect(kind({ tone: "suspicious", delta: null })).toBeNull();
  });

  it("is null when nothing matches", () => {
    expect(badge({})).toBeNull();
    expect(badge({ owner: false, tone: "same", delta: 0.01 })).toBeNull();
    expect(badge({ tone: "high", delta: 0.4 })).toBeNull();
  });
});
