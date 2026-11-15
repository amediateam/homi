/**
 * How the client authenticates its own requests (WP-21, ADR-0018). Cookie mode: the browser sends `homi_session`
 * by itself. Header mode: the token lives in this module's memory only — never in `localStorage`, DeviceStorage,
 * a cookie written by script or the address (SEC-REQ-007). `bffFetch` and the Server Actions of WP-22 read it.
 */
export type Auth = { mode: null } | { mode: "cookie" } | { mode: "header"; token: string };

let auth: Auth = { mode: null };
let expiry: number | null = null;

export function getAuth(): Auth {
  return auth;
}

/** The token's expiry in ms, for the check when the app becomes visible again. */
export function tokenExpiry(): number | null {
  return expiry;
}

export function setCookieAuth(expiresAt: string | null): void {
  auth = { mode: "cookie" };
  expiry = parseExpiry(expiresAt);
}

export function setHeaderAuth(token: string, expiresAt: string | null): void {
  auth = { mode: "header", token };
  expiry = parseExpiry(expiresAt);
}

export function clearAuth(): void {
  auth = { mode: null };
  expiry = null;
}

function parseExpiry(expiresAt: string | null): number | null {
  const time = expiresAt === null ? Number.NaN : Date.parse(expiresAt);
  return Number.isNaN(time) ? null : time;
}
