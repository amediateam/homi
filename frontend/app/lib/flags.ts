/**
 * Switches for the `DEV` rows of `09-feature-parity-matrix.md` §4.2 (DEC-36, WP-20). A flag's default is the
 * behaviour of the pinned legacy release (DEC-58, amending DEC-36): a departure that legacy has since adopted is on,
 * the rest stay off until the product owner turns them on. The flag stays either way, so both branches can be
 * tested, and a half of a row that legacy did not adopt has a flag of its own, off. Workspace packages never import
 * this file; they take a rules argument (`searchRules(devFlags)`, WP-22). Tests use `withDevFlags` of
 * `tests/helpers/flags.ts`.
 */
export type DevFlagName =
  | "dev001AnyForbiddenShowsAccess"
  | "dev005RadarDropsPostedDays"
  | "dev010AgentMarkedToast"
  | "dev010RealtorVoteWording"
  | "dev013BackClosesMapCard"
  | "dev014TashkentDates"
  | "dev016ErrorToastOnFailure"
  | "dev016SuccessToastOnDestructive"
  | "dev017PetsLongRentOnly"
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
  /** DEV-010: the realtor toast follows `agent_marked` (legacy since `index-CIa0Ldj2.js`). */
  dev010AgentMarkedToast: true,
  /** DEV-010: the review wording of the hint under the realtor reason («Проверим номер…»). */
  dev010RealtorVoteWording: false,
  /** DEV-013: Back closes the map selection card. */
  dev013BackClosesMapCard: false,
  /** DEV-014: price history dates and times in Tashkent, not the device zone (legacy since `index-CIa0Ldj2.js`). */
  dev014TashkentDates: true,
  /** DEV-016: «Не получилось сохранить» for failures that only vibrated (legacy since `index-CIa0Ldj2.js`). */
  dev016ErrorToastOnFailure: true,
  /** DEV-016: the success toast of a destructive action, «Радар удалён» (legacy does not show it). */
  dev016SuccessToastOnDestructive: false,
  /** DEV-017: the pets section only for long-term rent (legacy since `index-CIa0Ldj2.js`). */
  dev017PetsLongRentOnly: true,
  /** DEV-017: the tenant section hidden for daily rent too; it governs the tenant section only. */
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
  /** DEV-051: «Вернуть» on «Отметили: уже сдано» withdraws the report (legacy since `index-CIa0Ldj2.js`). */
  dev051RentedUndo: true,
  /** DEV-052: one availability rule for «Не дороже рынка». */
  dev052UnifiedBelowMedianRule: false,
} as const satisfies DevFlags;
