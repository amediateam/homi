import { defaultFilters, filtersHash, type SearchFilters } from "@homi/search";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn() }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: "ready", renewed: false }) }));

import { FEED_RADAR_AFTER, FEED_RADAR_SEEN_RATIO, FEED_RADAR_SNOOZE_MS } from "@/features/nudges/constants";
import {
  type FeedRadarInput,
  feedRadarButtonKey,
  feedRadarSeen,
  feedRadarSnoozed,
  feedRadarTitleKey,
  markFeedRadarSeen,
  resetFeedRadarSeen,
  shouldShowFeedRadar,
} from "@/features/nudges/feedRadar";
import { emptyNudgeState } from "@/features/nudges/storage";
import { normalizeRadar, type Radar } from "@/features/radars/normalize";

const NOW = Date.parse("2026-11-18T09:00:00Z");
const DEFAULT: SearchFilters = defaultFilters("rent_long", "tashkent");
const CUSTOM: SearchFilters = { ...DEFAULT, rooms_min: 2, rooms_max: 2 };
const SALE: SearchFilters = { ...defaultFilters("sale", "tashkent"), rooms_min: 3, rooms_max: 3 };

const A = "01JD0000000000000000000001";
const B = "01JD0000000000000000000002";

function radarOf(id: string, filters: unknown, active = true): Radar {
  return normalizeRadar({ id, active, mode: "instant", hidden: 0, created_at: null, filters })!;
}

function shows(overrides: Partial<FeedRadarInput> = {}): boolean {
  return shouldShowFeedRadar({
    filters: CUSTOM,
    radars: [],
    limit: 10,
    radarsEnabled: true,
    referenceLoaded: true,
    snoozed: false,
    ...overrides,
  });
}

beforeEach(() => {
  resetFeedRadarSeen();
});

describe("shouldShowFeedRadar (SCR-047, BR-APP-072)", () => {
  it("shows for a search no radar covers, under the limit, with no × in force", () => {
    expect(shows()).toBe(true);
    expect(shows({ filters: DEFAULT })).toBe(true);
  });

  it("never while radars are switched off (DEC-51)", () => {
    expect(shows({ radarsEnabled: false })).toBe(false);
  });

  it("not before the reference data and the radar list are loaded", () => {
    expect(shows({ referenceLoaded: false })).toBe(false);
    expect(shows({ radars: undefined })).toBe(false);
  });

  it("not when a radar covers the search: the same filters, on or paused; for default filters the same deal and city", () => {
    expect(shows({ radars: [radarOf(A, CUSTOM, false)] })).toBe(false);
    expect(shows({ radars: [radarOf(A, SALE)] })).toBe(true);
    expect(shows({ filters: DEFAULT, radars: [radarOf(A, CUSTOM)] })).toBe(false);
    expect(shows({ filters: DEFAULT, radars: [radarOf(A, SALE)] })).toBe(true);
  });

  it("not at the radar limit", () => {
    const two = [radarOf(A, SALE), radarOf(B, { ...SALE, rooms_min: 1, rooms_max: 1 })];
    expect(shows({ radars: two, limit: 2 })).toBe(false);
    expect(shows({ radars: two, limit: 3 })).toBe(true);
  });

  it("not while the × of the last 7 days is in force: feedOff ahead hides it, feedOff past shows it", () => {
    const state = { ...emptyNudgeState(), feedOff: NOW + FEED_RADAR_SNOOZE_MS };
    expect(feedRadarSnoozed(state, NOW)).toBe(true);
    expect(feedRadarSnoozed(state, NOW + FEED_RADAR_SNOOZE_MS - 1)).toBe(true);
    expect(feedRadarSnoozed(state, NOW + FEED_RADAR_SNOOZE_MS)).toBe(false);
    expect(feedRadarSnoozed(emptyNudgeState(), NOW)).toBe(false);
    expect(shows({ snoozed: true })).toBe(false);
  });

  it("the constants: after 8 cards, hidden for 7 days, seen at 60 %", () => {
    expect([FEED_RADAR_AFTER, FEED_RADAR_SNOOZE_MS, FEED_RADAR_SEEN_RATIO]).toEqual([8, 7 * 24 * 3600_000, 0.6]);
  });
});

describe("the card's texts", () => {
  it("the title per base deal: long and daily rent → titleRent, sale → titleSale", () => {
    expect(feedRadarTitleKey("rent_long")).toBe("feedRadar.titleRent");
    expect(feedRadarTitleKey("rent_daily")).toBe("feedRadar.titleRent");
    expect(feedRadarTitleKey("sale")).toBe("feedRadar.titleSale");
  });

  it("the button per custom or default filters; daily rent is custom", () => {
    expect(feedRadarButtonKey(CUSTOM)).toBe("feedRadar.enable");
    expect(feedRadarButtonKey(defaultFilters("rent_daily", "tashkent"))).toBe("feedRadar.enable");
    expect(feedRadarButtonKey(DEFAULT)).toBe("feedRadar.setup");
    expect(feedRadarButtonKey(defaultFilters("sale", "samarkand"))).toBe("feedRadar.setup");
  });
});

describe("the seen memory: once per launch per filter hash", () => {
  it("answers true the first time only, per hash", () => {
    const hash = filtersHash(CUSTOM);
    expect(feedRadarSeen(hash)).toBe(false);
    expect(markFeedRadarSeen(hash)).toBe(true);
    expect(markFeedRadarSeen(filtersHash({ ...CUSTOM, posted_days: 7 }))).toBe(false);
    expect(feedRadarSeen(hash)).toBe(true);
    expect(markFeedRadarSeen(filtersHash(SALE))).toBe(true);
  });
});
