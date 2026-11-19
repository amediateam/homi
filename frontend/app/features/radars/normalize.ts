import { normalizeFilters, type SearchFilters } from "@homi/search";

import type { ListingPreview } from "@/features/feed/types";
import { type LiveFlow, normalizeFlow } from "@/features/filters/flow";

/**
 * The radar answers of WP-13 as the screens read them (WP-30): total functions, so a malformed field degrades to a
 * default and never reaches a screen as `undefined` (the fixes of LB-APP-002 and LB-APP-005). Every flow passes
 * `normalizeFlow` of WP-25 and every filter set `normalizeFilters`.
 *
 * No directive, so a Server Component normalises its read too (`normalizeFlow` lives in `features/filters/flow.ts`
 * for that reason).
 */

/** How a radar delivers (SCR-028): at once, or in the digest at the user's hours. */
export type RadarMode = "instant" | "digest";

/** `preview` of `GET /radars?include=previews` (BR-APP-063): the newest finds, the count that matches now, the flow. */
export interface RadarPreview {
  items: ListingPreview[];
  count: number | null;
  flow: LiveFlow | null;
}

export interface Radar {
  id: string;
  active: boolean;
  mode: RadarMode;
  /** Listings the user hid from this radar («Скрыто: N — Вернуть»). */
  hidden: number;
  filters: SearchFilters;
  createdAt: string | null;
  /** Absent when the list was read without `include=previews`; `null` when the server could not compute it. */
  preview?: RadarPreview | null;
}

/** A way to widen a radar that found few listings (the «Расширить» of the few toast); server strings, shown as text. */
export interface RadarOption {
  code: string;
  label: string;
  rate: string;
  count: number | null;
}

/** `POST /radars` and `PUT /radars/{id}`: what the server did, the starter count and the ways to widen. */
export interface RadarMutation {
  radar: Radar | null;
  kind: "created" | "existing" | "reactivated" | "updated";
  starter: number;
  options: RadarOption[];
  relaxed: { text: string }[];
}

/** `PATCH /radars/{id}` and `POST /radars/{id}/relax`: the radar, the starter count, whether to ask «Нашли жильё?». */
export interface RadarPatch {
  radar: Radar | null;
  starter: number;
  askFound: boolean;
}

/** The finds of a preview (BR-APP-063, legacy `useRadarPreviews`). */
export const PREVIEW_ITEMS = 5;

const KINDS: readonly RadarMutation["kind"][] = ["created", "existing", "reactivated", "updated"];
/** The id rule of the WP-13 contract (`isRadarId` of `lib/navigation/routes.ts`, `ulid` of the actions). */
const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i;
/** An option code the relax request accepts (`RelaxRadarRequest.code`); an option with another code is unusable. */
const OPTION_CODE = /^[a-z_]{1,32}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A finite, non-negative number; anything else is `null` (a count the screen hides). */
const countOf = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);

/** A non-negative integer; anything else is `0`. */
const integerOf = (value: unknown): number => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0);

/**
 * The starter count: a finite number, a numeric string included (legacy compared `starter > 0` with JavaScript's
 * coercion, so `"12"` showed the count toast), as a whole number of at least 0; anything else is `0`.
 */
function starterOf(value: unknown): number {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function itemOf(value: unknown): ListingPreview | null {
  return isRecord(value) && typeof value.number === "number" && Number.isSafeInteger(value.number) && value.number > 0
    ? (value as unknown as ListingPreview)
    : null;
}

function previewOf(value: unknown): RadarPreview | null {
  if (!isRecord(value)) {
    return null;
  }
  const items = Array.isArray(value.items) ? value.items.map(itemOf).filter((item) => item !== null) : [];
  return { items: items.slice(0, PREVIEW_ITEMS), count: countOf(value.count), flow: normalizeFlow(value.flow) };
}

/**
 * One radar of the contract, or `null` when it is not an object with a ULID `id` (nothing could act on it). An
 * unknown `mode` reads as `instant` (legacy crashed the tile, LB-APP-002); `active` is `true` only when it is `true`;
 * `hidden` is a non-negative integer, else `0`; a missing filter key takes its default. `preview` is copied only when
 * the answer has the key.
 */
export function normalizeRadar(raw: unknown): Radar | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !ULID.test(raw.id)) {
    return null;
  }
  const radar: Radar = {
    id: raw.id,
    active: raw.active === true,
    mode: raw.mode === "digest" ? "digest" : "instant",
    hidden: integerOf(raw.hidden),
    filters: normalizeFilters(raw.filters),
    createdAt: typeof raw.created_at === "string" && raw.created_at !== "" ? raw.created_at : null,
  };
  if (Object.hasOwn(raw, "preview")) {
    radar.preview = previewOf(raw.preview);
  }
  return radar;
}

/** `GET /radars`: the radars that normalise, in the server's order (creation order), each id once; not a list → `[]`. */
export function normalizeRadarList(raw: unknown): Radar[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const list: Radar[] = [];
  for (const item of raw) {
    const radar = normalizeRadar(item);
    if (radar !== null && !seen.has(radar.id.toUpperCase())) {
      seen.add(radar.id.toUpperCase());
      list.push(radar);
    }
  }
  return list;
}

function optionOf(value: unknown): RadarOption | null {
  if (!isRecord(value)) {
    return null;
  }
  const { code, label, rate, count } = value;
  if (typeof code !== "string" || !OPTION_CODE.test(code) || typeof label !== "string" || typeof rate !== "string") {
    return null;
  }
  return { code, label, rate, count: countOf(count) };
}

function relaxedOf(value: unknown): { text: string } | null {
  return isRecord(value) && typeof value.text === "string" && value.text !== "" ? { text: value.text } : null;
}

/**
 * The answer of a create or a replace (subscribe flow step 6): `options` and `relaxed` are arrays whatever came
 * (missing, `null`, malformed entries dropped), `starter` is a whole number (`starterOf`), and an unknown `kind` reads
 * as `created`, so a request that succeeded always ends in a success toast (the fix of LB-APP-005).
 */
export function normalizeMutation(raw: unknown): RadarMutation {
  const value = isRecord(raw) ? raw : {};
  const kind = KINDS.find((known) => known === value.kind) ?? "created";
  return {
    radar: normalizeRadar(value.radar),
    kind,
    starter: starterOf(value.starter),
    options: Array.isArray(value.options) ? value.options.map(optionOf).filter((option) => option !== null) : [],
    relaxed: Array.isArray(value.relaxed) ? value.relaxed.map(relaxedOf).filter((item) => item !== null) : [],
  };
}

/** The answer of a patch or a widen: the radar, `starter` as in `normalizeMutation`, `askFound` only for `true`. */
export function normalizePatch(raw: unknown): RadarPatch {
  const value = isRecord(raw) ? raw : {};
  return { radar: normalizeRadar(value.radar), starter: starterOf(value.starter), askFound: value.ask_found === true };
}
