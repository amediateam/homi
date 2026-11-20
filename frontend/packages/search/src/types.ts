/**
 * The vocabulary of the filter model (WP-22). The enums are those of the `/api/v1` contract (`Deal`, `PropertyType`,
 * `OwnerFilter`, `Tenant`, `Market`, `ListingSort` of `docs/api/openapi.json`); the city shapes are the minimal
 * structural subset of `GET /reference` (`cities[]`) and `GET /cities` that the rules read, so this package needs no
 * link to `@homi/types`.
 */

/** The three deals of the product. */
export const DEALS = ["rent_long", "rent_daily", "sale"] as const;
export type Deal = (typeof DEALS)[number];

/** The deal of the rent / sale switch: daily rent counts as rent. */
export type BaseDeal = "rent_long" | "sale";

export const PROPERTY_TYPES = ["apartment", "house", "room", "commercial", "land"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

/** «Кто сдаёт / продаёт». */
export const OWNER_OPTIONS = ["any", "no_agents", "owners"] as const;
export type Owner = (typeof OWNER_OPTIONS)[number];

export const TENANT_OPTIONS = ["family", "men", "women"] as const;
export type Tenant = (typeof TENANT_OPTIONS)[number];

/** New building or secondary market (sale only). */
export const MARKET_OPTIONS = ["new", "secondary"] as const;
export type Market = (typeof MARKET_OPTIONS)[number];

/** City zones in their canonical order: `filters.zones` is always kept in it. */
export const ZONE_OPTIONS = ["center", "near_center"] as const;
export type Zone = (typeof ZONE_OPTIONS)[number];

/** «Опубликовано за N дней». */
export const POSTED_DAYS_OPTIONS = [1, 3, 7] as const;
export type PostedDays = (typeof POSTED_DAYS_OPTIONS)[number];

/** The orders of the feed; `new` is the default and is never written to an address or sent. */
export const LISTING_SORTS = ["new", "cheap", "expensive", "deal", "center", "ppm"] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

/** One vertex of a drawn area: latitude, longitude. */
export type PolygonVertex = readonly [lat: number, lon: number];
/** An open polygon of 3 … 40 vertices. */
export type Polygon = readonly PolygonVertex[];

/**
 * One search: exactly the 25 keys of the filters object of the contract (WP-12). Prices are whole USD; codes
 * (`city`, `districts`, `renovation`, `appliances`) are codes of the reference data.
 */
export type SearchFilters = {
  readonly city: string;
  readonly deal: Deal;
  readonly owner: Owner;
  readonly types: readonly PropertyType[];
  readonly districts: readonly string[];
  readonly renovation: readonly string[];
  readonly appliances: readonly string[];
  readonly rooms_min: number | null;
  readonly rooms_max: number | null;
  readonly price_min: number | null;
  readonly price_max: number | null;
  readonly area_min: number | null;
  readonly area_max: number | null;
  readonly posted_days: PostedDays | null;
  readonly furnished: boolean | null;
  readonly floor_not_first: boolean;
  readonly floor_not_last: boolean;
  readonly market: Market | null;
  readonly zones: readonly Zone[];
  readonly near_metro: boolean;
  readonly below_median: boolean;
  readonly tenant: Tenant | null;
  readonly pets: boolean;
  readonly pets_only: boolean;
  readonly polygon: Polygon | null;
};

export type FilterKey = keyof SearchFilters;

/** The 25 keys in the one order used by the address and the API query. */
export const FILTER_KEYS = [
  "city",
  "deal",
  "owner",
  "types",
  "districts",
  "renovation",
  "appliances",
  "rooms_min",
  "rooms_max",
  "price_min",
  "price_max",
  "area_min",
  "area_max",
  "posted_days",
  "furnished",
  "floor_not_first",
  "floor_not_last",
  "market",
  "zones",
  "near_metro",
  "below_median",
  "tenant",
  "pets",
  "pets_only",
  "polygon",
] as const satisfies readonly FilterKey[];

type AssertNever<T extends never> = T;
/** Compile-time proof that `FILTER_KEYS` names every key of `SearchFilters` (a missing key fails `typecheck`). */
export type MissingFilterKey = AssertNever<Exclude<FilterKey, (typeof FILTER_KEYS)[number]>>;

/** Where a filter set is edited: the feed search, a new radar or an existing radar. */
export type SearchMode = "search" | "radar-new" | "radar-edit";

/**
 * The flagged branches of this package (DEC-36). A member's default is the behaviour of the pinned legacy release
 * (DEC-58): on for a departure legacy has since adopted, else off. The app fills them from its `devFlags`
 * (`frontend/app/lib/search/rules.ts`), whose names they repeat.
 */
export type SearchRules = {
  /** LB-APP-029: hide the tenant section for daily rent (the half of DEV-017 legacy did not adopt). */
  readonly dev017TenantPetsDailyRule: boolean;
  /** DEV-017: the pets section only for long-term rent (legacy since `index-CIa0Ldj2.js`; on by default). */
  readonly dev017PetsLongRentOnly: boolean;
  /** LB-APP-030: «Сбросить» keeps daily rent. */
  readonly dev018ResetKeepsDaily: boolean;
  /** LB-APP-043: swap inverted price and area ranges before they are sent. */
  readonly dev025ValidateRanges: boolean;
  /** DEV-052: the single below-median rule, not approved yet — no effect. */
  readonly dev052UnifiedBelowMedianRule: boolean;
  /** DEV-005: a radar's filters drop `posted_days`. */
  readonly dev005RadarDropsPostedDays: boolean;
};

/** A code with its localised name (`NamedCodeResource`). */
export type NamedCode = {
  readonly code: string;
  readonly name: string;
};

/**
 * A city of `GET /reference` (`CityResource`). Only `code` is required here: a field the rules read and the answer
 * lacks counts as absent (`false`, empty), never as present (fix of LB-APP-007 and LB-APP-023).
 */
export type CityRef = {
  readonly code: string;
  readonly name?: string | null;
  readonly is_region?: boolean;
  readonly center?: { readonly lat: number; readonly lon: number } | null;
  readonly zoom?: number;
  readonly has_metro?: boolean | null;
  readonly has_median?: boolean | null;
  readonly districts?: readonly NamedCode[] | null;
  readonly zones?: readonly NamedCode[] | null;
};

/** The statistics of one city of `GET /cities` (`CityStatsResource`); per-deal maps may lack a deal. */
export type CityStatsRef = {
  readonly code: string;
  readonly counts?: Readonly<Partial<Record<Deal, number>>> | null;
  readonly price_presets?: Readonly<Partial<Record<Deal, readonly number[]>>> | null;
  readonly typical_price?: Readonly<Partial<Record<Deal, number>>> | null;
};

/** A translation function over the keys of the legacy catalogue (`sum.*`, `deal.*`, `type.*`, `fallback.other`). */
export type Translate = (key: string, values?: Readonly<Record<string, string | number>>) => string;

/** Formats a whole-USD amount in the user's currency (`createMoney(…).format` of `@homi/i18n/format`). */
export type FormatPrice = (usd: number) => string;
