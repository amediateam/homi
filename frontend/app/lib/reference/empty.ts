import type { Reference } from "./types";

/** The default radar limit when the reference data has none (WP-22). */
export const DEFAULT_RADAR_LIMIT = 10;

/**
 * What stands in while the reference data cannot be read: no city (nothing that needs a city is offered, LB-APP-023),
 * no radar (`radars_enabled` false, DEC-51), no bot or support account, the default radar limit.
 */
export const EMPTY_REFERENCE: Reference = {
  bot: { username: null, support_username: null },
  limits: { radars: DEFAULT_RADAR_LIMIT, owner_listings: 2, owner_photos: 10, requests: { day: 10, week: 30, pause_minutes: 10 } },
  radars_enabled: false,
  owner_enabled: false,
  rates: { usd_uzs: 0 },
  map: { tiles_url: null },
  features: [],
  locales: [],
  cities: [],
  renovations: { rent_long: [], rent_daily: [], sale: [], owner: [] },
  appliances: [],
  price_presets: { rent_long: [], rent_daily: [], sale: [] },
};
