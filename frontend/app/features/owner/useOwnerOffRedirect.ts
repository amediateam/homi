"use client";

import { useEffect } from "react";

import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { useReference } from "@/lib/reference/useReference";

/**
 * The switched-off rule of the owner form's addresses (DEC-81; the pattern of `useRadarsOffRedirect`): `/owner/new`,
 * `/owner/<id>` and its steps, loaded directly or reached by a stale link while `owner_enabled` is not `true`, give
 * way to the settings tab. Once the reference data is there and the cabinet is off, one `nav.replace(routes.settings())`
 * and the hook returns `true`: the route renders nothing of the form and sends no owner request.
 *
 * While the reference data is missing it returns `false` and does nothing, as the radar rule does: whether the
 * cabinet is on is not known yet.
 */
export function useOwnerOffRedirect(): boolean {
  const { loaded, ownerEnabled } = useReference();
  const off = loaded && !ownerEnabled;

  useEffect(() => {
    if (off) {
      nav.replace(routes.settings());
    }
  }, [off]);

  return off;
}
