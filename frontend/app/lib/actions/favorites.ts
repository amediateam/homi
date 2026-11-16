"use server";

import type { components } from "@homi/types";

import { runAction, type ActionAuth, type ActionResult } from "./run";
import { listingNumber } from "./validate";

type FavoriteState = components["schemas"]["FavoriteStateResource"];

/** The heart's new state for one listing (BR-APP-039). */
export interface FavoriteInput {
  number: number;
  on: boolean;
}

/** The checked input; `null` unless it is an object with a listing number and a boolean `on`. */
function inputOf(input: unknown): FavoriteInput | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const { number, on } = input as Record<string, unknown>;
  const valid = listingNumber(number);
  return valid !== null && typeof on === "boolean" ? { number: valid, on } : null;
}

/**
 * `PUT /favorites/{number}` when `on`, `DELETE /favorites/{number}` otherwise (WP-24, DEC-41: explicit and
 * idempotent, never a toggle). An input that fails its check makes no request and answers `validation`.
 */
export async function setFavorite(input: FavoriteInput, auth?: ActionAuth, locale?: string): Promise<ActionResult<FavoriteState>> {
  const checked = inputOf(input);
  if (checked === null) {
    return runAction.invalid("PUT", "favorites/:number");
  }
  const { number, on } = checked;
  return runAction(auth, locale, (api) => (on ? api.putFavorite(number) : api.deleteFavorite(number)));
}
