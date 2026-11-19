"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { useRouter } from "@/i18n/navigation";
import { bffFetch } from "@/lib/api/browser";
import type { ApiFailure } from "@/lib/api/errors";
import { getPreview } from "@/lib/data/previewCache";
import { markSeen } from "@/lib/data/sessionMaps";
import type { DataSource } from "@/lib/data/sources";
import { seedResource, useResource } from "@/lib/data/useResource";
import { type DevFlags, devFlags } from "@/lib/flags";
import { backBy, normaliseAddress } from "@/lib/navigation/history";
import { matchRoute, routes } from "@/lib/navigation/routes";
import { onForbidden } from "@/lib/session/bootstrap";
import { useSession } from "@/lib/session/SessionProvider";

import { stepLayersOf } from "./closeListing";
import {
  type ListingDetails,
  type ListingInitial,
  listingKey,
  type ListingPreview,
  type ListingRecord,
  type ListingShowData,
  toRecord,
} from "./listingData";

export type ListingView =
  | { state: "skeleton" }
  | { state: "preview"; preview: ListingPreview }
  | { state: "loaded"; details: ListingDetails; source: DataSource | undefined }
  | { state: "not_found" }
  | { state: "offline"; retry: () => void }
  | { state: "server"; retry: () => void };

/** What the listing layer gives everything rendered inside it (WP-26). */
export interface ListingLayerValue {
  /** This layer instance's own number (from its `params`); `null` when the address holds no valid number. */
  number: number | null;
  /** Scrolls the layer to the top («Повторить»). */
  scrollToTop: () => void;
  /** The state each screen instance shows; the layer turns its swipe back on for data only. */
  reportView: (state: ListingView["state"]) => void;
  /**
   * The state the screen last reported; `null` before its first report and after the layer hid. A child route reads
   * it for a failure the resource never holds: the server's read (cookie mode) stays in the screen's `initial`.
   */
  view: ListingView["state"] | null;
}

/** Provided by `ListingLayer` only. */
export const ListingLayerContext = createContext<ListingLayerValue>({ number: null, scrollToTop: () => {}, reportView: () => {}, view: null });

export function useListingNumber(): number | null {
  return useContext(ListingLayerContext).number;
}

export interface UseListingOptions {
  /** The server's read; `null` without the cookie or after an `unauthorized`; `undefined` = the fallback instance. */
  initial?: ListingInitial | null;
  /** The app's flags; tests pass overrides (`withDevFlags`). */
  flags?: DevFlags;
}

function fetchListing(number: number) {
  return (signal: AbortSignal) => bffFetch<ListingShowData>(`listings/${number}`, { signal }).then(toRecord);
}

/**
 * The history entries open above the listing's own address when the redirect runs: a child route (photos, location,
 * market, actions) and the actions sheet's steps over it, read from the live address.
 */
function entriesAboveListing(): number {
  const route = matchRoute(normaliseAddress(window.location.pathname));
  const steps = stepLayersOf(new URLSearchParams(window.location.search).get("step"));
  return route.route === "listing" && route.child !== null ? 1 + steps : steps;
}

/** The error states of SCR-019; an `unauthorized` that survived the re-sign-in is the session's expired screen. */
function errorView(error: ApiFailure, retry: () => void): ListingView {
  switch (error.error) {
    case "not_found":
      return { state: "not_found" };
    case "offline":
    case "timeout":
      return { state: "offline", retry };
    default:
      return { state: "server", retry };
  }
}

/**
 * The listing's data (WP-26, SCR-018/SCR-019) on the resource `listingKey(number)`, which the photos, market and
 * actions children read too. The fallback instance (`initial` undefined) never reads: it shows what the resource
 * already holds, else the card's preview, else the skeleton. The resolved one takes the server's answer, or reads
 * through `/bff` once the session is ready when there was none (header mode) or it was `unauthorized`; any other
 * server failure shows its state without a browser read. «Повторить» scrolls the layer to the top and always reads
 * through `/bff`, showing the preview or the skeleton meanwhile; from then on the server's failure no longer counts.
 * An answer for another number (a merged listing) seeds that number and replaces the address once; a child route or
 * a sheet step opened over the alias's preview is stepped back over first, so the replace takes the alias's own entry
 * and Back reaches the page below (at depth 0 nothing is stepped over and the replace drops the child). A number left
 * before its answer came drops that answer (the resource aborts it). The resolved instance marks the number seen.
 */
export function useListing(number: number, { initial, flags = devFlags }: UseListingOptions): ListingView {
  const session = useSession();
  const router = useRouter();
  const { scrollToTop } = useContext(ListingLayerContext);
  const [retried, setRetried] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const resolved = initial !== undefined;
  const serverFailure = initial && !initial.ok && initial.error !== "unauthorized" && !retried ? initial : null;
  const enabled = resolved && session.status === "ready" && serverFailure === null;
  const resource = useResource<ListingRecord>(listingKey(number), fetchListing(number), {
    initial: initial?.ok ? initial.data : undefined,
    enabled,
    flags,
  });
  const { refetch } = resource;

  const retry = useCallback(() => {
    setRetried(true);
    setRetrying(true);
    scrollToTop();
    void refetch().finally(() => setRetrying(false));
  }, [refetch, scrollToTop]);

  // Not at mount: `onForbidden` acts only on a ready session, and in cookie mode the answer is here before it.
  const forbiddenShown = useRef(false);
  useEffect(() => {
    if (session.status === "ready" && serverFailure?.error === "forbidden" && flags.dev001AnyForbiddenShowsAccess && !forbiddenShown.current) {
      forbiddenShown.current = true;
      onForbidden();
    }
  }, [session.status, serverFailure, flags]);

  const other = resource.data && resource.data.listing.number !== number ? resource.data : null;
  const redirected = useRef(false);
  useEffect(() => {
    if (other !== null && !redirected.current) {
      redirected.current = true;
      seedResource(listingKey(other.listing.number), other);
      const target = routes.listing(other.listing.number);
      const above = entriesAboveListing();
      if (above === 0) {
        router.replace(target);
      } else {
        void backBy(above).then(() => router.replace(target));
      }
    }
  }, [other, router]);

  useEffect(() => {
    if (resolved) {
      markSeen(number);
    }
  }, [resolved, number]);

  const preview = getPreview(number);
  if (retrying) {
    return preview ? { state: "preview", preview } : { state: "skeleton" };
  }
  if (resource.data) {
    return { state: "loaded", details: resource.data.listing, source: resource.data.source };
  }
  const error = serverFailure ?? resource.error;
  if (error) {
    return errorView(error, retry);
  }
  return preview ? { state: "preview", preview } : { state: "skeleton" };
}

/** The children (photos, market, actions): the same resource, never reading; the card's preview while it is empty. */
export function useListingRecord(number: number | null): {
  details: ListingDetails | null;
  preview: ListingPreview | null;
  source: DataSource | undefined;
} {
  const resource = useResource<ListingRecord>(number === null ? null : listingKey(number), fetchListing(number ?? 0), { enabled: false });
  return {
    details: resource.data?.listing ?? null,
    preview: number === null ? null : getPreview(number),
    source: resource.data?.source,
  };
}
