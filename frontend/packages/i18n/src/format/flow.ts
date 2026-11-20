import type { MessageKey } from "../messages";
import type { Translate } from "./number";

/** How often a radar would fire for a search (BR-APP-044). */
export type FlowRate = { kind: "none" } | { kind: "week"; n: number } | { kind: "day"; n: number };

/** The filters sheet footer, a radar tile, the follow nudge. */
export type FlowSurface = "sheet" | "tile" | "nudge";

/** `oneVocabulary` is `dev021OneFlowVocabulary` (LB-APP-033), filled by the caller. */
export type FlowOptions = { oneVocabulary?: boolean };

/** Legacy keys per surface; the nudge words a non-empty week like a tile. */
const VOCABULARY: Record<FlowSurface, Record<FlowRate["kind"], MessageKey>> = {
  sheet: { none: "sheet.flowNone", week: "sheet.flowWeek", day: "sheet.flowDay" },
  tile: { none: "alert.rare", week: "alert.week", day: "alert.day" },
  nudge: { none: "nudge.none", week: "alert.week", day: "alert.day" },
};

/**
 * The rate of a flow answer `{ week, days }`: `null` unless it is an object with a non-negative numeric `week` and
 * `days > 0`; `week = 0` → none; under one a day → the weekly count; else the daily count rounded.
 */
export function flowRate(flow: unknown): FlowRate | null {
  if (typeof flow !== "object" || flow === null) {
    return null;
  }
  const { week, days } = flow as { week?: unknown; days?: unknown };
  if (typeof week !== "number" || !Number.isFinite(week) || week < 0) {
    return null;
  }
  if (typeof days !== "number" || !Number.isFinite(days) || days <= 0) {
    return null;
  }
  if (week === 0) {
    return { kind: "none" };
  }
  const perDay = week / days;
  return perDay < 1 ? { kind: "week", n: week } : { kind: "day", n: Math.round(perDay) };
}

/**
 * The flow line in parts — its message and its number — so a surface can show the number rolling (WP-39,
 * BR-APP-113; legacy `flowParts`). `null` without a rate and for "none this week", whose line has no number:
 * `formatFlow` words that one. The vocabulary is `formatFlow`'s.
 */
export function flowParts(
  rate: FlowRate | null,
  surface: FlowSurface,
  { oneVocabulary = false }: FlowOptions = {},
): { key: MessageKey; n: number } | null {
  if (!rate || rate.kind === "none") {
    return null;
  }
  return { key: VOCABULARY[oneVocabulary ? "sheet" : surface][rate.kind], n: rate.n };
}

/**
 * The flow line of a surface; `null` without a rate (no line is rendered). Legacy words "none this week" three
 * ways and the counts two ways (LB-APP-033); `oneVocabulary` on uses the sheet vocabulary on every surface.
 */
export function formatFlow(
  rate: FlowRate | null,
  surface: FlowSurface,
  t: Translate,
  { oneVocabulary = false }: FlowOptions = {},
): string | null {
  if (!rate) {
    return null;
  }
  const key = VOCABULARY[oneVocabulary ? "sheet" : surface][rate.kind];
  return rate.kind === "none" ? t(key) : t(key, { n: rate.n });
}
