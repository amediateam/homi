/**
 * Switches for the `DEV` rows of `09-feature-parity-matrix.md` §4.2 (DEC-36, WP-20): each is a deliberate departure
 * from legacy behaviour that stays off until the product owner turns it on. Every flag is `false`, so the app
 * reproduces legacy. Workspace packages never import this file; they take a rules argument
 * (`searchRules(devFlags)`, WP-22). Tests use `withDevFlags` of `tests/helpers/flags.ts`.
 */
export type DevFlagName =
  | "dev001AnyForbiddenShowsAccess"
  | "dev005RadarDropsPostedDays"
  | "dev010RealtorVoteWording"
  | "dev013BackClosesMapCard"
  | "dev014TashkentDates"
  | "dev016ErrorToastOnFailure"
  | "dev017TenantPetsDailyRule"
  | "dev018ResetKeepsDaily"
  | "dev019OneDistanceFormatter"
  | "dev020OneLanguageDetector"
  | "dev021OneFlowVocabulary"
  | "dev022RadarCountLabel"
  | "dev023CityCountsIncludeDaily"
  | "dev024ResetOnlyWithActiveFilters"
  | "dev025ValidateRanges"
  | "dev051RentedUndo"
  | "dev052UnifiedBelowMedianRule";

export type DevFlags = Readonly<Record<DevFlagName, boolean>>;

export const devFlags = {
  /** DEV-001: any 403 shows the access screen, not only the one of the launch. */
  dev001AnyForbiddenShowsAccess: false,
  /** DEV-005: radars do not store `posted_days`. */
  dev005RadarDropsPostedDays: false,
  /** DEV-010: realtor vote with a weighted threshold, undo and honest wording. */
  dev010RealtorVoteWording: false,
  /** DEV-013: Back closes the map selection card. */
  dev013BackClosesMapCard: false,
  /** DEV-014: product dates and times in Asia/Tashkent instead of the device time zone. */
  dev014TashkentDates: false,
  /** DEV-016: an error toast for failures that only vibrated. */
  dev016ErrorToastOnFailure: false,
  /** DEV-017: one rule for tenant and pets on daily rent. */
  dev017TenantPetsDailyRule: false,
  /** DEV-018: «Сбросить» keeps daily rent. */
  dev018ResetKeepsDaily: false,
  /** DEV-019: one distance formatter. */
  dev019OneDistanceFormatter: false,
  /** DEV-020: one language detector. */
  dev020OneLanguageDetector: false,
  /** DEV-021: one vocabulary for the weekly flow. */
  dev021OneFlowVocabulary: false,
  /** DEV-022: the radar «Смотреть найденное · N» counts what the radar found. */
  dev022RadarCountLabel: false,
  /** DEV-023: city counts include daily rent. */
  dev023CityCountsIncludeDaily: false,
  /** DEV-024: «Сбросить фильтры» only when filters are active. */
  dev024ResetOnlyWithActiveFilters: false,
  /** DEV-025: validate min ≤ max for price and area. */
  dev025ValidateRanges: false,
  /** DEV-051: undo for «rented» in the Mini App. */
  dev051RentedUndo: false,
  /** DEV-052: one availability rule for «Не дороже рынка». */
  dev052UnifiedBelowMedianRule: false,
} as const satisfies DevFlags;
