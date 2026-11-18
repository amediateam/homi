"use client";

import { useEffect, useRef } from "react";

import { bffFetch } from "@/lib/api/browser";
import type { ApiFailure } from "@/lib/api/errors";
import type { ApiResult } from "@/lib/api/types";
import { type Fetcher, invalidate, readResource, type ResourceStatus, seedResource, useResource } from "@/lib/data/useResource";
import { type DevFlags, devFlags } from "@/lib/flags";
import { useSession } from "@/lib/session/SessionProvider";

import { useRadarsEnabled } from "./capability";
import { normalizeRadarList, type Radar } from "./normalize";

/**
 * The user's radars (WP-30): two cached lists of `GET /radars` — the plain one of the search tab (the footer's ✓,
 * the few-results note, the nudge rules) and the radar tab's with `include=previews`, one request for the whole tab
 * (BR-APP-063). `invalidate("radars")` reaches both keys and nothing else.
 */
export const RADARS_KEY = "radars";
export const RADARS_PREVIEWS_KEY = "radars?include=previews";

const LIST_KEYS = [RADARS_KEY, RADARS_PREVIEWS_KEY] as const;

export interface UseRadarsOptions {
  /** The radar tab's list, with the previews; the plain list by default. */
  previews?: boolean;
  /** The server's read in cookie mode, normalised on the client (`normalize.ts` is client only). */
  initial?: Radar[];
  /** The caller's own gate; ANDed with `useRadarsEnabled()` and a ready session. */
  enabled?: boolean;
  /** The app's flags; tests pass overrides (`withDevFlags`). */
  flags?: DevFlags;
}

export interface RadarList {
  radars: Radar[] | undefined;
  status: ResourceStatus;
  error: ApiFailure | null;
  refreshing: boolean;
  refetch: () => Promise<void>;
  /** `putRadar`: the server's answer for one radar replaces it in both lists. */
  replace: (radar: Radar) => void;
  /** `dropRadar`: a deleted radar leaves both lists. */
  remove: (id: string) => void;
}

/** One read of the list; `include=previews` for the tab. The answer is normalised before it is cached. */
async function readList(previews: boolean, signal?: AbortSignal): Promise<ApiResult<Radar[]>> {
  const result = await bffFetch<unknown>("radars", { query: previews ? { include: "previews" } : undefined, signal });
  return result.ok ? { ...result, data: normalizeRadarList(result.data) } : result;
}

const readPlain: Fetcher<Radar[]> = (signal) => readList(false, signal);
const readWithPreviews: Fetcher<Radar[]> = (signal) => readList(true, signal);

const sameId = (a: string, b: string): boolean => a.toUpperCase() === b.toUpperCase();

function withoutPreview(radar: Radar): Radar {
  if (radar.preview === undefined) {
    return radar;
  }
  const plain = { ...radar };
  delete plain.preview;
  return plain;
}

/**
 * A fresh `GET /radars` without previews for the subscribe flow (step 1): it seeds the plain list and answers it, or
 * `null` when the read failed — the caller then compares against the cached list (`readResource(RADARS_KEY)`).
 */
export async function fetchRadarList(): Promise<Radar[] | null> {
  try {
    const result = await readList(false);
    if (!result.ok) {
      return null;
    }
    seedResource(RADARS_KEY, result.data);
    return result.data;
  } catch {
    return null;
  }
}

/**
 * Writes the server's answer for one radar into both cached lists, where the radar is (by id, either case); a list
 * without it, or not loaded, is left as it is — a created radar arrives with the re-read that follows every success
 * (subscribe flow step 9), and on stubs, whose list never changes, it would vanish again. A mutation answer has no
 * `preview`, so the tab's list keeps the radar's old one; the plain list never holds one. The write goes through
 * `seedResource`, which also counts as a fresh read and clears a shown failure — right after the server answered.
 */
export function putRadar(radar: Radar): void {
  for (const key of LIST_KEYS) {
    const list = readResource<Radar[]>(key);
    if (list === undefined || !list.some((item) => sameId(item.id, radar.id))) {
      continue;
    }
    seedResource(
      key,
      list.map((item) => {
        if (!sameId(item.id, radar.id)) {
          return item;
        }
        if (key === RADARS_KEY) {
          return withoutPreview(radar);
        }
        return radar.preview === undefined ? { ...radar, preview: item.preview } : radar;
      }),
    );
  }
}

/** Takes a deleted radar out of both cached lists. */
export function dropRadar(id: string): void {
  for (const key of LIST_KEYS) {
    const list = readResource<Radar[]>(key);
    if (list !== undefined && list.some((item) => sameId(item.id, id))) {
      seedResource(
        key,
        list.filter((item) => !sameId(item.id, id)),
      );
    }
  }
}

/** Reads both lists again where they are on screen and forgets them elsewhere (after every radar success). */
export function refreshRadars(): void {
  invalidate(RADARS_KEY);
}

/**
 * A radar list on `useResource` (WP-22), read through `/bff` in both session modes; in cookie mode the tab's server
 * read comes in as `initial`. Nothing is requested while radars are switched off (`useRadarsEnabled()`, DEC-51), before
 * the session is ready, or while the caller's `enabled` is `false`. A launch that signed in (`renewed`) reads once
 * more over an `initial`, which the document's old cookie read.
 */
export function useRadars({ previews = false, initial, enabled = true, flags = devFlags }: UseRadarsOptions = {}): RadarList {
  const radarsOn = useRadarsEnabled();
  const session = useSession();
  const active = enabled && radarsOn && session.status === "ready";
  const resource = useResource<Radar[]>(previews ? RADARS_PREVIEWS_KEY : RADARS_KEY, previews ? readWithPreviews : readPlain, {
    initial,
    enabled: active,
    flags,
  });

  const { refetch } = resource;
  const hadInitial = initial !== undefined;
  const reread = useRef(false);
  useEffect(() => {
    if (active && session.renewed && hadInitial && !reread.current) {
      reread.current = true;
      void refetch();
    }
  }, [active, session.renewed, hadInitial, refetch]);

  return {
    radars: resource.data,
    status: resource.status,
    error: resource.error,
    refreshing: resource.refreshing,
    refetch,
    replace: putRadar,
    remove: dropRadar,
  };
}
