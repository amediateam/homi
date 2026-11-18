import { isLocale, type Locale } from "@homi/config";
import { io } from "next/cache";
import { notFound } from "next/navigation";
import { locale as rootLocale } from "next/root-params";
import type { ReactNode } from "react";

import type { RoutePresentation } from "@/features/shell/RouteSheet";
import { SourceReporter } from "@/features/shell/SourceReporter";
import { serverApi } from "@/lib/api/server";
import type { DataSource } from "@/lib/data/sources";
import { isRadarId } from "@/lib/navigation/routes";
import { getReference } from "@/lib/reference/server";
import { getSessionToken } from "@/lib/session/server";

import { normalizeRadarList, type Radar } from "./normalize";
import { RadarScreen } from "./RadarScreen";
import { RadarSheetRoute } from "./RadarSheetRoute";

/** The `renderId` of a server render that did not look at the user (radars switched off): nothing to adopt. */
export const OFF_RENDER_ID = "off";

/** What the server part hands `RadarScreen`. */
export interface RadarTabRead {
  /** The tab's list with the previews (cookie mode), normalised; absent when the server did not read it. */
  initial?: Radar[];
  /** New on every server render that read the user (`RadarScreen` seeds its list from it once per value). */
  renderId: string;
  /** The server saw radars switched off (DEC-51), or could not read the reference data. */
  serverOff: boolean;
  /** `meta.source` of the server's read, for the demo marker. */
  source?: DataSource;
}

async function requestLocale(): Promise<Locale> {
  const value = await rootLocale();
  return typeof value === "string" && isLocale(value) ? value : "ru";
}

/**
 * The radar tab's server read (SCR-026, DEC-44, `25` §3.4), at request time only (the cookie is read first). Then the
 * cached reference data: while it says radars are switched off — or it could not be read, which the client treats the
 * same way (`useRadarsEnabled()`) — no radar request is sent (DEC-51). Otherwise, with the session cookie, one
 * `GET /radars?include=previews` (BR-APP-063: the whole tab in one request), normalised here (`normalize.ts` has no
 * directive). Without the cookie (header mode, the first request of a launch) and on `unauthorized` the browser
 * reads through `/bff` once the session is ready; any other failure is left to the browser too, whose read shows the
 * error state when it fails as well.
 *
 * The `renderId` is drawn after `io()`, not merely after the cookie read: with `partialPrefetching` the cookie
 * resolves in the runtime shell stage, where a random value would abort the runtime prefetch (`io.md`; WP-29). A tab
 * press or a title tab entering the radar tab renders it anew with a new `renderId`, and `RadarScreen` adopts that
 * read (legacy read the radar list on every entry of the tab); Back and the return from a layer keep the old one.
 */
export async function readRadarTab(): Promise<RadarTabRead> {
  // The cookie first: the tab is the user's, so nothing of it is prerendered. Read before the cookie, the cached
  // reference ran in the prerender of the sheet addresses, whose prospective render can stop before its fetch ends,
  // and the final render then missed the entry ("Unexpected cache miss after cache warming").
  const token = await getSessionToken();
  const reference = await getReference(await requestLocale());
  if (!reference.loaded || reference.data.radars_enabled !== true) {
    return { renderId: OFF_RENDER_ID, serverOff: true };
  }
  await io();
  const renderId = crypto.randomUUID();
  if (token === null) {
    return { renderId, serverOff: false };
  }
  const result = await (await serverApi()).radars(new URLSearchParams({ include: "previews" }));
  if (!result.ok) {
    return { renderId, serverOff: false };
  }
  return { initial: normalizeRadarList(result.data), renderId, serverOff: false, source: result.meta.source };
}

/**
 * The radar tab (SCR-026, SCR-027): the part that reads the reference data and the cookie, inside a `<Suspense>` of
 * the route file. The `/radars` page renders it, and so do the direct-load copies of the radar sheet addresses
 * (`/radars/<id>`, `/radars/new`, `/radars/<id>/edit`, `/radars/found`), so a reload shows the tab under the sheet as
 * a tap on a tile does. Nothing here is cached.
 */
export async function RadarTabServer() {
  const { source, ...props } = await readRadarTab();
  return (
    <>
      <SourceReporter source={source} />
      <RadarScreen {...props} />
    </>
  );
}

/**
 * The radar sheet of `/radars/<id>` (SCR-028) for both layouts: the layout's own `params` (a hidden copy of another
 * radar keeps its id), an id that is not a ULID is the not-found screen, and the editor (`children`) renders inside
 * the sheet, so the sheet stays mounted under it.
 */
export async function RadarSheetServer({
  params,
  presentation,
  children,
}: {
  params: Promise<{ id: string }>;
  presentation: RoutePresentation;
  children: ReactNode;
}) {
  const { id } = await params;
  if (!isRadarId(id)) {
    notFound();
  }
  return (
    <RadarSheetRoute id={id} presentation={presentation}>
      {children}
    </RadarSheetRoute>
  );
}
