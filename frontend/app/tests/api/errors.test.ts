import { describe, expect, it } from "vitest";

import { failureOf, toUiError } from "@/lib/api/errors";

/** The error mapping table of WP-22 ("Error mapping"), one row per case. */
describe("toUiError", () => {
  it.each([
    ["row 1: the request never completed", "offline", "offline"],
    ["row 2: no answer in 15 s", "timeout", "timeout"],
    ["row 3: a 5xx", { status: 500 }, "server"],
    ["row 3: a 502 without an envelope", { status: 502, code: "unknown" }, "server"],
    ["row 3: an unreadable 2xx body", { status: 200 }, "server"],
    ["row 4: 503 source_unavailable", { status: 503, code: "source_unavailable" }, "source_unavailable"],
    ["row 4: another 503 is row 3", { status: 503, code: "maintenance" }, "server"],
    ["row 5: 401", { status: 401, code: "unauthenticated" }, "unauthorized"],
    ["row 6: 403", { status: 403, code: "access_denied" }, "forbidden"],
    ["row 7: 404", { status: 404, code: "not_found" }, "not_found"],
    ["row 8: 409", { status: 409, code: "radar_limit" }, "conflict"],
    ["row 9: 422", { status: 422, code: "validation_failed" }, "validation"],
    ["row 10: 429", { status: 429, code: "too_many_requests" }, "rate_limited"],
    ["row 11: 403 radars_disabled is read before row 6", { status: 403, code: "radars_disabled" }, "radars_disabled"],
  ] as const)("%s", (_row, failure, expected) => {
    expect(toUiError(failure)).toBe(expected);
  });

  it("takes a bare status", () => {
    expect(toUiError(404)).toBe("not_found");
    expect(toUiError(503)).toBe("server");
  });

  it("maps any other 4xx to the could-not-load state", () => {
    expect(toUiError({ status: 400, code: "bad_request" })).toBe("server");
  });
});

describe("failureOf (SEC-REQ-047)", () => {
  it("holds the method, the path template, the status and the code — nothing else", () => {
    const failure = failureOf({ method: "GET", path: "listings/:number" }, { status: 409, code: "radar_limit" });

    expect(failure).toEqual({ ok: false, error: "conflict", status: 409, code: "radar_limit", method: "GET", path: "listings/:number" });
  });

  it("leaves the code out when there is none, and status 0 for a request that never completed", () => {
    expect(failureOf({ method: "GET", path: "me" }, "offline")).toEqual({ ok: false, error: "offline", status: 0, method: "GET", path: "me" });
  });
});
