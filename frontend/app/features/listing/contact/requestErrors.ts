import type { MessageKey } from "@homi/i18n";

import type { ApiFailure } from "@/lib/api/errors";

/** What a refused request does (WP-83, SCR-061): a line in the sheet, and what happens to the card. */
export interface RequestOutcome {
  /** The sheet's line with its values, or `null` when the sheet closes instead. */
  line: { key: MessageKey; values?: Record<string, number> } | null;
  /** The card is read again (closed, own, open). */
  reread: boolean;
  /** The sheet closes (own listing, open number). */
  close: boolean;
  /** The bar shows the closed bar for this number until the end of the launch (DEC-85). */
  closeHere: boolean;
}

/** The request limits of `GET /reference` (`limits.requests`, LB-APP-057). */
export interface RequestLimits {
  day: number;
  week: number;
  pauseMinutes: number;
}

/**
 * A refused request → its line and its effect (the table of SCR-061): `no_chat` (after the write-access attempt),
 * the three `rate_limited` reasons with the reference data's numbers, `requests_blocked`, `request_closed` (the card is
 * read again; the bar stays closed for this number), `own_listing` and `contact_open` (the sheet closes, the card is
 * read again), anything else «Не получилось сохранить».
 */
export function requestOutcome(failure: ApiFailure, limits: RequestLimits): RequestOutcome {
  const none = { reread: false, close: false, closeHere: false };
  switch (failure.code) {
    case "no_chat":
      return { ...none, line: { key: "contact.err.noChat" } };
    case "rate_limited": {
      const reason = failure.detail?.reason;
      if (reason === "requests_fast") {
        return { ...none, line: { key: "contact.err.requestsFast", values: { minutes: limits.pauseMinutes } } };
      }
      if (reason === "requests_week") {
        return { ...none, line: { key: "contact.err.requestsWeek", values: { week: limits.week } } };
      }
      if (reason === "requests_day") {
        return { ...none, line: { key: "contact.err.requestsDay", values: { day: limits.day } } };
      }
      // A 429 without a request reason (the API's own throttle): no limit is named.
      return { ...none, line: { key: "common.saveFailed" } };
    }
    case "requests_blocked":
      return { ...none, line: { key: "contact.err.blocked" } };
    case "request_closed":
      return { line: { key: "contact.err.closed" }, reread: true, close: false, closeHere: true };
    case "own_listing":
    case "contact_open":
      return { line: null, reread: true, close: true, closeHere: false };
    default:
      return { ...none, line: { key: "common.saveFailed" } };
  }
}
