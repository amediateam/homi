"use client";

import { useEffect } from "react";

import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { useReference } from "@/lib/reference/useReference";

import { useRadarsEnabled } from "./capability";

/**
 * The switched-off rule of the four radar sheet addresses (DEC-51): `/radars/new`, `/radars/<id>`,
 * `/radars/<id>/edit` and `/radars/found`, loaded directly or reached by a stale link while radars are off, give way
 * to the tab, which shows its "soon" state. Once the reference data is there and `useRadarsEnabled()` is `false`, one
 * `nav.replace(routes.radars())` (the effect runs again only when that answer changes, so a refresh of the reference
 * data does not replace twice; a cached copy shown again redirects anew, its effects having been cleaned up while it
 * was hidden), and the hook returns `true`: the page renders nothing of the sheet.
 *
 * While the reference data is missing it returns `false` and does nothing — the server render and the hydration
 * render have no reference data (`ReferenceProvider` feeds it in a layout effect), so the server HTML of a direct
 * load still holds the sheet; whether radars are on is not known yet. With radars on it returns `false` as well.
 */
export function useRadarsOffRedirect(): boolean {
  const { loaded } = useReference();
  const enabled = useRadarsEnabled();
  const off = loaded && !enabled;

  useEffect(() => {
    if (off) {
      nav.replace(routes.radars());
    }
  }, [off]);

  return off;
}
