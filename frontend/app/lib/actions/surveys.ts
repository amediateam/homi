"use server";

import type { components } from "@homi/types";

import { runAction, type ActionAuth, type ActionResult } from "./run";
import { oneOf } from "./validate";

type FoundAnswer = components["schemas"]["StoreFoundAnswerRequest"];
type FoundWhere = components["schemas"]["StoreFoundWhereRequest"];

/** The answers of «Нашли жильё?» (SCR-031; the legacy `kvadro` is `homi`, DEC-40) and what asked the question. */
const ANSWERS: readonly FoundAnswer["answer"][] = ["homi", "elsewhere", "searching", "stopped"];
const TRIGGERS: readonly FoundAnswer["trigger"][] = ["pause", "delete"];
/** Where the home was found, the step after «Нашли в другом месте». */
const WHERE: readonly FoundWhere["where"][] = ["telegram", "olx", "site", "agent", "friends", "street", "other"];

export type FoundInput = FoundAnswer;
export type FoundWhereInput = FoundWhere;

/**
 * `POST /surveys/found` (WP-30, BR-APP-049): the answer of the survey after a pause or a delete. The answer is a
 * 204, so the data is `null`. An input that fails its check makes no request and answers `validation`.
 */
export async function sendFound(input: FoundInput, auth?: ActionAuth, locale?: string): Promise<ActionResult<null>> {
  const raw = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const answer = oneOf(raw.answer, ANSWERS);
  const trigger = oneOf(raw.trigger, TRIGGERS);
  if (answer === null || trigger === null) {
    return runAction.invalid("POST", "surveys/found");
  }
  return runAction(auth, locale, (api) => api.found({ answer, trigger }));
}

/** `POST /surveys/found/where` (WP-30): where the home was found; a 204. An input that fails its check makes no request. */
export async function sendFoundWhere(input: FoundWhereInput, auth?: ActionAuth, locale?: string): Promise<ActionResult<null>> {
  const raw = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const where = oneOf(raw.where, WHERE);
  if (where === null) {
    return runAction.invalid("POST", "surveys/found/where");
  }
  return runAction(auth, locale, (api) => api.foundWhere({ where }));
}
