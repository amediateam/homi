import type { ReactNode } from "react";
import { serverApi } from "@/lib/api/server";
import { getSessionToken } from "@/lib/session/server";

import { SettingsScreen } from "./SettingsScreen";
import type { Hidden } from "./useHidden";
import type { Settings } from "./useSettings";

/**
 * The part of the settings layout that reads the cookie (WP-31; DEC-44, `25` §3.4), inside the layout's
 * `<Suspense>`. With the session cookie `GET /settings` and `GET /hidden` run here in parallel and seed the screen's
 * resources, which keep what they already hold: a later server render (a `router.refresh()` after a currency change)
 * never writes over an optimistic change. Without the cookie (header mode, the first request of a launch), or for an
 * answer that failed, the browser reads them through `/bff` once the session is ready. Nothing here is cached.
 */
export async function SettingsServer({ ownerGroup }: { ownerGroup?: ReactNode } = {}) {
  const token = await getSessionToken();
  if (token === null) {
    return <SettingsScreen ownerGroup={ownerGroup} />;
  }
  const api = await serverApi();
  const [settings, hidden] = await Promise.all([api.settings(), api.hidden()]);
  return (
    <SettingsScreen
      initialSettings={settings.ok ? (settings.data as Settings) : undefined}
      initialHidden={hidden.ok ? (hidden.data as Hidden) : undefined}
      ownerGroup={ownerGroup}
    />
  );
}
