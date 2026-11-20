import type { MessageKey } from "./messages";
import { type I18nReporter, reportOnce } from "./report";

/**
 * Message keys for values the server sends (WP-20, fix of LB-APP-002). A key is never built by concatenating a
 * server value: an unknown value gets `fallback.other` («Другое» / «Boshqa» / «Other») and one report.
 *
 * - `type`, `deal`, `sort`, `radarMode`, `reportReason`: the enums of the `/api/v1` contract (WP-12, WP-13).
 * - `verdictTone`: the long verdict of each market tone (`03` BR-APP-027). The formatter of WP-22 still decides
 *   by the delta where the wording depends on it (`check` above the market, «В N раза дороже» from +90 %, an unknown
 *   tone by its sign, LB-APP-039); this table is its lookup for the known tones.
 * - `noAccessTitle`, `noAccessText`: the reasons of the no-access screen (`03` SCR-003).
 */
export const labelTables = {
  type: {
    apartment: "type.apartment",
    house: "type.house",
    room: "type.room",
    commercial: "type.commercial",
    land: "type.land",
  },
  deal: {
    rent_long: "deal.rent_long",
    sale: "deal.sale",
    rent_daily: "deal.rent_daily",
  },
  radarMode: {
    instant: "subs.mode.instant",
    digest: "subs.mode.digest",
  },
  sort: {
    new: "sort.new",
    cheap: "sort.cheap",
    expensive: "sort.expensive",
    deal: "sort.deal",
    center: "sort.center",
    ppm: "sort.ppm",
  },
  reportReason: {
    rented: "report.rented",
    agent: "report.agent",
    wrong_data: "report.wrong_data",
    fraud: "report.fraud",
  },
  verdictTone: {
    good: "fmt.marketCheaper",
    high: "fmt.marketPricier",
    same: "fmt.marketSame",
    mixed: "fmt.marketMixed",
    no_repair: "fmt.marketNoRepair",
    suspicious: "fmt.marketSuspicious",
    check: "fmt.marketCheck",
  },
  noAccessTitle: {
    private: "noAccess.title.private",
    invite: "noAccess.title.invite",
    full: "noAccess.title.full",
    blocked: "noAccess.title.blocked",
    join: "noAccess.title.join",
    paused: "noAccess.title.paused",
  },
  noAccessText: {
    private: "noAccess.text.private",
    invite: "noAccess.text.invite",
    full: "noAccess.text.full",
    blocked: "noAccess.text.blocked",
    join: "noAccess.text.join",
    paused: "noAccess.text.paused",
  },
} as const satisfies Record<string, Record<string, MessageKey>>;

export type LabelTable = keyof typeof labelTables;

/** The message key for `value` in `table`, or `fallback.other` (reported once per table and value). */
export function labelFor(table: LabelTable, value: string, report?: I18nReporter): MessageKey {
  const entries: Readonly<Record<string, MessageKey>> = labelTables[table];
  if (Object.hasOwn(entries, value)) {
    return entries[value];
  }
  const key = `${table}.${value}`;
  reportOnce(report, `label:${key}`, new Error(`No label for ${table} "${value}"`), {
    kind: "i18n",
    key,
    code: "UNKNOWN_VALUE",
  });
  return "fallback.other";
}
