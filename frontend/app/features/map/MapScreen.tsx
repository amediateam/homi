"use client";

import type { Locale } from "@homi/config";
import { toSearchParams } from "@homi/search";
import { cn } from "@homi/ui";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { type ComponentType, useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";

import { SourceReporter } from "@/features/shell/SourceReporter";
import { usePathname } from "@/i18n/navigation";
import { useSessionMap } from "@/lib/data/sessionMaps";
import { matchRoute } from "@/lib/navigation/routes";
import { useLayerState } from "@/lib/navigation/useLayerState";
import { useReference } from "@/lib/reference/useReference";
import { useScreenSearchState } from "@/lib/search/useScreenSearchState";
import { useSession } from "@/lib/session/SessionProvider";
import { tg } from "@/lib/telegram";
import { consumeDrawRequest } from "@/lib/ui/shellState";

import { cityViewOf } from "./camera";
import { markGlFailed, useEngine } from "./engine";
import { LocateButton } from "./LocateButton";
import { MapAttribution } from "./MapAttribution";
import { MapLoading } from "./MapLoading";
import { MapNote } from "./MapNote";
import { MapSelectionCard } from "./MapSelectionCard";
import { MapStatusPill } from "./MapStatusPill";
import { attributionOf, type Basemap, basemapOf } from "./tiles";
import type { CityView, MapViewProps, Selection } from "./types";
import { useCardLayer } from "./useCardLayer";
import { useDocumentLook } from "./useDocumentLook";
import { type LocateFailure, useLocate } from "./useLocate";
import { useMapPoints } from "./useMapPoints";

/** How long the "N of M" note stays after an answer (BR-APP-062). */
export const NOTE_MS = 6000;

/** How long a locate failure stays in the note's place (KV-FE-031). */
export const LOCATE_NOTE_MS = 5000;

/** The view's chunk did not load: a GL failure like any other, so the session falls back (WP-27 "Engine choice"). */
function ViewChunkFailed({ onFail }: MapViewProps) {
  useEffect(() => {
    onFail("chunk");
  }, [onFail]);
  return null;
}

/** MapLibre GL's view: client only, loaded when the engine is GL (`lazy-loading.md`, LB-APP-018). */
const MapViewGL = dynamic<MapViewProps>(() => import("./gl/MapViewGL").catch(() => ({ default: ViewChunkFailed })), {
  ssr: false,
  loading: MapLoading,
});

/**
 * The Leaflet view after its chunk failed to load: `next/dynamic` keeps a loader's first answer, so each mount of
 * this stand-in asks for the chunk again and renders the view once it arrives; a failure is reported to `MapScreen`,
 * which shows the error pill whose «Повторить» mounts it anew (WP-28 "Leaflet view").
 */
function LeafletChunkRetry(props: MapViewProps) {
  const { onFail } = props;
  const [View, setView] = useState<ComponentType<MapViewProps> | null>(null);
  useEffect(() => {
    let live = true;
    import("./leaflet/MapViewLeaflet").then(
      (module) => {
        if (live) {
          setView(() => module.default);
        }
      },
      () => {
        if (live) {
          onFail("chunk");
        }
      },
    );
    return () => {
      live = false;
    };
  }, [onFail]);
  return View === null ? <MapLoading /> : <View {...props} />;
}

/** Leaflet's view: client only, loaded when the engine is Leaflet — by the rule or after a GL failure (WP-28). */
const MapViewLeaflet = dynamic<MapViewProps>(
  () => import("./leaflet/MapViewLeaflet").catch(() => ({ default: LeafletChunkRetry })),
  { ssr: false, loading: MapLoading },
);

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((number, index) => number === b[index]);
}

type Note = { kind: "points" } | { kind: LocateFailure };

