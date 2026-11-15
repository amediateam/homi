import "server-only";

import {
  ApiError,
  createApiClient,
  type HttpMethod,
  type JsonBody,
  type OperationOf,
  type PathsWith,
  type RequestOptions,
  type SuccessData,
} from "@homi/api-client";
import { isLocale, type Locale } from "@homi/config";
import type { ApiSuccess } from "@homi/types";
import { cookies } from "next/headers";
import { locale as rootLocale } from "next/root-params";

import { apiBaseUrl, getSessionToken } from "@/lib/session/server";

import { type ApiFailure, failureOf } from "./errors";
import { STUB_SCENARIO_COOKIE, stubScenarioHeaders } from "./scenario";

/**
 * Typed server calls of `/api/v1` (WP-22, DEC-44, `25` §3.1): one function per method of `25` §4.2, with the
 * session's token, the locale as `Accept-Language` (`uz` stays `uz`), a 15 s timeout and a request id. A call never
 * throws for an answer of the API: it returns `ApiResult`. Pages call it inside `<Suspense>` — nothing per-user is
 * cached; only `lib/reference` caches, through `publicApi` (no token, no stub scenario).
 */

export const API_TIMEOUT_MS = 15_000;

export type ApiMeta = NonNullable<ApiSuccess<unknown>["meta"]>;
export type ApiResult<T> = { ok: true; data: T; meta: ApiMeta } | ApiFailure;

type Query = NonNullable<RequestOptions["query"]>;
type Data<P extends keyof import("@homi/types").paths, M extends HttpMethod> = SuccessData<OperationOf<P, M>>;
type Body<P extends keyof import("@homi/types").paths, M extends HttpMethod> = JsonBody<OperationOf<P, M>>;

interface CallOptions {
  params?: Record<string, string | number>;
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
}

export interface ServerApiConfig {
  token: string | null;
  locale: Locale;
  /** The value of the stub-scenario cookie; `stubScenarioHeaders` decides whether it is forwarded. */
  scenario: string | null;
}

function requestId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

/** `/listings/{number}` → `listings/:number`, the form an error object carries. */
function template(path: string): string {
  return path.replace(/^\/+/, "").replace(/\{(\w+)\}/g, ":$1");
}

function fill(path: string, params: Record<string, string | number>): string {
  return path.replace(/\{(\w+)\}/g, (_segment, name: string) => encodeURIComponent(String(params[name])));
}

