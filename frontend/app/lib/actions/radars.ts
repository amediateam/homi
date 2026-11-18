"use server";

import { normalizeFilters, type RadarFilters, toRadarFilters } from "@homi/search";
import type { components } from "@homi/types";

import { runAction, type ActionAuth, type ActionResult } from "./run";
import { oneOf, ulid } from "./validate";

type Schemas = components["schemas"];
type RadarEntry = Schemas["StoreRadarRequest"]["entry"];
type RadarMode = Schemas["RadarMode"];

/** `POST /radars` and `PUT /radars/{id}` answer (WP-13); the caller reads it through `normalizeMutation`. */
export type RadarMutationBody = Schemas["RadarMutationResource"];
/** `PATCH /radars/{id}` and `POST /radars/{id}/relax` answer; the caller reads it through `normalizePatch`. */
export type RadarPatchBody = Schemas["RadarPatchResource"];

/** Where a radar was turned on (BR-APP-041, BR-API-086): the `entry` enum of `StoreRadarRequest`. */
const ENTRIES: readonly RadarEntry[] = ["filters", "empty", "few", "prompt", "feed", "return"];
const MODES: readonly RadarMode[] = ["instant", "digest"];
/** A relax option's code: the rule of `relaxed` and of `RelaxRadarRequest.code` on the server. */
const RELAX_CODE = /^[a-z_]{1,32}$/;

export interface CreateRadarInput {
  filters: RadarFilters;
  entry: RadarEntry;
  /** The code of the relax chip the user chose in the footer; absent or `null` when none was. */
  relaxed?: string | null;
}

export interface ReplaceRadarInput {
  id: string;
  filters: RadarFilters;
  relaxed?: string | null;
}

/** Exactly one change (BR-APP-048): switch on or pause, the delivery mode, or «Вернуть» of the hidden listings. */
export type PatchRadarInput = { id: string; active: boolean } | { id: string; mode: RadarMode } | { id: string; unhide: true };

export interface RadarIdInput {
  id: string;
}

