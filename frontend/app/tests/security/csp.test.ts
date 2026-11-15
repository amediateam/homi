// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildCsp, cspFromEnv, parseHosts } from "@/lib/security/csp";

const directives = (policy: string) => Object.fromEntries(policy.split(";").map((part) => part.trim()).filter(Boolean).map((part) => [part.split(" ")[0], part.split(" ").slice(1)]));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("parseHosts", () => {
  it("accepts https origins and wildcards, separated by spaces or commas", () => {
    expect(parseHosts("https://tiles.example.org, https://*.basemaps.example  https://a.example:8443")).toEqual([
      "https://tiles.example.org",
      "https://*.basemaps.example",
      "https://a.example:8443",
    ]);
    expect(parseHosts(undefined)).toEqual([]);
    expect(parseHosts("  ")).toEqual([]);
  });

  it("rejects anything that is not an https origin, at start", () => {
    for (const value of ["http://tiles.example.org", "https://tiles.example.org/path", "tiles.example.org", "'unsafe-inline'", "*", "https://"]) {
      expect(() => parseHosts(value), value).toThrow(/https/);
    }
  });
});

describe("buildCsp (25 §3.10, SEC-REQ-031)", () => {
  const base = { nonce: "abc123", development: false, mediaHost: "https://cdn.homi.uz", tileHosts: ["https://tiles.example.org"], analyticsHosts: ["https://eu.i.posthog.com"], frameAncestors: ["https://web.telegram.org"] };

  it("writes the policy of the specification", () => {
    const policy = directives(buildCsp(base));
    expect(policy).toEqual({
      "default-src": ["'self'"],
      "script-src": ["'self'", "'nonce-abc123'", "'strict-dynamic'", "https://telegram.org"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "blob:", "https://cdn.homi.uz", "https://tiles.example.org"],
      "font-src": ["'self'", "data:"],
      "connect-src": ["'self'", "https://tiles.example.org", "https://eu.i.posthog.com"],
      "worker-src": ["'self'", "blob:"],
      "object-src": ["'none'"],
      "base-uri": ["'none'"],
      "form-action": ["'self'"],
      "frame-ancestors": ["https://web.telegram.org"],
    });
  });

  it("adds 'unsafe-eval' in development only, and never names the API host", () => {
    expect(directives(buildCsp({ ...base, development: true }))["script-src"]).toContain("'unsafe-eval'");
    expect(buildCsp(base)).not.toContain("unsafe-eval");
    expect(buildCsp(base)).not.toContain("api.");
  });
});

describe("cspFromEnv", () => {
  it("reads the hosts from the environment, with web.telegram.org as the default frame ancestor", () => {
    vi.stubEnv("NEXT_PUBLIC_CDN_URL", "https://cdn.staging.homi.uz");
    vi.stubEnv("CSP_TILE_HOSTS", "https://tiles.example.org");
    vi.stubEnv("CSP_ANALYTICS_HOSTS", "");
    vi.stubEnv("CSP_FRAME_ANCESTORS", "");
    const { header, reportOnly } = cspFromEnv("n0nce");
    const policy = directives(header);
    expect(policy["img-src"]).toContain("https://cdn.staging.homi.uz");
    expect(policy["frame-ancestors"]).toEqual(["https://web.telegram.org"]);
    expect(reportOnly).toBe(false);
  });

  it("CSP_REPORT_ONLY=1 sends the policy as report-only", () => {
    vi.stubEnv("CSP_REPORT_ONLY", "1");
    expect(cspFromEnv("n").reportOnly).toBe(true);
  });

  it("refuses frame-ancestors 'none', which would hide the app from Telegram Web", () => {
    vi.stubEnv("CSP_FRAME_ANCESTORS", "'none'");
    expect(() => cspFromEnv("n")).toThrow();
  });
});

describe("proxy headers", () => {
  it("a document gets a fresh nonce in the policy and in x-nonce, and the security headers", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { proxy } = await import("@/proxy");
    const first = proxy(new NextRequest("http://localhost/ru/map"));
    const second = proxy(new NextRequest("http://localhost/ru/map"));

    const policy = first.headers.get("content-security-policy") ?? "";
    const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
    expect(nonce).toBeTruthy();
    expect(second.headers.get("content-security-policy")).not.toContain(nonce);
    expect(first.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(first.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
    expect(first.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(first.headers.get("x-content-type-options")).toBe("nosniff");
    expect(first.headers.get("permissions-policy")).toContain("geolocation=(self)");
    expect(first.headers.get("permissions-policy")).toContain("camera=()");
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(first.headers.get("x-frame-options")).toBeNull();
  });

  it("report-only mode uses the report-only header", async () => {
    vi.stubEnv("CSP_REPORT_ONLY", "1");
    const { proxy } = await import("@/proxy");
    const response = proxy(new NextRequest("http://localhost/ru"));
    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(response.headers.get("content-security-policy-report-only")).toContain("'nonce-");
  });

  it("the locale redirect still works", async () => {
    const { proxy } = await import("@/proxy");
    const response = proxy(new NextRequest("http://localhost/map?x=1"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/ru/map?x=1");
  });
});
