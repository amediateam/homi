/**
 * The client formatters of the Mini App (WP-22): numbers, money, dates, distances and the radar flow, with the
 * legacy output (`03` §3.5, BR-APP-015, 029, 031, 044, 060). Pure functions: the locale, the clock and `t` are
 * arguments, and a flagged branch takes its flag as a plain option the caller fills from `devFlags`. Strings the
 * server already formats (card price, age, title) are rendered as they arrive and never pass through here.
 */
export { type DateInput, dateTimeZone, formatAgo, formatShortDate, formatTime, tashkentDayKey, type ZoneOptions } from "./date";
export { type DistanceOptions, formatCenter, formatDistance, formatMetroLabel, type MetroOptions } from "./distance";
export { type FlowOptions, flowParts, type FlowRate, flowRate, type FlowSurface, formatFlow } from "./flow";
export {
  createMoney,
  type Money,
  type MoneyOptions,
  type PresetDeal,
  type PresetSources,
  type PricePreset,
} from "./money";
export { formatCount, formatDecimal, formatKm, formatNumber, formatResponseTime, type Translate } from "./number";
