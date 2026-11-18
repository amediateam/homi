// @vitest-environment node
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildCsp, buildWorkerCsp, cspFromEnv, parseHosts, PERMISSIONS_POLICY, workerCspFromEnv } from "@/lib/security/csp";

const WORKER = "http://localhost/maplibre/6.11.2/maplibre-gl-worker.mjs";

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

describe("the MapLibre worker's policy (WP-27, basemap and tiles)", () => {
  it("allows its own origin for the shared module and the tile hosts for the template tiles, nothing else", () => {
    expect(directives(buildWorkerCsp({ tileHosts: ["https://tiles.example.org", "https://*.basemaps.example"] }))).toEqual({
      "default-src": ["'none'"],
      "script-src": ["'self'"],
      "connect-src": ["'self'", "https://tiles.example.org", "https://*.basemaps.example"],
    });
    expect(buildWorkerCsp({ tileHosts: [] })).toBe("default-src 'none'; script-src 'self'; connect-src 'self'");
  });

  it("reads the same CSP_TILE_HOSTS as the page's connect-src, and CSP_REPORT_ONLY", () => {
    vi.stubEnv("CSP_TILE_HOSTS", "https://tile.openstreetmap.org, https://tiles.example.org");
    vi.stubEnv("CSP_ANALYTICS_HOSTS", "https://eu.i.posthog.com");
    const { header, reportOnly } = workerCspFromEnv();
    expect(directives(header)["connect-src"]).toEqual(["'self'", "https://tile.openstreetmap.org", "https://tiles.example.org"]);
    expect(directives(cspFromEnv("n").header)["connect-src"]).toEqual([...(directives(header)["connect-src"] ?? []), "https://eu.i.posthog.com"]);
    expect(reportOnly).toBe(false);

    vi.stubEnv("CSP_REPORT_ONLY", "1");
    expect(workerCspFromEnv().reportOnly).toBe(true);
  });

  it("refuses a tile host that is not an https origin, as the page's policy does", () => {
    vi.stubEnv("CSP_TILE_HOSTS", "http://tiles.example.org");
    expect(() => workerCspFromEnv()).toThrow(/https/);
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

  it("MapLibre's worker gets the worker policy, a year of cache and the security headers, without a nonce or a redirect", async () => {
    vi.stubEnv("CSP_TILE_HOSTS", "https://tile.openstreetmap.org");
    const { proxy } = await import("@/proxy");
    for (const url of [WORKER, "http://localhost/maplibre/6.11.2/maplibre-gl-shared.mjs"]) {
      const response = proxy(new NextRequest(url));
      expect(response.status, url).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; script-src 'self'; connect-src 'self' https://tile.openstreetmap.org");
      expect(response.headers.get("content-security-policy-report-only")).toBeNull();
      expect(response.headers.get("x-middleware-request-x-nonce")).toBeNull();
      expect(response.headers.get("x-middleware-request-content-security-policy")).toBeNull();
      // No cache of its own: a one-year cache would also keep the 404 of a missing version.
      expect(response.headers.get("cache-control")).toBeNull();
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
      expect(response.headers.get("permissions-policy")).toBe(PERMISSIONS_POLICY);
    }
  });

  it("report-only mode sends the worker policy as report-only too", async () => {
    vi.stubEnv("CSP_REPORT_ONLY", "1");
    const { proxy } = await import("@/proxy");
    const response = proxy(new NextRequest(WORKER));
    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(response.headers.get("content-security-policy-report-only")).toBe("default-src 'none'; script-src 'self'; connect-src 'self'");
  });

  it("a document and a /maplibre address without a file keep the nonce policy and the locale step", async () => {
    const { proxy } = await import("@/proxy");
    const document = proxy(new NextRequest("http://localhost/ru/map"));
    expect(document.headers.get("content-security-policy")).toContain("'nonce-");
    expect(document.headers.get("content-security-policy")).toContain("'strict-dynamic'");
    expect(document.headers.get("cache-control")).toBe("no-store");

    const page = proxy(new NextRequest("http://localhost/maplibre/6"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("http://localhost/ru/maplibre/6");
  });
});

describe("the proxy matcher", () => {
  it("lets in documents and MapLibre's files, and no other file, Next.js internal or route handler", async () => {
    const { config } = await import("@/proxy");
    const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });
    for (const url of ["/", "/ru", "/ru/map?city=tashkent", "/map", "/maplibre/6.11.2/maplibre-gl-worker.mjs", "/maplibre/6.11.2/maplibre-gl-shared.mjs"]) {
      expect(matches(url), url).toBe(true);
    }
    for (const url of ["/brand/logo.svg", "/map-fonts/noto-sans-latin-400.woff2", "/boot/boot.js", "/favicon.ico", "/_next/static/chunks/a.js", "/_next/image", "/bff/listings", "/bff/session"]) {
      expect(matches(url), url).toBe(false);
    }
  });
});
