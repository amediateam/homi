"use server";

import type { ReportDetail, ReportReason, ReportResult } from "@/features/listing/listingData";

import { runAction, type ActionAuth, type ActionResult } from "./run";
import { listingNumber, oneOf } from "./validate";

/** The reasons and details of `StoreReportRequest` (BR-API-101). */
const REASONS: readonly ReportReason[] = ["rented", "agent", "wrong_data", "fraud"];
const DETAILS: readonly ReportDetail[] = ["price", "rooms", "place", "photos", "other"];

/** A report of the actions sheet: `detail` comes with `wrong_data` and only with it. */
export interface ReportInput {
  number: number;
  reason: ReportReason;
  detail?: ReportDetail;
}

/**
 * The checked input; `null` unless it is an object with a listing number and a known reason, and a known detail is
 * given exactly when the reason is `wrong_data` (an absent or `undefined` detail counts as none).
 */
function inputOf(input: unknown): ReportInput | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const { number, reason, detail } = input as Record<string, unknown>;
  const checkedNumber = listingNumber(number);
  const checkedReason = oneOf(reason, REASONS);
  if (checkedNumber === null || checkedReason === null) {
    return null;
  }
  if (detail === undefined) {
    return checkedReason === "wrong_data" ? null : { number: checkedNumber, reason: checkedReason };
  }
  const checkedDetail = oneOf(detail, DETAILS);
  if (checkedDetail === null || checkedReason !== "wrong_data") {
    return null;
  }
  return { number: checkedNumber, reason: checkedReason, detail: checkedDetail };
}

/**
 * `POST /listings/{number}/reports` (WP-26, BR-API-101): the body is `{ reason }` or `{ reason, detail }`, never a
 * `detail: null`. The answer says whether the report hid the listing and, for an `agent` report, whether the author
 * is marked as a realtor (`agent_marked`, in the contract since the intake of `index-CIa0Ldj2.js`); an empty success
 * counts as neither. An input that fails its check makes no request.
 */
export async function reportListing(input: ReportInput, auth?: ActionAuth, locale?: string): Promise<ActionResult<ReportResult>> {
  const checked = inputOf(input);
  if (checked === null) {
    return runAction.invalid("POST", "listings/:number/reports");
  }
  const { number, reason, detail } = checked;
  const result = await runAction(auth, locale, (api) => api.report(number, detail === undefined ? { reason } : { reason, detail }));
  if (!result.ok) {
    return result;
  }
  // A 204 or an empty 200 reaches here with `data: null` (`@homi/api-client`), whatever the generated type says.
  const data = result.data as ReportResult | null;
  return { ...result, data: { hidden: data?.hidden === true, agent_marked: data?.agent_marked === true } };
}
