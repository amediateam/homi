"use client";

import { useLocale } from "next-intl";
import { useCallback } from "react";

import { failureOf } from "@/lib/api/errors";
import type { ApiResult } from "@/lib/api/types";
import { reportSource } from "@/lib/data/sources";
import { reauthenticate } from "@/lib/session/bootstrap";
import { getAuth } from "@/lib/session/store";

/** The shape of every Server Action (`./run`): `(input, auth?, locale?)` → `ApiResult`. */
export type Action<I, T> = (input: I, auth?: { token?: string }, locale?: string) => Promise<ApiResult<T>>;

/**
 * Calls a Server Action the way `runAction` expects (WP-22): the token in header mode (in the action's request
 * body), the locale, one `reauthenticate()` and repeat on `unauthorized`, and the `meta.source` report of the demo
 * marker. An action that cannot be reached resolves `offline` instead of throwing. This is the form for code outside
 * a component (WP-30: the subscribe flow gets it as a dependency); components use `useAction`.
 */
export async function invokeAction<I, T>(action: Action<I, T>, input: I, locale: string): Promise<ApiResult<T>> {
  const call = async (): Promise<ApiResult<T>> => {
    const auth = getAuth();
    try {
      return await action(input, auth.mode === "header" ? { token: auth.token } : undefined, locale);
    } catch {
      return failureOf({ method: "ACTION", path: action.name || "action" }, "offline");
    }
  };
  let result = await call();
  if (!result.ok && result.error === "unauthorized" && (await reauthenticate())) {
    result = await call();
  }
  if (result.ok && result.meta.source !== undefined) {
    reportSource(result.meta.source);
  }
  return result;
}

/** `invokeAction` bound to the locale of the page (WP-22). */
export function useAction<I, T>(action: Action<I, T>): (input: I) => Promise<ApiResult<T>> {
  const locale = useLocale();
  return useCallback((input: I) => invokeAction(action, input, locale), [action, locale]);
}
