import { isApiFailure, type ApiEnvelope, type ApiSuccess } from "@homi/types";

/**
 * Minimal typed client for the HOMI API envelope (ADR-0003 bearer tokens, ADR-0007 envelope).
 * Modelled on the port plan for app.uz `frontend/lendo/lib/api.ts` (docs/reference-codebase, A3):
 * native fetch, envelope unwrapping, ApiError with status, code and validation errors, no refresh logic.
 * `createTypedClient` (./typed) types calls from the generated OpenAPI paths on top of this.
 */

export class ApiError extends Error {
  readonly status: number;
  /** The envelope's `code`; `unknown` when the answer had no envelope (an nginx 502 page, a network proxy). */
  readonly code: string;
  readonly errors?: Record<string, string[]>;
  /** The envelope's `reason` when it is a string: the access gate's reason, `daily` on the day limit's `429`. */
  readonly reason?: string;
  /** `409 owner_limit` (WP-80): `limit` (`account` or `phone`) when a string, `max` when a number. */
  readonly limit?: string;
  readonly max?: number;

  constructor(
    message: string,
    status: number,
    code = "unknown",
    errors?: Record<string, string[]>,
    reason?: string,
    limits: { limit?: string; max?: number } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.errors = errors;
    this.reason = reason;
    this.limit = limits.limit;
    this.max = limits.max;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isValidation(): boolean {
    return this.status === 422;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

export interface ApiClientOptions {
  /** e.g. https://api.homi.loc/api/v1 (NEXT_PUBLIC_API_URL) */
  baseUrl: string;
  /** Returns the current bearer token or null for anonymous requests. */
  getToken?: () => string | null | Promise<string | null>;
  /** Called on 401 so the app can clear its session. */
  onUnauthorized?: () => void;
  /** Accept-Language value, e.g. the user's locale. */
  getLocale?: () => string | undefined;
  fetch?: typeof fetch;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** A record of scalars, or `URLSearchParams` for repeated keys (`types[]=a&types[]=b`, WP-12 list filters). */
  query?: Record<string, string | number | boolean | undefined> | URLSearchParams;
  anonymous?: boolean;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<ApiSuccess<T>>;
  get<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<ApiSuccess<T>>;
  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<ApiSuccess<T>>;
  put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<ApiSuccess<T>>;
  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<ApiSuccess<T>>;
  delete<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<ApiSuccess<T>>;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetch ?? fetch;

  async function request<T>(path: string, req: RequestOptions = {}): Promise<ApiSuccess<T>> {
    const url = new URL(`${baseUrl}/${path.replace(/^\/+/, "")}`);
    if (req.query instanceof URLSearchParams) {
      for (const [key, value] of req.query) url.searchParams.append(key, value);
    } else {
      for (const [key, value] of Object.entries(req.query ?? {})) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      ...req.headers,
    };
    if (req.body !== undefined) headers["Content-Type"] = "application/json";
    const locale = options.getLocale?.();
    if (locale) headers["Accept-Language"] = locale;
    if (!req.anonymous && options.getToken) {
      const token = await options.getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const response = await doFetch(url, {
      method: req.method ?? "GET",
      headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      signal: req.signal,
    });

    const text = response.status === 204 ? "" : await response.text();

    // An empty 2xx body (a 204, or a 200/201 without content) has no envelope to unwrap: it is a success.
    if (response.ok && text === "") {
      return { success: true, data: null as T };
    }

    const payload = parseJson<ApiEnvelope<T>>(text);

    if (!response.ok || payload === null || isApiFailure(payload)) {
      if (response.status === 401 && !req.anonymous) options.onUnauthorized?.();
      const failure = payload && isApiFailure(payload) ? payload : null;
      throw new ApiError(
        failure?.message ?? `Request failed (${response.status})`,
        response.status,
        failure?.code,
        failure?.errors,
        typeof failure?.reason === "string" ? failure.reason : undefined,
        {
          ...(typeof failure?.limit === "string" ? { limit: failure.limit } : {}),
          ...(typeof failure?.max === "number" ? { max: failure.max } : {}),
        },
      );
    }

    return payload;
  }

  return {
    request,
    get: (path, o) => request(path, { ...o, method: "GET" }),
    post: (path, body, o) => request(path, { ...o, method: "POST", body }),
    put: (path, body, o) => request(path, { ...o, method: "PUT", body }),
    patch: (path, body, o) => request(path, { ...o, method: "PATCH", body }),
    delete: (path, o) => request(path, { ...o, method: "DELETE" }),
  };
}

/** Non-JSON bodies (nginx 502 pages) must not surface as SyntaxError. */
function parseJson<T>(text: string): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export { createTypedClient } from "./typed";
export type { CallOptions, HttpMethod, JsonBody, OperationOf, PathsWith, SuccessData, TypedClient } from "./typed";