/**
 * The search map (SCR-011 … SCR-013, `03` §1.8, BR-APP-062): everything that is the same on both engines. The engine
 * of the session (`useEngine`) picks the view — a spinner until it is known, then GL or Leaflet — and a GL failure
 * the view reports moves the session to Leaflet for good (LB-APP-019, `markGlFailed`). Leaflet failing too (its
 * chunk or its library) shows the error pill, whose «Повторить» mounts the view anew and so loads it again. The map lists the search of
 * its own address (`useScreenSearchState`, KI-43); its points are a browser read (`useMapPoints`, `25` §3.5), asked
 * for only while the session is ready and the engine is known. Their answer's `meta.source` reaches the demo
 * marker again each time the map's own address is shown — Back from a listing opened from the card, a closed sheet, a
 * tab round trip — and never under a layer (`25` §4.4, KI-43).
 *
 * The selection is this screen's state. A pin, a stack, a spread pin or a cluster at maximum zoom selects; a light
 * haptic plays when the selected listings change, not when a spread pin only moves the track. The card closes on a
 * background tap, its ×, a new search, a new answer, a hidden listing among its numbers and drawing, and when the
 * route is hidden (`preserving-ui-state.md`): the view re-creates the map when it is shown again, so no card survives
 * without its pin. Under a listing opened from the card the route stays shown, so Back finds the same card.
 *
 * Over the map, below the top bar: the points' pill and the note — «На карте {shown} из {total} · …» for 6 s after an
 * answer with listings that have no location, or a locate failure for 5 s in its place. The locate button shows when
 * the adapter can locate, no card is open and nothing is drawn; the position stays in this state (TMA-035). Until
 * WP-28 a `draw` layer is closed as soon as it opens, each time it opens, and a pending draw request is discarded, so
 * every entry point lands on the plain map. The map sends no analytics events of its own.
 */
