"use client";

import type { components } from "@homi/types";
import { useCallback, useMemo } from "react";

import { bffFetch } from "@/lib/api/browser";
import { type Fetcher, readResource, type ResourceStatus, seedResource, useResource } from "@/lib/data/useResource";
import { useSession } from "@/lib/session/SessionProvider";

/** `GET /hidden` (WP-13): the hidden listings as previews and the blocked authors with their entry ids. */
export type Hidden = components["schemas"]["HiddenOverviewResource"];
export type HiddenAuthor = components["schemas"]["BlockedAuthorResource"];

export const HIDDEN_KEY = "hidden";

const readHidden: Fetcher<Hidden> = (signal) => bffFetch<Hidden>("hidden", { signal });

/** The two lists of `value`, or empty lists for an answer that is not the shape (it fails silently, as legacy). */
export function hiddenLists(value: unknown): Hidden {
  if (typeof value !== "object" || value === null) {
    return { listings: [], authors: [] };
  }
  const { listings, authors } = value as { listings?: unknown; authors?: unknown };
  return {
    listings: Array.isArray(listings) ? (listings as Hidden["listings"]) : [],
    authors: Array.isArray(authors) ? (authors as Hidden["authors"]) : [],
  };
}

export interface HiddenView {
  /** `null` until the list arrived; a failed read stays `null` (the «Лента» group is simply absent). */
  hidden: Hidden | null;
  status: ResourceStatus;
  /** Hidden listings plus blocked authors (BR-APP-053); 0 until the list arrived. */
  count: number;
  /** Writes the lists shown (an optimistic removal or a rollback); the entry stays fresh. */
  set: (next: Hidden) => void;
  /** The lists shown now, read outside a render (a rollback after other changes, legacy's functional update). */
  current: () => Hidden;
  refetch: () => Promise<void>;
}

/** The hidden list on `useResource` (WP-31): «Скрытое» and the count of the settings row read the one entry. */
export function useHidden({ initial }: { initial?: Hidden } = {}): HiddenView {
  const session = useSession();
  const resource = useResource<Hidden>(HIDDEN_KEY, readHidden, { enabled: session.status === "ready", initial });
  const hidden = useMemo(() => (resource.data === undefined ? null : hiddenLists(resource.data)), [resource.data]);
  const set = useCallback((next: Hidden) => seedResource(HIDDEN_KEY, next), []);
  const current = useCallback(() => hiddenLists(readResource<Hidden>(HIDDEN_KEY)), []);
  const count = hidden === null ? 0 : hidden.listings.length + hidden.authors.length;
  return useMemo(
    () => ({ hidden, status: resource.status, count, set, current, refetch: resource.refetch }),
    [hidden, resource.status, count, set, current, resource.refetch],
  );
}
