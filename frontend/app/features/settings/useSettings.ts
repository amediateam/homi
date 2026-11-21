"use client";

import type { components } from "@homi/types";
import { useCallback, useMemo } from "react";

import { bffFetch } from "@/lib/api/browser";
import type { ApiFailure } from "@/lib/api/errors";
import { type Fetcher, type ResourceStatus, seedResource, useResource } from "@/lib/data/useResource";
import { useSession } from "@/lib/session/SessionProvider";

export { digestHours, formatDigestHours } from "./format";

/** `GET /settings` (WP-11): server values, read through `format.ts` before they are shown. */
export type Settings = components["schemas"]["SettingsResource"];

export const SETTINGS_KEY = "settings";

export interface UseSettingsOptions {
  /** The caller's own gate; ANDed with a ready session. */
  enabled?: boolean;
  /** The settings layout's server read (cookie mode): shown at once when the cache holds nothing yet. */
  initial?: Settings;
}

export interface SettingsView {
  settings: Settings | undefined;
  status: ResourceStatus;
  error: ApiFailure | null;
  refetch: () => Promise<void>;
  /** Optimistic: the change is shown at once, before the save; returns the settings it replaced, for a rollback. */
  patch: (change: Partial<Settings>) => Settings | undefined;
  /** The answer of a save (or the settings a rollback restores) replaces what is shown. */
  replace: (settings: Settings) => void;
}

const readSettings: Fetcher<Settings> = (signal) => bffFetch<Settings>("settings", { signal });

/**
 * The user's settings on `useResource` (WP-30 for the digest hint of the radar sheet; WP-31 for the settings pages),
 * read through `/bff` in both session modes once the session is ready, or taken from the layout's server read. Every
 * user reads the one entry, so the radar sheet's «Списком в …» follows a save on the digest page without a refetch.
 * Legacy read them on every mount of the radar sheet; the resource reads again when its entry is older than 30 s.
 *
 * On stubs `GET /settings` always answers the fixture and `PATCH` answers the fixture with the sent keys: nothing is
 * stored, so a save shows until the entry is read again (KI-68).
 */
export function useSettings({ enabled = true, initial }: UseSettingsOptions = {}): SettingsView {
  const session = useSession();
  const resource = useResource<Settings>(SETTINGS_KEY, readSettings, { enabled: enabled && session.status === "ready", initial });
  const { mutate } = resource;
  const data = resource.data;
  const patch = useCallback(
    (change: Partial<Settings>) => {
      const before = data;
      mutate((current) => ({ ...(current as Settings), ...change }));
      return before;
    },
    [data, mutate],
  );
  const replace = useCallback((settings: Settings) => seedResource(SETTINGS_KEY, settings), []);
  return useMemo(
    () => ({ settings: data, status: resource.status, error: resource.error, refetch: resource.refetch, patch, replace }),
    [data, resource.status, resource.error, resource.refetch, patch, replace],
  );
}
