import { isLocale, type Locale } from "@homi/config";

import { type GateName, matchRoute, routes } from "@/lib/navigation/routes";
import type { SessionStatus } from "@/lib/session/bootstrap";
import { accessReason, type AccessReason, type Me } from "@/lib/session/types";

/** What the gates read of the session's user: the WP-11 marks of the first-launch choices and the saved locale. */
export type GateUser = Pick<Me, "locale" | "locale_chosen" | "city_chosen">;

/** Everything one gate decision depends on; `GateRedirector` collects it on every change. */
export interface GateInput {
  status: SessionStatus;
  me: GateUser | null;
  reason: AccessReason | null;
  /** The locale of the address. */
  locale: Locale;
  /** The address without its locale segment, and its query. */
  pathname: string;
  searchParams: URLSearchParams;
  /** How many cities the reference data has (`0` while it is unknown or could not be read). */
  citiesCount: number;
  /** A locale or a city was picked on a gate in this launch (`gateState`); it wins over a `me` not re-read yet. */
  localePicked: boolean;
  cityPicked: boolean;
  /** The listing of the launch link has not been opened yet (`launchPending()`, D-S-8). */
  launchPending: boolean;
  /** The full Telegram language mapping, `detectLocale(tg.languageCode(), { oneDetector: true })` (D-S-5). */
  telegramLocale: Locale;
  /** The address the gates were entered from (`gateState.returnTo`), with its query and without the locale. */
  returnTo: string | null;
}

/** A navigation by replace: a locale-less address and the locale to show it in. */
export interface GateTarget {
  href: string;
  locale: Locale;
}

/** `null`: the address stays; `"expired"`: the session-expired screen replaces the route in place (not a route). */
export type GateDecision = GateTarget | "expired" | null;

/** Row 5: the user never chose a locale (`locale_chosen` strictly `false`) and none was picked in this launch. */
export function needsLanguage(me: GateUser | null, localePicked: boolean): boolean {
  return me !== null && me.locale_chosen === false && !localePicked;
}

/** Row 6 without the address: more than one city, the city strictly not chosen (Q-APP-013), none picked yet. */
export function needsCity(me: GateUser | null, citiesCount: number, cityPicked: boolean): boolean {
  return me !== null && me.city_chosen === false && citiesCount > 1 && !cityPicked;
}

function gateOf(pathname: string): GateName | null {
  const matched = matchRoute(pathname);
  return matched.route === "gate" ? matched.gate : null;
}

/** The remembered return address, unless it is itself a gate (it never should be): then the feed. */
function returnAddress(returnTo: string | null): string {
  if (returnTo === null || gateOf(returnTo.split("?")[0]) !== null) {
    return routes.feed();
  }
  return returnTo;
}

/**
 * The gate an address must show (WP-23 "Gates", `03` §1.4, BR-APP-055), row by row:
 * (1) `booting`: stay — the route renders its loading state;
 * (2) `outside`: `/outside` in the address's locale;
 * (3) `expired`: the session-expired screen in place of the route;
 * (4) `denied`: `/no-access?reason=…` in the full Telegram language mapping;
 * (5) `ready`, no locale chosen: `/welcome/language`;
 * (6) `ready`, more than one city, no city chosen, the address is not a listing and no launch listing is still to
 *     open (the listing first, the city after): `/welcome/city`;
 * (7) `ready` on a gate: back to the return address, else the feed.
 * Rows 5 to 7 use the user's locale, which the locale guard keeps on every other address. A row whose target is the
 * address already shown stays.
 */
export function resolveGate(input: GateInput): GateDecision {
  const gate = gateOf(input.pathname);

  switch (input.status) {
    case "booting":
      return null;
    case "outside":
      return gate === "outside" ? null : { href: routes.outside(), locale: input.locale };
    case "expired":
      return "expired";
    case "denied": {
      const reason = accessReason(input.reason);
      const shown = gate === "noAccess" && input.searchParams.get("reason") === reason && input.locale === input.telegramLocale;
      return shown ? null : { href: routes.noAccess(reason), locale: input.telegramLocale };
    }
    case "ready":
      break;
  }

  const locale = input.me !== null && isLocale(input.me.locale) ? input.me.locale : input.locale;
  const toGate = (name: GateName, href: string): GateDecision => (gate === name && input.locale === locale ? null : { href, locale });

  if (needsLanguage(input.me, input.localePicked)) {
    return toGate("language", routes.welcomeLanguage());
  }
  if (needsCity(input.me, input.citiesCount, input.cityPicked) && matchRoute(input.pathname).route !== "listing" && !input.launchPending) {
    return toGate("city", routes.welcomeCity());
  }
  return gate === null ? null : { href: returnAddress(input.returnTo), locale };
}
