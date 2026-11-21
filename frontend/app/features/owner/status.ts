import { labelFor, type MessageKey } from "@homi/i18n";

import type { OwnerListingView } from "./normalize";

/**
 * The pure rules of the owner's lists and panel (WP-82, BR-APP-088, BR-APP-094, BR-APP-095, DEC-73, DEC-81, DEV-056):
 * the status label, the split into «Актуальные» and «История», the actions of a card and of the panel, and the value of
 * the settings row «Мои объявления». No React, no clock of its own: `now` is passed in.
 */

/** A translated text with its values: the components call `t(label.key, label.values)`. */
export interface Label {
  key: MessageKey;
  values?: Record<string, number>;
}

/** Where the actions are drawn: the card of «Мои объявления» or the footer of the owner panel (SCR-057, SCR-059). */
export type ActionPlace = "card" | "panel";

export type OwnerAction = "delete" | "continue" | "requests" | "pause" | "resume" | "rented" | "edit" | "remove" | "support" | "again";

const DAY_MS = 86_400_000;
/** Asia/Tashkent is UTC+5 all year (no daylight saving): its calendar day is the UTC day of the time shifted by 5 h. */
const TASHKENT_OFFSET_MS = 5 * 3_600_000;

function tashkentDay(ms: number): number {
  return Math.floor((ms + TASHKENT_OFFSET_MS) / DAY_MS);
}

/**
 * The calendar days in Asia/Tashkent from the server's publication time to `now` (fix of LB-APP-062: never the
 * device's zone): 0 on the day of publication. `null` without a valid time; a time in the future reads 0.
 */
export function daysListed(publishedAt: string | null, now: number): number | null {
  if (publishedAt === null) {
    return null;
  }
  const published = Date.parse(publishedAt);
  if (!Number.isFinite(published)) {
    return null;
  }
  return Math.max(0, tashkentDay(now) - tashkentDay(published));
}

/**
 * The status chip (BR-APP-094): a withdrawn listing «Снято с публикации», a held one «На проверке» whatever its
 * `hold_reason` (default 26, WP-70 row 45: no reason is ever shown), `active` «Сдаётся · с сегодня» on the day of
 * publication, else «Сдаётся · N дней»; any other known status its label; an unknown one `fallback.other` (fix of
 * LB-APP-064).
 */
export function statusLabel(listing: OwnerListingView, now: number): Label {
  if (listing.withdrawn) {
    return { key: "own.status.withdrawn" };
  }
  if (listing.held) {
    return { key: "own.review.title" };
  }
  switch (listing.status) {
    case "active": {
      const days = daysListed(listing.publishedAt, now);
      return days === null || days === 0 ? { key: "own.status.activeToday" } : { key: "own.status.active", values: { days } };
    }
    default:
      // The table of `@homi/i18n` (never a key built from the server's value); an unknown status reads «Другое».
      return { key: labelFor("ownerStatus", listing.status) };
  }
}

/** «История» holds the let and removed listings and every withdrawn one; «Актуальные» the rest (BR-APP-095). */
export function isPast(listing: OwnerListingView): boolean {
  return listing.withdrawn || listing.status === "rented" || listing.status === "removed";
}

/** The listings the owner runs: published (`active` or `paused`), neither withdrawn nor held (DEC-73). */
export function manageable(listing: OwnerListingView): boolean {
  return (listing.status === "active" || listing.status === "paused") && !listing.withdrawn && !listing.held;
}

/** The two tabs of «Мои объявления», each in the server's order. */
export function splitLists(items: readonly OwnerListingView[]): { current: OwnerListingView[]; past: OwnerListingView[] } {
  return { current: items.filter((item) => !isPast(item)), past: items.filter(isPast) };
}

/** What opens the form or puts a listing back into the feed: not offered while the cabinet is off (DEC-81, WP-80). */
const NEEDS_CABINET: ReadonlySet<OwnerAction> = new Set(["continue", "edit", "resume", "again"]);

/**
 * The actions of a listing on its card or in the panel's footer (BR-APP-088, DEC-73, DEV-056), in their order:
 *
 * | Listing | Card | Panel |
 * | ------- | ---- | ----- |
 * | draft | delete, continue | delete, continue |
 * | manageable | requests, pause or resume, rented | requests, edit, pause or resume, rented, remove |
 * | held or withdrawn | requests (with requests), support | support |
 * | rejected | support, delete | support, delete |
 * | rented, removed, unknown | requests (with requests) | requests (with requests), again |
 *
 * While the cabinet is off «Продолжить», «Изменить», «Вернуть» and «Сдать ещё одну» are dropped (DEC-81).
 */
export function actionsOf(listing: OwnerListingView, place: ActionPlace, options: { cabinetOn: boolean }): OwnerAction[] {
  const hasRequests = (listing.stats?.requests ?? 0) > 0;
  const actions = ((): OwnerAction[] => {
    if (listing.withdrawn || listing.held) {
      return place === "card" && hasRequests ? ["requests", "support"] : ["support"];
    }
    switch (listing.status) {
      case "draft":
        return ["delete", "continue"];
      case "active":
      case "paused": {
        const toggle: OwnerAction = listing.status === "active" ? "pause" : "resume";
        return place === "card" ? ["requests", toggle, "rented"] : ["requests", "edit", toggle, "rented", "remove"];
      }
      case "rejected":
        return ["support", "delete"];
      default: {
        const requests: OwnerAction[] = hasRequests ? ["requests"] : [];
        return place === "card" ? requests : [...requests, "again"];
      }
    }
  })();
  return options.cabinetOn ? actions : actions.filter((action) => !NEEDS_CABINET.has(action));
}

/**
 * The value of the settings row «Мои объявления» (SCR-032), the first that applies: «ждут ответа: N» while requests
 * wait; the number of manageable listings; «Черновик» when a draft exists; else nothing.
 */
export function mineRowValue(items: readonly OwnerListingView[], pending: number): Label | { count: number } | null {
  if (pending > 0) {
    return { key: "own.pendingShort", values: { n: pending } };
  }
  const running = items.filter(manageable).length;
  if (running > 0) {
    return { count: running };
  }
  return items.some((item) => item.status === "draft") ? { key: "own.draftShort" } : null;
}

/** The first listing of a list that has requests waiting (the tab tip's target, DEV-059; the card tip). */
export function firstPending(items: readonly OwnerListingView[]): OwnerListingView | null {
  return items.find((item) => (item.stats?.pending ?? 0) > 0) ?? null;
}
