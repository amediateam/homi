"use client";

import type { components } from "@homi/types";

import { bffFetch } from "@/lib/api/browser";
import type { ApiFailure } from "@/lib/api/errors";
import { type Fetcher, type ResourceStatus, useResource } from "@/lib/data/useResource";
import { useSession } from "@/lib/session/SessionProvider";

export { digestHours, formatDigestHours } from "./format";

/** `GET /settings` (WP-11): server values, read through `digestHours` and the like before they are shown. */
export type Settings = components["schemas"]["SettingsResource"];

export const SETTINGS_KEY = "settings";

export interface UseSettingsOptions {
  /** The caller's own gate; ANDed with a ready session. */
  enabled?: boolean;
}

export interface SettingsView {
  settings: Settings | undefined;
  status: ResourceStatus;
  error: ApiFailure | null;
  refetch: () => Promise<void>;
}

const readSettings: Fetcher<Settings> = (signal) => bffFetch<Settings>("settings", { signal });

/**
 * The user's settings on `useResource` (WP-30 for the digest hint of the radar sheet; WP-31 extends it for the
 * settings pages), read through `/bff` in both session modes once the session is ready. Legacy read them on every
 * mount of the radar sheet; the resource reads again when its entry is older than 30 s.
 */
export function useSettings({ enabled = true }: UseSettingsOptions = {}): SettingsView {
  const session = useSession();
  const resource = useResource<Settings>(SETTINGS_KEY, readSettings, { enabled: enabled && session.status === "ready" });
  return { settings: resource.data, status: resource.status, error: resource.error, refetch: resource.refetch };
}
