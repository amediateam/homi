import "server-only";

import { isLocale, type Locale } from "@homi/config";
import { cookies } from "next/headers";

import { failureOf } from "@/lib/api/errors";
import { STUB_SCENARIO_COOKIE } from "@/lib/api/scenario";
import { createServerApi, type ServerApi } from "@/lib/api/server";
import type { ApiResult } from "@/lib/api/types";
import { getSessionToken } from "@/lib/session/server";

/**
 * The one shape of a Server Action (WP-22, `25` §3.5). Every action is `'use server'`, takes
 * `(input, auth?: { token?: string }, locale?)`, validates its input (`./validate`) and returns
 * `runAction(auth, locale, (api) => …)`. The token is the cookie's (cookie mode), else the argument's (header mode,
 * sent by `useAction` in the action's request body, never in an address); without one nothing is requested. Each
 * action re-reads the session itself, and nothing per-user is cached, so no action revalidates.
 */
export type ActionResult<T> = ApiResult<T>;
export type ActionAuth = { token?: string } | undefined;

export async function runAction<T>(auth: ActionAuth, locale: string | undefined, fn: (api: ServerApi) => Promise<ApiResult<T>>): Promise<ActionResult<T>> {
  const token = (await getSessionToken()) ?? (typeof auth?.token === "string" && auth.token !== "" ? auth.token : null);
  if (token === null) {
    return failureOf({ method: "ACTION", path: "session" }, { status: 401, code: "unauthenticated" });
  }
  const store = await cookies();
  const api = createServerApi({
    token,
    locale: typeof locale === "string" && isLocale(locale) ? (locale as Locale) : "ru",
    scenario: store.get(STUB_SCENARIO_COOKIE)?.value ?? null,
  });
  return fn(api);
}

/** The answer of an action whose input failed its check: `validation`, and no request was made. */
runAction.invalid = (method: string, path: string): ActionResult<never> => failureOf({ method, path }, { status: 422, code: "validation_failed" });