export interface RelaxRadarInput {
  id: string;
  code: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The filters of a radar body: an object with at least one key, normalised again here (SEC-REQ-017, nothing from the
 * client is trusted) into the 25 keys of `toRadarFilters`. The caller already applied its rules (`posted_days` of
 * `dev005RadarDropsPostedDays`), and normalising with the default rules keeps what it chose. `null` otherwise; the API
 * checks every value once more.
 */
function filtersOf(value: unknown): RadarFilters | null {
  return isRecord(value) && Object.keys(value).length > 0 ? toRadarFilters(normalizeFilters(value)) : null;
}

/** `relaxed`: `undefined` leaves it out of the body (no chip chosen, `null` too), a code is sent, anything else fails. */
function relaxedOf(value: unknown): { ok: true; relaxed?: string } | { ok: false } {
  if (value === undefined || value === null) {
    return { ok: true };
  }
  return typeof value === "string" && RELAX_CODE.test(value) ? { ok: true, relaxed: value } : { ok: false };
}

/**
 * `POST /radars` (WP-30, subscribe flow step 4): the filters, where the radar was turned on, and the relax chip when
 * one was chosen. The answer says what the server did (`kind`: created, existing, reactivated). An input that fails
 * its check makes no request and answers `validation`.
 */
export async function createRadar(input: CreateRadarInput, auth?: ActionAuth, locale?: string): Promise<ActionResult<RadarMutationBody>> {
  const raw: Record<string, unknown> = isRecord(input) ? input : {};
  const filters = filtersOf(raw.filters);
  const entry = oneOf(raw.entry, ENTRIES);
  const relaxed = relaxedOf(raw.relaxed);
  if (filters === null || entry === null || !relaxed.ok) {
    return runAction.invalid("POST", "radars");
  }
  const body = relaxed.relaxed === undefined ? { filters, entry } : { filters, entry, relaxed: relaxed.relaxed };
  return runAction(auth, locale, (api) => api.createRadar(body));
}

/**
 * `PUT /radars/{id}` (WP-30, «Сохранить» of the editor, SCR-029): new filters, `active` and `mode` kept by the
 * server. An input that fails its check makes no request.
 */
export async function replaceRadar(input: ReplaceRadarInput, auth?: ActionAuth, locale?: string): Promise<ActionResult<RadarMutationBody>> {
  const raw: Record<string, unknown> = isRecord(input) ? input : {};
  const id = ulid(raw.id);
  const filters = filtersOf(raw.filters);
  const relaxed = relaxedOf(raw.relaxed);
  if (id === null || filters === null || !relaxed.ok) {
    return runAction.invalid("PUT", "radars/:id");
  }
  const body = relaxed.relaxed === undefined ? { filters } : { filters, relaxed: relaxed.relaxed };
  return runAction(auth, locale, (api) => api.replaceRadar(id, body));
}

/** The one change of a patch; `null` unless exactly one of `active`, `mode`, `unhide` is present and valid. */
function changeOf(raw: Record<string, unknown>): Schemas["PatchRadarRequest"] | null {
  const present = (["active", "mode", "unhide"] as const).filter((key) => raw[key] !== undefined);
  if (present.length !== 1) {
    return null;
  }
  if (present[0] === "active") {
    return typeof raw.active === "boolean" ? { active: raw.active } : null;
  }
  if (present[0] === "mode") {
    const mode = oneOf(raw.mode, MODES);
    return mode === null ? null : { mode };
  }
  return raw.unhide === true ? { unhide: true } : null;
}

/**
 * `PATCH /radars/{id}` (WP-30, the switch, the mode rows and «Вернуть» of the radar sheet): exactly one change, as
 * the server demands; `unhide` only as `true`. Pausing answers `ask_found` (the survey), switching on `starter`. An
 * input that fails its check makes no request.
 */
export async function patchRadar(input: PatchRadarInput, auth?: ActionAuth, locale?: string): Promise<ActionResult<RadarPatchBody>> {
  const raw: Record<string, unknown> = isRecord(input) ? input : {};
  const id = ulid(raw.id);
  const change = changeOf(raw);
  if (id === null || change === null) {
    return runAction.invalid("PATCH", "radars/:id");
  }
  return runAction(auth, locale, (api) => api.patchRadar(id, change));
}

/**
 * `DELETE /radars/{id}` (WP-30, «Удалить радар»; not behind the radar switch). The answer is `{ ask_found }`, read
 * strictly: anything but `true` (an empty answer included) is `false`. An input that fails its check makes no request.
 */
export async function deleteRadar(input: RadarIdInput, auth?: ActionAuth, locale?: string): Promise<ActionResult<{ ask_found: boolean }>> {
  const id = ulid(isRecord(input) ? input.id : undefined);
  if (id === null) {
    return runAction.invalid("DELETE", "radars/:id");
  }
  const result = await runAction(auth, locale, (api) => api.deleteRadar(id));
  if (!result.ok) {
    return result;
  }
  const data = result.data as { ask_found?: unknown } | null;
  return { ...result, data: { ask_found: data?.ask_found === true } };
}

/**
 * `POST /radars/{id}/relax` (WP-30, «Расширить» of the few toast): the code of the option the server offered. An
 * input that fails its check makes no request.
 */
export async function relaxRadar(input: RelaxRadarInput, auth?: ActionAuth, locale?: string): Promise<ActionResult<RadarPatchBody>> {
  const raw: Record<string, unknown> = isRecord(input) ? input : {};
  const id = ulid(raw.id);
  const code = typeof raw.code === "string" && RELAX_CODE.test(raw.code) ? raw.code : null;
  if (id === null || code === null) {
    return runAction.invalid("POST", "radars/:id/relax");
  }
  return runAction(auth, locale, (api) => api.relaxRadar(id, { code }));
}
