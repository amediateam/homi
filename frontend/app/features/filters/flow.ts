/**
 * The flow answer of `GET /listings/flow` and its one validator (WP-25), in a module without a directive: the radar
 * normalisers (WP-30) run on the server too, where an import of the client module `useLiveStats` would be a client
 * reference.
 */

/** One relax option of `GET /listings/flow` (`FlowOptionResource`): server strings, shown as text (SEC-REQ-021). */
export type LiveFlowOption = { code: string; label: string; rate: string; count: number | null; filters: unknown };

/** `GET /listings/flow` (`FlowResource`): the matches of the last `days` days, `week` of them in total. */
export type LiveFlow = { week: number; days: number; options: readonly LiveFlowOption[] };

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A finite, non-negative number: a count or the `week` / `days` of a flow. */
export const isCount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

function optionOf(value: unknown): LiveFlowOption | null {
  if (!isRecord(value)) {
    return null;
  }
  const { code, label, rate, count, filters } = value;
  if (typeof code !== "string" || typeof label !== "string" || typeof rate !== "string" || !isRecord(filters)) {
    return null;
  }
  return { code, label, rate, count: isCount(count) ? count : null, filters };
}

/**
 * The one validator of a flow answer (WP-25; WP-30 uses it for the follow nudge and the radar sheet): `null` unless
 * the value is an object with a finite, non-negative `week` and a `days` above zero, which hides the flow line and the
 * relax chips. An option is kept only when it has string `code`, `label` and `rate` and an object `filters` — the
 * filters are re-normalised by whoever takes the option (SEC-REQ-017); a malformed one is dropped, never the answer.
 */
export function normalizeFlow(value: unknown): LiveFlow | null {
  if (!isRecord(value)) {
    return null;
  }
  const { week, days, options } = value;
  if (!isCount(week) || !isCount(days) || days === 0) {
    return null;
  }
  const list = Array.isArray(options) ? options.map(optionOf).filter((option) => option !== null) : [];
  return { week, days, options: list };
}
