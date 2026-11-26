// @vitest-environment node
import { describe, expect, it } from "vitest";

import { forwardedFor, forwardedForHeaders } from "@/lib/api/forwarded";

describe("X-Forwarded-For of the app's API calls (WP-40)", () => {
  it("reads the incoming value as it came: a chain stays a chain, spaces and all", () => {
    expect(forwardedFor(new Headers({ "X-Forwarded-For": "203.0.113.7,  198.51.100.2" }))).toBe("203.0.113.7,  198.51.100.2");
    expect(forwardedFor(new Headers({ "x-forwarded-for": "not an address" }))).toBe("not an address");
  });

  it("reads null when the request has none", () => {
    expect(forwardedFor(new Headers())).toBeNull();
  });

  it("sends the value unchanged, and nothing for none or an empty value", () => {
    expect(forwardedForHeaders("203.0.113.7, 198.51.100.2")).toEqual({ "X-Forwarded-For": "203.0.113.7, 198.51.100.2" });
    for (const value of [null, undefined, ""]) {
      expect(forwardedForHeaders(value), String(value)).toEqual({});
    }
  });
});
