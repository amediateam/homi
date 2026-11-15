/**
 * The Content Security Policy of the Mini App (`25` §3.10, SEC-REQ-031, ADR-0020): a fresh nonce per document with
 * `'strict-dynamic'`. The browser talks only to its own origin (`/bff/*`), so the API host is not listed. Host lists
 * come from the environment, never from reference data; a value that is not an `https` origin stops the app at start.
 * `style-src 'unsafe-inline'` is a recorded residual risk (gesture transforms, map libraries).
 */

export interface CspConfig {
  nonce: string;
  development: boolean;
  mediaHost: string | null;
  tileHosts: string[];
  analyticsHosts: string[];
  frameAncestors: string[];
}

/** Telegram Web shows the Mini App in a frame (Q-SEC-012); `CSP_FRAME_ANCESTORS` overrides it per environment. */
export const DEFAULT_FRAME_ANCESTORS = ["https://web.telegram.org"];

const ORIGIN = /^https:\/\/(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/i;

/** `https://a.example, https://*.b.example` → the origins; anything else throws. */
export function parseHosts(value: string | undefined): string[] {
  const hosts = (value ?? "").split(/[\s,]+/).filter(Boolean);
  for (const host of hosts) {
    if (!ORIGIN.test(host)) {
      throw new Error(`CSP: "${host}" is not an https origin`);
    }
  }
  return hosts;
}

function originOf(url: string | undefined): string | null {
  if (!url) {
    return null;
  }
  const origin = new URL(url).origin;
  return parseHosts(origin)[0] ?? null;
}

export function buildCsp(config: CspConfig): string {
  const list = (...values: (string | null | undefined | false)[]) => values.filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    `script-src ${list("'self'", `'nonce-${config.nonce}'`, "'strict-dynamic'", "https://telegram.org", config.development && "'unsafe-eval'")}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${list("'self'", "data:", "blob:", config.mediaHost, ...config.tileHosts)}`,
    "font-src 'self' data:",
    `connect-src ${list("'self'", ...config.tileHosts, ...config.analyticsHosts)}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    `frame-ancestors ${config.frameAncestors.join(" ")}`,
  ].join("; ");
}

/** The policy of this environment for one document; `CSP_REPORT_ONLY=1` sends it as report-only (first staging deploy). */
export function cspFromEnv(nonce: string, env: Record<string, string | undefined> = process.env): { header: string; reportOnly: boolean } {
  const frameAncestors = parseHosts(env.CSP_FRAME_ANCESTORS);
  const header = buildCsp({
    nonce,
    development: env.NODE_ENV === "development",
    mediaHost: originOf(env.NEXT_PUBLIC_CDN_URL),
    tileHosts: parseHosts(env.CSP_TILE_HOSTS),
    analyticsHosts: parseHosts(env.CSP_ANALYTICS_HOSTS),
    frameAncestors: frameAncestors.length > 0 ? frameAncestors : DEFAULT_FRAME_ANCESTORS,
  });
  return { header, reportOnly: env.CSP_REPORT_ONLY === "1" };
}

/** `geolocation` for the app's own location request (TMA-035) and `clipboard-write` for copying (WP-26); the rest off. */
export const PERMISSIONS_POLICY = [
  "geolocation=(self)",
  "clipboard-write=(self)",
  "camera=()",
  "microphone=()",
  "payment=()",
  "usb=()",
  "serial=()",
  "bluetooth=()",
  "hid=()",
  "midi=()",
  "magnetometer=()",
  "gyroscope=()",
  "accelerometer=()",
  "display-capture=()",
  "fullscreen=()",
].join(", ");
