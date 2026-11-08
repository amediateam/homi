import { isApiFailure, type ApiEnvelope, type ApiSuccess } from "@homi/types";

/**
 * Minimal typed client for the HOMI API envelope (ADR-0003 bearer tokens, ADR-0007 envelope).
 * Modelled on the port plan for app.uz `frontend/lendo/lib/api.ts` (docs/reference-codebase, A3):
 * native fetch, envelope unwrapping, ApiError with status + validation errors, no refresh logic.
 * Typed resource methods are generated from the OpenAPI spec in Phase 3 and layered on top of this.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly errors?: Record<string, string[]>;

  constructor(message: string, status: number, code?: string, errors?: Record<string, string[]>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.errors = errors;
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
  query?: Record<string, string | number | boolean | undefined>;
  anonymous?: boolean;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<ApiSuccess<T>>;
  get<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<ApiSuccess<T>>;
  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<ApiSuccess<T>>;
  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<ApiSuccess<T>>;
  delete<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<ApiSuccess<T>>;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetch ?? fetch;

  async function request<T>(path: string, req: RequestOptions = {}): Promise<ApiSuccess<T>> {
    const url = new URL(`${baseUrl}/${path.replace(/^\/+/, "")}`);
    for (const [key, value] of Object.entries(req.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
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

    const payload = await parseJson<ApiEnvelope<T>>(response);

    if (!response.ok || payload === null || isApiFailure(payload)) {
      if (response.status === 401 && !req.anonymous) options.onUnauthorized?.();
      const failure = payload && isApiFailure(payload) ? payload : null;
      throw new ApiError(
        failure?.message ?? `Request failed (${response.status})`,
        response.status,
        failure?.code,
        failure?.errors,
      );
    }

    return payload;
  }

  return {
    request,
    get: (path, o) => request(path, { ...o, method: "GET" }),
    post: (path, body, o) => request(path, { ...o, method: "POST", body }),
    patch: (path, body, o) => request(path, { ...o, method: "PATCH", body }),
    delete: (path, o) => request(path, { ...o, method: "DELETE" }),
  };
}

/** Non-JSON bodies (nginx 502 pages, empty 204s) must not surface as SyntaxError. */
async function parseJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
