import type { ApiEnvelope } from "@homi/types";

import { reportSource } from "@/lib/data/sources";
import { reauthenticate } from "@/lib/session/bootstrap";
import { getAuth } from "@/lib/session/store";

import { readTemplate } from "./bffAllowList";
import { failureOf } from "./errors";
import type { ApiResult } from "./types";

/**
 * Reads in the browser (WP-22, `25` §3.5): the same read a Server Component makes, through the pass-through
 * `/bff/<path>`. In header mode the bearer token of WP-21 is added; a `401` awaits `reauthenticate()` once and
 * repeats the read. The result is the `ApiResult` of the server calls; every success reports its `meta.source` for
 * the demo marker. An abort by the caller rejects with its `AbortError`; anything else resolves.
 */

export const BFF_TIMEOUT_MS = 15_000;

export interface BffOptions {
  query?: URLSearchParams | Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  /** `Accept-Language`; the document's `lang` by default. */
  locale?: string;
}

function search(query: BffOptions["query"]): string {
  const params = new URLSearchParams();
  if (query instanceof URLSearchParams) {
    for (const [key, value] of query) params.append(key, value);
  } else {
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text === "" ? "" : `?${text}`;
}

async function readOnce<T>(path: string, options: BffOptions): Promise<ApiResult<T>> {
  const where = { method: "GET", path: readTemplate(path) ?? path };
  const headers: Record<string, string> = { Accept: "application/json" };
  const locale = options.locale ?? document.documentElement.lang;
  if (locale !== "") {
    headers["Accept-Language"] = locale;
  }
  const auth = getAuth();
  if (auth.mode === "header") {
    headers.Authorization = `Bearer ${auth.token}`;
  }

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new DOMException("No answer in time.", "TimeoutError")), BFF_TIMEOUT_MS);
  const signal = options.signal === undefined ? timeout.signal : AbortSignal.any([options.signal, timeout.signal]);
  let response: Response;
  let text: string;
  try {
    response = await fetch(`/bff/${path}${search(options.query)}`, { headers, credentials: "same-origin", cache: "no-store", signal });
    text = await response.text();
  } catch (error) {
    if (options.signal?.aborted) {
      throw error;
    }
    return failureOf(where, timeout.signal.aborted ? "timeout" : "offline");
  } finally {
    clearTimeout(timer);
  }

  let body: ApiEnvelope<T> | null = null;
  try {
    body = text === "" ? null : (JSON.parse(text) as ApiEnvelope<T>);
  } catch {
    body = null;
  }
  if (response.ok && text === "") {
    return { ok: true, data: null as T, meta: {} };
  }
  if (!response.ok || body === null || body.success !== true) {
    const code = body !== null && body.success === false && typeof body.code === "string" ? body.code : undefined;
    return failureOf(where, { status: response.status, ...(code === undefined ? {} : { code }) });
  }
  const meta = body.meta ?? {};
  if (meta.source !== undefined) {
    reportSource(meta.source);
  }
  return { ok: true, data: body.data, meta };
}

export async function bffFetch<T = unknown>(path: string, options: BffOptions = {}): Promise<ApiResult<T>> {
  const first = await readOnce<T>(path, options);
  if (first.ok || first.error !== "unauthorized" || !(await reauthenticate())) {
    return first;
  }
  return readOnce<T>(path, options);
}
