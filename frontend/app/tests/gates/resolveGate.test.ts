import { describe, expect, it } from "vitest";

import { type GateInput, needsCity, needsLanguage, resolveGate } from "@/features/gates/resolveGate";
import { matchRoute } from "@/lib/navigation/routes";

const CHOSEN = { locale: "uz", locale_chosen: true, city_chosen: true } as const;

/** A ready user on the feed: every gate passed, three cities, nothing picked in this launch. */
function input(change: Partial<GateInput> & { query?: string } = {}): GateInput {
  const { query = "", ...rest } = change;
  return {
    status: "ready",
    me: CHOSEN,
    reason: null,
    locale: "uz",
    pathname: "/",
    searchParams: new URLSearchParams(query),
    citiesCount: 3,
    localePicked: false,
    cityPicked: false,
    launchPending: false,
    telegramLocale: "en",
    returnTo: null,
    ...rest,
  };
}

const NO_LOCALE = { ...CHOSEN, locale_chosen: false };
const NO_CITY = { ...CHOSEN, city_chosen: false };

describe("resolveGate — the gate table (WP-23 'Gates')", () => {
  it("(1) booting: stays wherever it is, a gate route included", () => {
    expect(resolveGate(input({ status: "booting", me: null }))).toBeNull();
    expect(resolveGate(input({ status: "booting", me: null, pathname: "/no-access" }))).toBeNull();
  });

  it("(2) outside: /outside in the locale of the address; stays once there", () => {
    expect(resolveGate(input({ status: "outside", me: null, locale: "ru", pathname: "/listing/5" }))).toEqual({ href: "/outside", locale: "ru" });
    expect(resolveGate(input({ status: "outside", me: null, locale: "ru", pathname: "/outside" }))).toBeNull();
  });

  it("(3) expired: rendered in place of the route, never a navigation", () => {
    expect(resolveGate(input({ status: "expired", me: null }))).toBe("expired");
    expect(resolveGate(input({ status: "expired", me: null, pathname: "/welcome/language" }))).toBe("expired");
  });

  it("(4) denied: /no-access with the reason, in the full Telegram language mapping", () => {
    expect(resolveGate(input({ status: "denied", me: null, reason: "join", locale: "ru", telegramLocale: "en" }))).toEqual({
      href: "/no-access?reason=join",
      locale: "en",
    });
    expect(resolveGate(input({ status: "denied", me: null, reason: null }))).toEqual({ href: "/no-access?reason=private", locale: "en" });
  });

  it("(4) stays on /no-access only with the same reason in the Telegram locale", () => {
    const denied = { status: "denied", me: null, reason: "full", pathname: "/no-access" } as const;
    expect(resolveGate(input({ ...denied, query: "reason=full", locale: "en" }))).toBeNull();
    expect(resolveGate(input({ ...denied, query: "reason=join", locale: "en" }))).toEqual({ href: "/no-access?reason=full", locale: "en" });
    expect(resolveGate(input({ ...denied, query: "reason=full", locale: "ru" }))).toEqual({ href: "/no-access?reason=full", locale: "en" });
  });

  it("(5) no chosen locale: the language picker in the user's locale", () => {
    expect(resolveGate(input({ me: NO_LOCALE, locale: "ru" }))).toEqual({ href: "/welcome/language", locale: "uz" });
    expect(resolveGate(input({ me: NO_LOCALE, pathname: "/welcome/language" }))).toBeNull();
  });

  it("(5) comes before the city and before a listing", () => {
    const neither = { ...CHOSEN, locale_chosen: false, city_chosen: false };
    expect(resolveGate(input({ me: neither, pathname: "/listing/42", launchPending: true }))).toEqual({ href: "/welcome/language", locale: "uz" });
    expect(resolveGate(input({ me: neither, pathname: "/welcome/city" }))).toEqual({ href: "/welcome/language", locale: "uz" });
  });

  it("(5) a locale picked in this launch wins over a stale me", () => {
    expect(resolveGate(input({ me: NO_LOCALE, localePicked: true }))).toBeNull();
    expect(resolveGate(input({ me: NO_LOCALE, localePicked: true, pathname: "/welcome/language" }))).toEqual({ href: "/", locale: "uz" });
  });

  it("(5) only a strict false counts as not chosen", () => {
    expect(needsLanguage({ ...CHOSEN, locale_chosen: undefined as unknown as boolean }, false)).toBe(false);
    expect(needsLanguage(null, false)).toBe(false);
    expect(needsLanguage(NO_LOCALE, false)).toBe(true);
  });

  it("(6) no chosen city with more than one city: the city page", () => {
    expect(resolveGate(input({ me: NO_CITY }))).toEqual({ href: "/welcome/city", locale: "uz" });
    expect(resolveGate(input({ me: NO_CITY, pathname: "/map", query: "deal=sale" }))).toEqual({ href: "/welcome/city", locale: "uz" });
    expect(resolveGate(input({ me: NO_CITY, pathname: "/welcome/city" }))).toBeNull();
  });

  it("(6) waits while the address is a listing, and while the launch listing is still to open (BR-APP-055)", () => {
    expect(resolveGate(input({ me: NO_CITY, pathname: "/listing/42" }))).toBeNull();
    expect(resolveGate(input({ me: NO_CITY, pathname: "/listing/42/photos", query: "i=2" }))).toBeNull();
    expect(resolveGate(input({ me: NO_CITY, launchPending: true }))).toBeNull();
    // Back from the listing: the feed, then the city page.
    expect(resolveGate(input({ me: NO_CITY, pathname: "/" }))).toEqual({ href: "/welcome/city", locale: "uz" });
  });

  it("(6) one city — or none known — never shows the city page", () => {
    expect(resolveGate(input({ me: NO_CITY, citiesCount: 1 }))).toBeNull();
    expect(resolveGate(input({ me: NO_CITY, citiesCount: 0 }))).toBeNull();
    expect(resolveGate(input({ me: NO_CITY, citiesCount: 1, pathname: "/welcome/city" }))).toEqual({ href: "/", locale: "uz" });
  });

  it("(6) a city picked in this launch wins over a stale me; only a strict false counts (Q-APP-013)", () => {
    expect(resolveGate(input({ me: NO_CITY, cityPicked: true }))).toBeNull();
    expect(needsCity({ ...CHOSEN, city_chosen: undefined as unknown as boolean }, 3, false)).toBe(false);
    expect(needsCity(NO_CITY, 2, false)).toBe(true);
  });

  it("(7) ready on a gate: back to the remembered address with its query, in the user's locale", () => {
    for (const pathname of ["/welcome/language", "/welcome/city", "/no-access", "/outside"]) {
      expect(resolveGate(input({ pathname, locale: "ru", returnTo: "/?listing=7&deal=sale" }))).toEqual({ href: "/?listing=7&deal=sale", locale: "uz" });
    }
  });

  it("(7) without a return address — or with a gate remembered — the feed", () => {
    expect(resolveGate(input({ pathname: "/outside" }))).toEqual({ href: "/", locale: "uz" });
    expect(resolveGate(input({ pathname: "/no-access", returnTo: "/welcome/city" }))).toEqual({ href: "/", locale: "uz" });
  });

  it("(7) leaves a gate when the language is picked and a listing launch is pending", () => {
    const me = { ...CHOSEN, locale: "en", city_chosen: false } as const;
    expect(resolveGate(input({ me, localePicked: true, pathname: "/welcome/language", locale: "ru", launchPending: true, returnTo: "/" }))).toEqual({
      href: "/",
      locale: "en",
    });
    // Without a launch listing the city page follows the language page directly.
    expect(resolveGate(input({ me, localePicked: true, pathname: "/welcome/language", locale: "ru", returnTo: "/" }))).toEqual({
      href: "/welcome/city",
      locale: "en",
    });
  });

  it("ready everywhere else: stays", () => {
    for (const pathname of ["/", "/map", "/listing/42", "/saved/history", "/radars", "/settings/theme", "/whatever"]) {
      expect(resolveGate(input({ pathname }))).toBeNull();
    }
  });
});

describe("matchRoute names the gate (D-S-9)", () => {
  it.each([
    ["/welcome/language", "language"],
    ["/welcome/city/", "city"],
    ["/no-access", "noAccess"],
    ["/outside", "outside"],
  ])("%s → %s", (pathname, gate) => {
    expect(matchRoute(pathname)).toEqual({ route: "gate", gate });
  });
});
