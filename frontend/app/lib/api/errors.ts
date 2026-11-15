/**
 * The one mapping from an API answer to the state a screen shows (WP-22, "Error mapping"; `03` §1.6). Screens decide
 * by `UiError`, never by a status or a code.
 */
export type UiError =
  | "offline"
  | "timeout"
  | "server"
  | "source_unavailable"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "rate_limited"
  | "radars_disabled";

/** What went wrong: the request never completed, it timed out, or the API answered with a status (and a code). */
export type Failure = "offline" | "timeout" | { status: number; code?: string };

/**
 * A failed call as screens and logs see it: the method, the path template (`listings/:number`), the status and the
 * code — never a header, a query string, a body or a token (SEC-REQ-047). `status` is `0` when there was no answer.
 */
export interface ApiFailure {
  ok: false;
  error: UiError;
  status: number;
  code?: string;
  method: string;
  path: string;
}

export function toUiError(failure: number | Failure): UiError {
  if (failure === "offline" || failure === "timeout") {
    return failure;
  }
  const { status, code } = typeof failure === "number" ? { status: failure, code: undefined } : failure;
  if (status === 503 && code === "source_unavailable") {
    return "source_unavailable";
  }
  if (status === 403) {
    return code === "radars_disabled" ? "radars_disabled" : "forbidden";
  }
  const byStatus: Partial<Record<number, UiError>> = {
    401: "unauthorized",
    404: "not_found",
    409: "conflict",
    422: "validation",
    429: "rate_limited",
  };
  return byStatus[status] ?? "server";
}

export function failureOf(call: { method: string; path: string }, failure: Failure): ApiFailure {
  const status = typeof failure === "string" ? 0 : failure.status;
  const code = typeof failure === "string" ? undefined : failure.code;
  return {
    ok: false,
    error: toUiError(failure),
    status,
    ...(code === undefined ? {} : { code }),
    method: call.method,
    path: call.path,
  };
}
