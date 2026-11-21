"use client";

import type { Locale } from "@homi/config";
import { type Polygon, setGeography, toSearchParams } from "@homi/search";
import { cn } from "@homi/ui";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { type ComponentType, useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";

import { applyFilters } from "@/features/filters/applyFilters";
import { SourceReporter } from "@/features/shell/SourceReporter";
import { usePathname } from "@/i18n/navigation";
import { useSessionMap } from "@/lib/data/sessionMaps";
import { devFlags } from "@/lib/flags";
import { matchRoute, routes } from "@/lib/navigation/routes";
import { useLayerState } from "@/lib/navigation/useLayerState";
import { useReference } from "@/lib/reference/useReference";
import { searchRules } from "@/lib/search/rules";
import { useScreenSearchState } from "@/lib/search/useScreenSearchState";
import { useSession } from "@/lib/session/SessionProvider";
import { tg } from "@/lib/telegram";
import { consumeDrawRequest, setAreaTooSmall } from "@/lib/ui/shellState";

import { cityViewOf } from "./camera";
import { markGlFailed, useEngine } from "./engine";
import { LocateButton } from "./LocateButton";
import { MapAttribution } from "./MapAttribution";
import { MapLoading } from "./MapLoading";
import { MapNote } from "./MapNote";
import { MapSelectionCard } from "./MapSelectionCard";
import { MapStatusPill } from "./MapStatusPill";
import { MapViewBoundary } from "./MapViewBoundary";
import { attributionOf, type Basemap, basemapOf } from "./tiles";
import type { CityView, MapFailReason, MapViewProps, Selection } from "./types";
import { useCardLayer } from "./useCardLayer";
import { useDocumentLook } from "./useDocumentLook";
import { type LocateFailure, useLocate } from "./useLocate";
import { useMapPoints } from "./useMapPoints";

/** How long the "N of M" note stays after an answer (BR-APP-062). */
export const NOTE_MS = 6000;

/** How long a locate failure stays in the note's place (KV-FE-031). */
export const LOCATE_NOTE_MS = 5000;

/**
 * The view's chunk did not load: a GL failure like any other, so the session falls back (WP-27 "Engine choice").
 * Reported once per mount, also when StrictMode runs the effect twice: the screen closes a drawing on the report, and a
 * second Back would leave the map.
 */
function ViewChunkFailed({ onFail }: MapViewProps) {
  const reported = useRef(false);
  useEffect(() => {
    if (!reported.current) {
      reported.current = true;
      onFail("chunk");
    }
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

/** `cut`: the source cut the answer; `points`: listings known only by district (BR-APP-062, WP-37). */
type Note = { kind: "cut" } | { kind: "points" } | { kind: LocateFailure };

/**
 * The search map (SCR-011 … SCR-013, `03` §1.8, BR-APP-062): everything that is the same on both engines. The engine
 * of the session (`useEngine`) picks the view — a spinner until it is known, then GL or Leaflet — and a GL failure
 * the view reports moves the session to Leaflet for good (LB-APP-019, `markGlFailed`). Leaflet failing too (its
 * chunk or its library) shows the error pill, whose «Повторить» mounts the view anew and so loads it again. The map
 * lists the search of its own address (`useScreenSearchState`, KI-43); its points are a browser read (`useMapPoints`,
 * `25` §3.5), asked for only while the session is ready and the engine is known. Their answer's `meta.source` reaches
 * the demo marker again each time the map's own address is shown — Back from a listing opened from the card, a closed
 * sheet, a tab round trip — and never under a layer (`25` §4.4, KI-43).
 *
 * The selection is this screen's state. A pin, a stack, a spread pin or a cluster at maximum zoom selects; a light
 * haptic plays when the selected listings change, not when a spread pin only moves the track. The card closes on a
 * background tap, its ×, a new search, a new answer, a hidden listing among its numbers and drawing, and when the
 * route is hidden (`preserving-ui-state.md`): the view re-creates the map when it is shown again, so no card survives
 * without its pin. Under a listing opened from the card the route stays shown, so Back finds the same card.
 *
 * Over the map, below the top bar: the points' pill and the note for 6 s after an answer — «На карте — {n} самых
 * свежих. Остальные — в списке» when the source cut it (`cut`), else «На карте {shown} из {total} · …» when listings
 * have no location, never both (WP-37) — or a locate failure for 5 s in its place. A render error of the view stays in
 * the map (`MapViewBoundary`): the pill says «Не загрузилось» with «Повторить», which remounts the view. The locate button shows when
 * the adapter can locate, no card is open and nothing is drawn; the position stays in this state (TMA-035). The map
 * sends no analytics events of its own.
 *
 * Drawing (SCR-012, WP-28 "Drawing layer") is the `draw=1` layer on the map's own address; the view mounts the lasso
 * meanwhile, the card closes and no marker opens it, and the locate button hides (the top bar and the view toggle
 * follow the address, WP-23). The top bar's lasso button and area pill push the layer themselves; the filters sheet's
 * «Обвести на карте» asks with `requestDraw()`, which the screen takes once each time it is activated — mounted, shown
 * again by Activity, or its address back from a sheet or a listing — and then starts drawing (`startDrawing`). A
 * finished stroke plays the success haptic and applies the area through `applyFilters` (`setGeography` clears
 * districts and zones, BR-APP-008), which leaves the layer; a stroke too small plays the error haptic and sets
 * `areaTooSmall` for the top bar, and drawing goes on. Back and «Отмена» close the layer (`useBack`; a reload on
 * `draw=1` keeps drawing, and Back then replaces to the address without it). GL failing while drawing closes the
 * layer as it mounts Leaflet; the filters stay.
 */
export function MapScreen() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const engine = useEngine();
  const own = matchRoute(usePathname()).route === "map";
  const { filters, sort } = useScreenSearchState("map");
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

  const draw = useLayerState("draw");
  const drawing = own && draw.value === "1";
  const latestDraw = useRef({ drawing, closeDraw: draw.close });
  useLayoutEffect(() => {
    latestDraw.current = { drawing, closeDraw: draw.close };
  });
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
  const [noteSearch, setNoteSearch] = useState(points.queryKey);
  const countNote = note?.kind === "points" || note?.kind === "cut";
  if (noteSearch !== points.queryKey) {
    // Another search: the counts of the old answer go with it.
    setNoteSearch(points.queryKey);
    if (countNote) {
      setNote(null);
    }
  }
  if (noteFor !== points.responseId) {
    setNoteFor(points.responseId);
    // A cut answer never says «N из M»: its note is the cut one, or none when no point of it is shown.
    if (points.cut > 0) {
      if (points.shown > 0) {
        setNote({ kind: "cut" });
      } else if (countNote) {
        setNote(null);
      }
    } else if (points.missing > 0) {
      setNote({ kind: "points" });
    } else if (countNote) {
      setNote(null);
    }
  }
  useEffect(() => {
    if (note === null) {
      return undefined;
    }
    const timer = setTimeout(() => setNote(null), note.kind === "points" || note.kind === "cut" ? NOTE_MS : LOCATE_NOTE_MS);
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
    // A marker the lasso leaves uncovered (under the bars) opens no card while drawing.
    if (latestDraw.current.drawing) {
      return;
    }
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

  // As the top bar's lasso button does; the card closes when the layer reaches the address (`closeKey`).
  const startDrawing = useEffectEvent(() => {
    tg.haptic.impact();
    setAreaTooSmall(false);
    draw.open("1");
  });
  useEffect(() => {
    if (own && consumeDrawRequest()) {
      startDrawing();
    }
  }, [own]);

  const onDrawn = (area: Polygon) => {
    tg.haptic.success();
    void applyFilters(setGeography(filters, { polygon: area }), {
      sort,
      target: routes.map,
      city,
      rules: searchRules(devFlags),
    });
  };
  const onTooSmall = () => {
    tg.haptic.error();
    setAreaTooSmall(true);
  };
  // GL failed: the session moves to Leaflet, and a drawing under way is cancelled with its layer (WP-28).
  const onGlFail = useCallback((reason: MapFailReason) => {
    markGlFailed(reason);
    if (latestDraw.current.drawing) {
      latestDraw.current.closeDraw();
    }
  }, []);

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

  // A render error of either view (WP-37): the pill's «Повторить» remounts the boundary and the view.
  const [viewFailed, setViewFailed] = useState(false);
  const [viewAttempt, setViewAttempt] = useState(0);
  // The view is gone: its card and the locate button go with it, and a drawing is closed once the failure and the
  // drawing state of the same commit are known (the boundary reports before this screen's layout effects run).
  const onViewError = useCallback(() => {
    setViewFailed(true);
    setSelection(null);
  }, []);
  const closeDrawing = useEffectEvent(() => draw.close());
  useEffect(() => {
    if (viewFailed && drawing) {
      closeDrawing();
    }
  }, [viewFailed, drawing]);
  const retryView = useCallback(() => {
    tg.haptic.impact("light");
    setViewFailed(false);
    setViewAttempt((attempt) => attempt + 1);
  }, []);

  if (engine === null) {
    return <MapLoading />;
  }

  let noteText: string | null = null;
  if (note?.kind === "cut") {
    // Every point hidden since: no «0 самых свежих».
    noteText = points.shown > 0 ? t("map.cut", { n: points.shown }) : null;
  } else if (note?.kind === "points") {
    noteText = t("map.note", {
      shown: points.shown,
      total: points.shown + points.missing,
      missing: t("map.missing", { n: points.missing }),
    });
  } else if (note !== null) {
    noteText = t(note.kind === "denied" ? "map.locateDenied" : "map.locateFail");
  }

  const View = engine === "gl" ? MapViewGL : MapViewLeaflet;
  return (
    <>
      <div data-map-screen="" className="fixed inset-0">
        <MapViewBoundary key={viewAttempt} onError={onViewError}>
        <View
          key={engine === "gl" ? "gl" : `leaflet-${leafletAttempt}`}
          groups={points.groups}
          responseId={points.responseId}
          cameraKey={points.queryKey}
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
          drawing={drawing}
          onDrawn={onDrawn}
          onTooSmall={onTooSmall}
          onFail={engine === "gl" ? onGlFail : onLeafletFail}
          onBasemap={setDrawn}
        />
        </MapViewBoundary>
      </div>
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 z-(--z-map-note) flex flex-col items-center gap-[8px] px-(--gutter)",
          // Below the map's top bar: the bar, and the area pill under it while the filters hold a polygon.
          polygon === null ? "top-[calc(var(--top-inset)+70px)]" : "top-[calc(var(--top-inset)+114px)]",
        )}
      >
        {viewFailed ? (
          <MapStatusPill status="error" error={null} onRetry={retryView} />
        ) : engine === "leaflet" && leafletFailed ? (
          <MapStatusPill status="error" error={null} onRetry={retryLeaflet} />
        ) : (
          <MapStatusPill status={points.status} error={points.error} onRetry={points.retry} />
        )}
        <MapNote text={noteText} />
      </div>
      {locate.available && selection === null && !drawing && !viewFailed ? (
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