export function createServerApi(config: ServerApiConfig) {
  const client = createApiClient({
    baseUrl: apiBaseUrl(),
    getToken: () => config.token,
    getLocale: () => config.locale,
  });

  async function call<M extends HttpMethod, P extends PathsWith<M>>(
    method: M,
    path: P,
    options: CallOptions = {},
  ): Promise<ApiResult<Data<P, M>>> {
    const where = { method: method.toUpperCase(), path: template(path) };
    // A timer of its own rather than `AbortSignal.timeout`, so the clock of a test drives it.
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new DOMException("The API did not answer in time.", "TimeoutError")), API_TIMEOUT_MS);
    const signal = options.signal === undefined ? timeout.signal : AbortSignal.any([options.signal, timeout.signal]);
    try {
      const answer = await client.request<Data<P, M>>(fill(path, options.params ?? {}), {
        method: where.method as NonNullable<RequestOptions["method"]>,
        query: options.query,
        body: options.body,
        signal,
        anonymous: config.token === null,
        headers: { "X-Request-Id": requestId(), ...stubScenarioHeaders(config.scenario) },
      });
      return { ok: true, data: answer.data, meta: answer.meta ?? {} };
    } catch (error) {
      if (error instanceof ApiError) {
        return failureOf(where, { status: error.status, ...(error.code === "unknown" ? {} : { code: error.code }) });
      }
      if (options.signal?.aborted) {
        throw error;
      }
      return failureOf(where, timeout.signal.aborted ? "timeout" : "offline");
    } finally {
      clearTimeout(timer);
    }
  }

  const number = (value: number) => ({ number: value });
  const id = (value: string) => ({ id: value });

  return {
    call,
    me: () => call("get", "/me"),
    settings: () => call("get", "/settings"),
    updateSettings: (body: Body<"/settings", "patch">) => call("patch", "/settings", { body }),
    reference: () => call("get", "/reference"),
    cities: () => call("get", "/cities"),
    listings: (query: Query) => call("get", "/listings", { query }),
    listingsCount: (query: Query) => call("get", "/listings/count", { query }),
    listingsNew: (query: Query) => call("get", "/listings/new", { query }),
    listingsFlow: (query: Query) => call("get", "/listings/flow", { query }),
    listingsMap: (query: Query) => call("get", "/listings/map", { query }),
    listing: (value: number, query?: Query) => call("get", "/listings/{number}", { params: number(value), query }),
    contact: (value: number) => call("post", "/listings/{number}/contact", { params: number(value) }),
    translation: (value: number) => call("post", "/listings/{number}/translation", { params: number(value) }),
    share: (value: number) => call("post", "/listings/{number}/share", { params: number(value) }),
    favorites: (query?: Query) => call("get", "/favorites", { query }),
    putFavorite: (value: number) => call("put", "/favorites/{number}", { params: number(value) }),
    deleteFavorite: (value: number) => call("delete", "/favorites/{number}", { params: number(value) }),
    history: (query?: Query) => call("get", "/history", { query }),
    clearHistory: () => call("delete", "/history"),
    hideListing: (value: number) => call("put", "/hidden/listings/{number}", { params: number(value) }),
    unhideListing: (value: number) => call("delete", "/hidden/listings/{number}", { params: number(value) }),
    blockAuthor: (value: number) => call("put", "/listings/{number}/blocked-author", { params: number(value) }),
    unblockAuthor: (value: number) => call("delete", "/listings/{number}/blocked-author", { params: number(value) }),
    hidden: () => call("get", "/hidden"),
    unblockAuthorById: (value: string) => call("delete", "/hidden/authors/{id}", { params: id(value) }),
    unhideAll: () => call("delete", "/hidden"),
    report: (value: number, body: Body<"/listings/{number}/reports", "post">) =>
      call("post", "/listings/{number}/reports", { params: number(value), body }),
    found: (body: Body<"/surveys/found", "post">) => call("post", "/surveys/found", { body }),
    foundWhere: (body: Body<"/surveys/found/where", "post">) => call("post", "/surveys/found/where", { body }),
    radars: () => call("get", "/radars"),
    createRadar: (body: Body<"/radars", "post">) => call("post", "/radars", { body }),
    replaceRadar: (value: string, body: Body<"/radars/{id}", "put">) => call("put", "/radars/{id}", { params: id(value), body }),
    patchRadar: (value: string, body: Body<"/radars/{id}", "patch">) => call("patch", "/radars/{id}", { params: id(value), body }),
    deleteRadar: (value: string) => call("delete", "/radars/{id}", { params: id(value) }),
    relaxRadar: (value: string) => call("post", "/radars/{id}/relax", { params: id(value) }),
    events: (body: Body<"/events", "post">) => call("post", "/events", { body }),
    landingLive: () => call("get", "/landing/live"),
    landingPins: () => call("get", "/landing/pins"),
  };
}

export type ServerApi = ReturnType<typeof createServerApi>;

/**
 * The API as the signed-in user of this request: the token of the `homi_session` cookie, else `auth.token` (header
 * mode, passed by a Server Action). The locale comes from the root parameter in Server Components; Server Actions
 * and Route Handlers pass it, because the getter does not run there (`next-root-params.md`).
 */
export async function serverApi(auth?: { token?: string }, locale?: Locale): Promise<ServerApi> {
  const store = await cookies();
  const token = (await getSessionToken()) ?? auth?.token ?? null;
  return createServerApi({
    token,
    locale: locale ?? (await requestLocale()),
    scenario: store.get(STUB_SCENARIO_COOKIE)?.value ?? null,
  });
}

/** Public methods without a user: no token and no stub scenario, so the answer may be cached (`lib/reference`). */
export function publicApi(locale: Locale): ServerApi {
  return createServerApi({ token: null, locale, scenario: null });
}

async function requestLocale(): Promise<Locale> {
  const value = await rootLocale();
  return typeof value === "string" && isLocale(value) ? value : "ru";
}
