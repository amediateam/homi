import type { CityRef, Deal, FormatPrice, PropertyType, SearchFilters, Translate } from "./types";

/** The message key of a server value of a label table (`labelFor` of `@homi/i18n`, WP-20). */
export type LabelLookup = (table: "type" | "deal", value: string) => string;

/**
 * What the summaries need from the app: `t` over the legacy catalogue, the money formatter of the user's currency,
 * the cities of the reference data (`null` while it loads) and, optionally, `labelFor` of `@homi/i18n` so unknown
 * server values are reported once.
 */
export type SummaryContext = {
  readonly t: Translate;
  readonly formatPrice: FormatPrice;
  readonly cities?: readonly CityRef[] | null;
  readonly label?: LabelLookup;
};

const TYPE_KEYS: Readonly<Record<PropertyType, string>> = {
  apartment: "type.apartment",
  house: "type.house",
  room: "type.room",
  commercial: "type.commercial",
  land: "type.land",
};

const DEAL_KEYS: Readonly<Record<Deal, string>> = {
  rent_long: "deal.rent_long",
  rent_daily: "deal.rent_daily",
  sale: "deal.sale",
};

/** The built-in lookup: a known value's key, else `fallback.other` (never a key built from a server value). */
const builtInLabel: LabelLookup = (table, value) => {
  const keys: Readonly<Record<string, string>> = table === "type" ? TYPE_KEYS : DEAL_KEYS;
  return Object.hasOwn(keys, value) ? keys[value] : "fallback.other";
};

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const joined = (parts: readonly (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ");

/** The city of `code` in the reference data, or `null` — never another city in its place. */
export function findCity(cities: readonly CityRef[] | null | undefined, code: string): CityRef | null {
  return cities?.find((city) => city.code === code) ?? null;
}

/** The rooms label (BR-APP-066): «{n}-комн.», «{n}+ комн.», «{lo}–{hi} комн.», or `null`. */
export function roomsLabel(
  filters: { readonly rooms_min?: number | null; readonly rooms_max?: number | null },
  ctx: Pick<SummaryContext, "t">,
): string | null {
  const min = isNumber(filters.rooms_min) ? filters.rooms_min : null;
  const max = isNumber(filters.rooms_max) ? filters.rooms_max : null;
  if (min === null && max === null) {
    return null;
  }
  if (max === null) {
    return ctx.t("sum.roomsFrom", { n: min ?? 1 });
  }
  if (min === max) {
    return ctx.t("sum.roomsExact", { n: min });
  }
  return ctx.t("sum.roomsRange", { lo: min ?? 1, hi: max });
}

/** The price label (BR-APP-066): «X–Y», «до X», «от X», or `null`; amounts through `formatPrice`. */
export function priceLabel(
  filters: { readonly price_min?: number | null; readonly price_max?: number | null },
  ctx: Pick<SummaryContext, "t" | "formatPrice">,
): string | null {
  const min = isNumber(filters.price_min) ? filters.price_min : null;
  const max = isNumber(filters.price_max) ? filters.price_max : null;
  if (min !== null && max !== null) {
    return `${ctx.formatPrice(min)}–${ctx.formatPrice(max)}`;
  }
  if (max !== null) {
    return ctx.t("sum.priceUpto", { hi: ctx.formatPrice(max) });
  }
  if (min !== null) {
    return ctx.t("sum.priceFrom", { lo: ctx.formatPrice(min) });
  }
  return null;
}

/**
 * The selected area (BR-APP-064): «Своя область» for a drawn polygon (it wins over anything else a server radar
 * carries), «Центр и ближе к центру» for both zones, a zone's name before « (», or two districts and «+N» (a district
 * the reference data does not know shows by its code). `null` for the whole city.
 */
export function areaLabel(
  filters: Pick<SearchFilters, "polygon" | "zones" | "districts">,
  city: CityRef | null | undefined,
  ctx: Pick<SummaryContext, "t">,
): string | null {
  if ((filters.polygon?.length ?? 0) > 0) {
    return ctx.t("sum.polygon");
  }
  if (filters.zones.length > 1) {
    return ctx.t("sum.zonesBoth");
  }
  if (filters.zones.length === 1) {
    return city?.zones?.find((zone) => zone.code === filters.zones[0])?.name.split(" (")[0] ?? null;
  }
  if (filters.districts.length > 0) {
    const names = filters.districts
      .slice(0, 2)
      .map((code) => city?.districts?.find((district) => district.code === code)?.name ?? code);
    const more = filters.districts.length > 2 ? ` +${filters.districts.length - 2}` : "";
    return `${names.join(", ")}${more}`;
  }
  return null;
}

function ownerLabel(filters: Pick<SearchFilters, "owner">, ctx: Pick<SummaryContext, "t">): string | null {
  if (filters.owner === "no_agents") {
    return ctx.t("sum.noAgents");
  }
  return filters.owner === "owners" ? ctx.t("sum.owners") : null;
}

/**
 * The one-line summary of the feed header (BR-APP-064): `city · area · Посуточно · у метро · rooms · price ·
 * ≤ медианы · без риелторов / от хозяев`. The city is the filters' own city of the reference data; while its name is
 * not known the city part is left out — legacy printed «Весь Ташкент» there for every city (LB-APP-026, DEC-54).
 */
export function filtersSummary(filters: SearchFilters, ctx: SummaryContext): string {
  const city = findCity(ctx.cities, filters.city);
  return joined([
    city?.name,
    areaLabel(filters, city, ctx),
    filters.deal === "rent_daily" && ctx.t("deal.rent_daily"),
    filters.near_metro && ctx.t("sum.nearMetro"),
    roomsLabel(filters, ctx),
    priceLabel(filters, ctx),
    filters.below_median && ctx.t("sum.belowMedian"),
    ownerLabel(filters, ctx),
  ]);
}

/**
 * «Where» of a radar tile and of the radar sheet header: the area, else the whole city «{city} целиком»
 * (`sum.wholeCity` with the city's own name, DEC-54; left out while the name is unknown), then у метро,
 * ≤ медианы and the owner.
 */
export function filtersAreaSummary(filters: SearchFilters, ctx: SummaryContext): string {
  const city = findCity(ctx.cities, filters.city);
  const whole = city?.name ? ctx.t("sum.wholeCity", { city: city.name }) : null;
  return joined([
    areaLabel(filters, city, ctx) ?? whole,
    filters.near_metro && ctx.t("sum.nearMetro"),
    filters.below_median && ctx.t("sum.belowMedian"),
    ownerLabel(filters, ctx),
  ]);
}

/** A radar's filters as the server stored them: types and deal may hold values this client has no label for. */
export type TitleFilters = {
  readonly deal: string;
  readonly types: readonly string[];
  readonly rooms_min?: number | null;
  readonly rooms_max?: number | null;
  readonly price_min?: number | null;
  readonly price_max?: number | null;
};

/**
 * The short title of a radar (BR-APP-065): the deal (unless long rent) · the types (unless only apartments) · rooms ·
 * price; with none of them, the deal's name. Server values go through the label lookup, so an unknown type reads
 * «Другое» (`fallback.other`).
 */
export function filtersTitle(filters: TitleFilters, ctx: Pick<SummaryContext, "t" | "formatPrice" | "label">): string {
  const label = ctx.label ?? builtInLabel;
  const deal = () => ctx.t(label("deal", filters.deal));
  const title = joined([
    filters.deal !== "rent_long" && deal(),
    filters.types.join() !== "apartment" && filters.types.map((type) => ctx.t(label("type", type))).join(", "),
    roomsLabel(filters, ctx),
    priceLabel(filters, ctx),
  ]);
  return title || deal();
}
