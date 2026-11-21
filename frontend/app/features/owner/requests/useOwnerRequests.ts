"use client";

import { useCallback, useRef, useState } from "react";

import { bffFetch } from "@/lib/api/browser";
import type { ApiFailure } from "@/lib/api/errors";
import { useResource } from "@/lib/data/useResource";

/** One request as «Отклики» shows it (SCR-058, DEC-76: the first name the server stored, nothing else of the seeker). */
export interface OwnerRequestView {
  id: string;
  name: string | null;
  who: string;
  people: number;
  moveIn: string | null;
  message: string | null;
  status: string;
  agentMarked: boolean;
  canReason: boolean;
  canUndo: boolean;
  canLate: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);

/** A request of the answer, or `null` when it has no id; unknown `who` and `status` are kept for the fallback label. */
export function normalizeRequest(value: unknown): OwnerRequestView | null {
  if (!isRecord(value) || text(value.id) === null) {
    return null;
  }
  const people = typeof value.people === "number" && Number.isFinite(value.people) ? Math.max(1, Math.floor(value.people)) : 1;
  return {
    id: value.id as string,
    name: text(value.name),
    who: text(value.who) ?? "",
    people,
    moveIn: text(value.move_in),
    message: text(value.message),
    status: text(value.status) ?? "",
    agentMarked: value.agent_marked === true,
    canReason: value.can_reason === true,
    canUndo: value.can_undo === true,
    canLate: value.can_late === true,
  };
}

/** The page size of «Отклики» (SCR-058). */
export const REQUESTS_PAGE = 20;

/**
 * The key of a listing's requests. It is outside `OWNER_PREFIX` on purpose: `invalidateOwner()` after an answer must
 * not read page one again over the pages loaded below it; the answer replaces its card, and a `409` reloads.
 */
export function ownerRequestsKey(id: string): string {
  return `owner-requests/${id}`;
}

interface Page {
  items: OwnerRequestView[];
  next: string | null;
}

function readPage(id: string, cursor: string | null, signal?: AbortSignal) {
  return bffFetch<unknown[]>(`owner/listings/${id}/requests`, {
    query: { limit: REQUESTS_PAGE, ...(cursor === null ? {} : { cursor }) },
    ...(signal === undefined ? {} : { signal }),
  });
}

function pageOf(data: unknown[], next: string | null | undefined): Page {
  return { items: data.map(normalizeRequest).filter((item): item is OwnerRequestView => item !== null), next: next ?? null };
}

export interface OwnerRequests {
  items: OwnerRequestView[];
  /** Page one has answered (also with an empty list). */
  loaded: boolean;
  /** Page one failed and nothing is shown. */
  error: ApiFailure | null;
  /** More pages exist (`meta.next_cursor`). */
  more: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
  /** Page one again (a `409 request_answer_closed`, «Повторить»). */
  reload: () => Promise<void>;
  /** An answered request in place of its card; a missing name keeps the old one. */
  replace: (request: OwnerRequestView) => void;
}

/**
 * «Отклики» of one listing (WP-82, SCR-058): newest first, 20 per page by `meta.next_cursor`; a cursor is asked for
 * once, and a page that repeats an id adds nothing for it.
 */
export function useOwnerRequests(listingId: string | null): OwnerRequests {
  const resource = useResource<Page>(listingId === null ? null : ownerRequestsKey(listingId), async (signal) => {
    const result = await readPage(listingId ?? "", null, signal);
    return result.ok ? { ...result, data: pageOf(result.data, result.meta.next_cursor) } : result;
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const used = useRef(new Set<string>());
  const { data, mutate, refetch } = resource;

  const loadMore = useCallback(async () => {
    const cursor = data?.next ?? null;
    if (listingId === null || cursor === null || used.current.has(cursor)) {
      return;
    }
    used.current.add(cursor);
    setLoadingMore(true);
    const result = await readPage(listingId, cursor);
    setLoadingMore(false);
    if (!result.ok) {
      // The cursor may be asked for again.
      used.current.delete(cursor);
      return;
    }
    const page = pageOf(result.data, result.meta.next_cursor);
    mutate((current) => {
      const known = new Set((current?.items ?? []).map((item) => item.id));
      return { items: [...(current?.items ?? []), ...page.items.filter((item) => !known.has(item.id))], next: page.next };
    });
  }, [data?.next, listingId, mutate]);

  const reload = useCallback(async () => {
    used.current.clear();
    await refetch();
  }, [refetch]);

  const replace = useCallback(
    (request: OwnerRequestView) =>
      mutate((current) => ({
        items: (current?.items ?? []).map((item) => (item.id === request.id ? { ...request, name: request.name ?? item.name } : item)),
        next: current?.next ?? null,
      })),
    [mutate],
  );

  return {
    items: data?.items ?? [],
    loaded: data !== undefined,
    error: data === undefined ? resource.error : null,
    more: data?.next !== null && data?.next !== undefined,
    loadingMore,
    loadMore,
    reload,
    replace,
  };
}
