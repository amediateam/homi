/**
 * The filter model of the Mini App (WP-22): the 25-key `SearchFilters`, its defaults and normaliser, comparison,
 * the transition and availability rules, sorts, summaries, and the mappings to the address, the v1 query and the
 * radar body. No React, no Next.js, no app imports; translations, money and flags enter as arguments.
 */
export { type ApiQueryOptions, API_LIMIT_RANGE, toApiQuery } from "./api";
export { belowMedianAvailable, fixRanges, type Sections, sectionsFor } from "./availability";
export { countActiveFilters, filtersHash, filtersKey, isCustomFilters, sameFilters } from "./compare";
export {
  baseDeal,
  DEFAULT_CITY,
  DEFAULT_DEAL,
  DEFAULT_RULES,
  DEFAULT_SORT,
  defaultFilters,
  isApartmentOnly,
  isApartmentSearch,
  NO_ROOMS_TYPES,
  resolveRules,
  TYPES_BY_DEAL,
} from "./defaults";
export { FILTER_LIMITS, type NormalizeOptions, normalizeFilters } from "./normalize";
export {
  normalizePolygon,
  parsePolygon,
  POLYGON_DECIMALS,
  POLYGON_MAX_VERTICES,
  POLYGON_MIN_VERTICES,
  serializePolygon,
} from "./polygon";
export { type RadarFilters, toRadarFilters } from "./radar";
export { isRoomPicked, pickRooms, ROOM_OPTIONS } from "./rooms";
export { normalizeSort, parseSort, sortOptions } from "./sort";
export {
  areaLabel,
  filtersAreaSummary,
  filtersSummary,
  filtersTitle,
  findCity,
  type LabelLookup,
  priceLabel,
  roomsLabel,
  type SummaryContext,
  type TitleFilters,
} from "./summary";
export {
  applyPreset,
  type Geography,
  isPresetSelected,
  pickCity,
  presetSource,
  type QuickFilter,
  resetAll,
  resetQuick,
  setGeography,
  switchDeal,
  switchRentTerm,
  toggleDistrict,
  toggleType,
  toggleZone,
} from "./transitions";
export * from "./types";
export {
  cityFallback,
  fromSearchParams,
  SEARCH_PARAM_KEYS,
  type SearchParamsInput,
  type SearchState,
  toSearchParams,
} from "./url";
