"use server";

import { runAction, type ActionAuth, type ActionResult } from "./run";

/**
 * `DELETE /history` (WP-29, BR-APP-067): «Очистить» of the history list. It takes no input; any 2xx is a success and
 * the body is not read, so the data is `null`.
 */
export async function clearHistory(_input?: undefined, auth?: ActionAuth, locale?: string): Promise<ActionResult<null>> {
  return runAction(auth, locale, (api) => api.clearHistory());
}
