import "server-only";

import { createHash } from "node:crypto";

import { cookies } from "next/headers";

/** The app's session cookie (ADR-0018): the API token, `HttpOnly`, `Secure`, `SameSite=None`, `Partitioned`. */
export const SESSION_COOKIE = "homi_session";

/**
 * The SHA-256 of the Telegram user id the session belongs to. `MeResource` carries no Telegram id, so this is how a
 * later launch tells whether the cookie belongs to the user of its launch data (`25` §3.4).
 */
export const SESSION_USER_COOKIE = "homi_session_user";

/** The API base for server-side calls: `API_URL`, else the public `NEXT_PUBLIC_API_URL`. */
export function apiBaseUrl(): string {
  return (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");
}

export function telegramUserTag(id: number | string): string {
  return createHash("sha256").update(String(id)).digest("hex");
}

/**
 * The session token of this request for Server Components (cookie mode). Every caller sits inside `<Suspense>`
 * (`authentication-with-cache-components.md`); header mode has no cookie, so this is `null` there.
 */
export async function getSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}
