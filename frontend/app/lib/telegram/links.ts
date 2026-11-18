import { brand } from "@/lib/brand";

import { insideTelegram } from "./sdk";

/** TMA-028: the same address again within this long is refused (a double tap). */
export const LINK_DEBOUNCE_MS = 1500;

/**
 * Hosts a link may leave the app for, besides the app's own origin and its landing (`app.<x>` → `<x>`), the brand
 * links and the API host (`linkHosts`). An entry also matches its `www.` form. `openstreetmap.org` (its copyright
 * page is on `www.`) and `protomaps.com` are the map attribution links (WP-27).
 */
export const LINK_HOSTS: readonly string[] = ["t.me", "yandex.uz", "google.com", "openstreetmap.org", "protomaps.com"];

/**
 * The host of `NEXT_PUBLIC_API_URL`: the call page of `POST /listings/{number}/contact` is served there (WP-26,
 * `{api}/call/…`). Read at each call and spelled out, so Next.js inlines it; an empty or malformed value adds nothing.
 */
function apiHost(): string | null {
  const value = process.env.NEXT_PUBLIC_API_URL;
  if (!value) {
    return null;
  }
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function brandHosts(): string[] {
  const hosts: string[] = [];
  for (const perLocale of Object.values(brand.links)) {
    for (const link of Object.values(perLocale)) {
      if (link !== null) {
        try {
          hosts.push(new URL(link).hostname);
        } catch {
          // A malformed brand link is not a host.
        }
      }
    }
  }
  return hosts;
}

export function linkHosts(appHost: string = typeof window === "undefined" ? "" : window.location.hostname): string[] {
  const hosts = [...LINK_HOSTS, ...brandHosts()];
  const api = apiHost();
  if (api !== null) {
    hosts.push(api);
  }
  if (appHost !== "") {
    hosts.push(appHost);
    if (appHost.startsWith("app.")) {
      hosts.push(appHost.slice("app.".length));
    }
  }
  return [...new Set(hosts)];
}

function allowed(host: string): boolean {
  const hosts = linkHosts();
  return hosts.includes(host) || (host.startsWith("www.") && hosts.includes(host.slice("www.".length)));
}

let last: { href: string; at: number } | null = null;

/**
 * Opens an external address (TMA-028): `https:` on an allowed host only; `t.me` through `openTelegramLink`, the rest
 * through `openLink`; outside Telegram a new tab without an opener. `false` when refused or debounced.
 */
export function openLink(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || !allowed(parsed.hostname)) {
    return false;
  }
  const now = Date.now();
  if (last !== null && last.href === parsed.href && now - last.at < LINK_DEBOUNCE_MS) {
    return false;
  }
  last = { href: parsed.href, at: now };

  const app = insideTelegram();
  if (app !== null) {
    try {
      if (parsed.hostname === "t.me") {
        app.openTelegramLink?.(url);
      } else {
        app.openLink?.(url);
      }
      return true;
    } catch {
      // A client that refuses the call: the browser fallback below.
    }
  }
  try {
    window.open(url, "_blank", "noopener");
  } catch {
    return false;
  }
  return true;
}