export function MapScreen() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const engine = useEngine();
  const own = matchRoute(usePathname()).route === "map";
  const { filters } = useScreenSearchState("map");
  const { status } = useSession();
  const points = useMapPoints(filters, { enabled: status === "ready" && engine !== null });
  const hidden = useSessionMap("hidden");
  const { loaded, reference, findCity } = useReference();
  const { scheme, lite } = useDocumentLook();

  const city = findCity(filters.city);
  const view = cityViewOf(city);
  const [cityLat, cityLon] = view.center;
  const cityZoom = view.zoom;
  const cityView = useMemo<CityView>(() => ({ center: [cityLat, cityLon], zoom: cityZoom }), [cityLat, cityLon, cityZoom]);
  const polygon = filters.polygon !== null && filters.polygon.length > 0 ? filters.polygon : null;
  const tiles = loaded ? (reference.map?.tiles_url ?? null) : undefined;
  // The view reports what it draws: after a vector failure the raster, «© OpenStreetMap» alone.
  const [drawn, setDrawn] = useState<Basemap | null>(null);
  const attribution = attributionOf(drawn ?? basemapOf(tiles));

  // Once per opening: a second Back for the same opening would close the page below as well.
  const draw = useLayerState("draw");
  const layerOpen = draw.value !== null;
  const drawing = own && layerOpen;
  const closingDraw = useRef(false);
  const closeDraw = useEffectEvent(() => draw.close());
  useEffect(() => {
    if (!layerOpen) {
      closingDraw.current = false;
    } else if (drawing && !closingDraw.current) {
      closingDraw.current = true;
      closeDraw();
    }
  }, [layerOpen, drawing]);
  useEffect(() => {
    if (own) {
      consumeDrawRequest();
    }
  }, [own]);

  // Adjusted while rendering, as `useMapPoints` does: another search, a new answer or drawing closes the card.
  const closeKey = `${toSearchParams(filters).toString()}|${points.responseId}|${drawing}`;
  const [selection, setSelection] = useState<Selection>(null);
  const [openFor, setOpenFor] = useState(closeKey);
  if (openFor !== closeKey || (selection !== null && selection.numbers.some((number) => hidden.has(number)))) {
    setOpenFor(closeKey);
    setSelection(null);
  }

  const [note, setNote] = useState<Note | null>(null);
  const [noteFor, setNoteFor] = useState(points.responseId);
  if (noteFor !== points.responseId) {
    setNoteFor(points.responseId);
    if (points.missing > 0) {
      setNote({ kind: "points" });
    } else if (note?.kind === "points") {
      setNote(null);
    }
  }
  useEffect(() => {
    if (note === null) {
      return undefined;
    }
    const timer = setTimeout(() => setNote(null), note.kind === "points" ? NOTE_MS : LOCATE_NOTE_MS);
    return () => clearTimeout(timer);
  }, [note]);

  useLayoutEffect(
    () => () => {
      setSelection(null);
      setNote(null);
    },
    [],
  );

  const shown = useRef<Selection>(null);
  useLayoutEffect(() => {
    shown.current = selection;
  }, [selection]);
  const onSelect = useCallback((numbers: number[], at = 0) => {
    const open = shown.current;
    if (open !== null && sameNumbers(open.numbers, numbers)) {
      if (open.at !== at) {
        setSelection({ numbers: open.numbers, at });
      }
      return;
    }
    tg.haptic.impact();
    setSelection({ numbers, at });
  }, []);
  const onIndex = useCallback((at: number) => {
    setSelection((open) => (open === null || open.at === at ? open : { numbers: open.numbers, at }));
  }, []);
  const close = useCallback(() => setSelection(null), []);
  useCardLayer(selection, close);

  const onLocateFailure = useCallback((failure: LocateFailure) => setNote({ kind: failure }), []);
  const locate = useLocate(onLocateFailure);

  // Leaflet is the last engine: its failure is shown, and «Повторить» mounts the view anew.
  const [leafletFailed, setLeafletFailed] = useState(false);
  const [leafletAttempt, setLeafletAttempt] = useState(0);
  const onLeafletFail = useCallback(() => setLeafletFailed(true), []);
  const retryLeaflet = useCallback(() => {
    setLeafletFailed(false);
    setLeafletAttempt((attempt) => attempt + 1);
  }, []);

  if (engine === null) {
    return <MapLoading />;
  }

  let noteText: string | null = null;
  if (note?.kind === "points") {
    noteText = t("map.note", { shown: points.shown, total: points.total, missing: t("map.missing", { n: points.missing }) });
  } else if (note !== null) {
    noteText = t(note.kind === "denied" ? "map.locateDenied" : "map.locateFail");
  }

  const View = engine === "gl" ? MapViewGL : MapViewLeaflet;
  return (
    <>
      <div data-map-screen="" className="fixed inset-0">
        <View
          key={engine === "gl" ? "gl" : `leaflet-${leafletAttempt}`}
          groups={points.groups}
          responseId={points.responseId}
          selection={selection}
          onSelect={onSelect}
          onBackground={close}
          polygon={polygon}
          cityView={cityView}
          cityKnown={city !== null}
          tiles={tiles}
          locale={locale}
          scheme={scheme}
          lite={lite}
          me={locate.me}
          drawing={false}
          onFail={engine === "gl" ? markGlFailed : onLeafletFail}
          onBasemap={setDrawn}
        />
      </div>
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 z-(--z-map-note) flex flex-col items-center gap-[8px] px-(--gutter)",
          // Below the map's top bar: the bar, and the area pill under it while the filters hold a polygon.
          polygon === null ? "top-[calc(var(--top-inset)+70px)]" : "top-[calc(var(--top-inset)+114px)]",
        )}
      >
        {engine === "leaflet" && leafletFailed ? (
          <MapStatusPill status="error" error={null} onRetry={retryLeaflet} />
        ) : (
          <MapStatusPill status={points.status} error={points.error} onRetry={points.retry} />
        )}
        <MapNote text={noteText} />
      </div>
      {locate.available && selection === null && !drawing ? (
        <div className="fixed right-(--chrome-side) bottom-[calc(var(--tabbar-h)+var(--bottom-inset)+22px)] z-(--z-view-toggle)">
          <LocateButton busy={locate.busy} onLocate={locate.locate} />
        </div>
      ) : null}
      {attribution !== null ? (
        <div className="pointer-events-none fixed bottom-[calc(var(--tabbar-h)+var(--bottom-inset)+12px)] left-(--chrome-side) z-(--z-map-note)">
          <MapAttribution kind={attribution} />
        </div>
      ) : null}
      {selection !== null ? <MapSelectionCard selection={selection} onIndex={onIndex} onClose={close} /> : null}
      <SourceReporter source={own ? points.source : undefined} />
    </>
  );
}
