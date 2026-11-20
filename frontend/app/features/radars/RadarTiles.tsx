"use client";

import type { Locale } from "@homi/config";
import { labelFor } from "@homi/i18n";
import { formatCount, type Translate } from "@homi/i18n/format";
import { filtersAreaSummary, filtersTitle, type SummaryContext } from "@homi/search";
import { cn, RadarIcon, Switch } from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useId, useMemo } from "react";

import { Photo } from "@/features/feed/Photo";
import { patchRadar } from "@/lib/actions/radars";
import { invokeAction } from "@/lib/actions/useAction";
import type { ApiFailure } from "@/lib/api/errors";
import { reportI18n } from "@/lib/errors/report";
import { type DevFlags, devFlags } from "@/lib/flags";
import { useMoney } from "@/lib/money/useMoney";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { useReference } from "@/lib/reference/useReference";
import { tg } from "@/lib/telegram";
import { isNoChat, withChatAccess } from "@/lib/telegram/chatAccess";
import { failed } from "@/lib/ui/feedback";
import { showToast } from "@/lib/ui/toast";

import { normalizePatch, type Radar } from "./normalize";
import { radarStatus } from "./radarStatus";
import { noChatToast, soonToast } from "./toasts";
import type { RadarFinds } from "./useRadarPreviews";
import { putRadar, refreshRadars } from "./useRadars";

/** The collage shows the covers of at most this many finds (legacy `radar-coll.n4`). */
export const COLLAGE_COVERS = 4;

/** The texts of a radar on the tab and in the sheet: title, «where» and the status line. */
export interface RadarText {
  title: (radar: Radar) => string;
  area: (radar: Radar) => string;
  status: (radar: Radar, flow: unknown) => string;
}

/**
 * The texts of a radar (BR-APP-064, BR-APP-065): `filtersTitle` («2-комн. · до $600»), `filtersAreaSummary` in the
 * user's currency with the cities of the reference data (the area waits for their names), and `radarStatus` with
 * `dev021OneFlowVocabulary` from `flags`. Server values go through the label tables, so an unknown one reads «Другое»
 * and is reported once.
 */
export function useRadarText(flags: DevFlags = devFlags): RadarText {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const money = useMoney();
  const { cities } = useReference();
  return useMemo(() => {
    const translate: Translate = (key, values) => t(key as never, values as never);
    const ctx: SummaryContext = {
      t: (key, values) => t(key as never, values as never),
      formatPrice: money.format,
      cities,
      label: (table, value) => labelFor(table, value, reportI18n),
    };
    return {
      title: (radar) => filtersTitle(radar.filters, ctx),
      area: (radar) => filtersAreaSummary(radar.filters, ctx),
      status: (radar, flow) =>
        radarStatus(radar, flow, { t: translate, locale, oneVocabulary: flags.dev021OneFlowVocabulary, report: reportI18n }),
    };
  }, [t, locale, money, cities, flags]);
}

/**
 * A radar write that failed (SCR-026, SCR-028, BR-APP-048), after the caller reverted its optimistic change: radars
 * switched off on the server since the reference data was cached → «Радар скоро заработает» (DEC-51); `no_chat` (only
 * switching on asks for the chat) → «Радар не включён — боту нужно разрешение…»; an unknown radar (deleted in the bot)
 * → the lists are read again and `gone` runs (the sheet gives way to the tab), with `failed()`; anything else →
 * `failed()`: the error haptic and «Не получилось сохранить», as legacy since `index-CIa0Ldj2.js` — a `409` limit answer
 * of the switch too (LB-APP-081, reproduced).
 */
export function radarActionFailed(result: ApiFailure, { flags = devFlags, gone }: { flags?: DevFlags; gone?: () => void } = {}): void {
  if (result.error === "radars_disabled") {
    tg.haptic.error();
    showToast(soonToast());
    return;
  }
  if (isNoChat(result)) {
    tg.haptic.error();
    showToast(noChatToast());
    return;
  }
  if (result.error === "not_found") {
    refreshRadars();
    gone?.();
  }
  failed({ flags });
}

/** Where the switch was pressed: the survey after a pause is pushed from a tile and replaces the radar sheet. */
export interface SwitchContext {
  from: "tile" | "sheet";
  /** The radar is gone (`not_found`): the sheet gives way to the tab. */
  gone?: () => void;
}

/** Radars whose switch is in flight (shared by the tile and the sheet of a radar); a second press waits for it. */
const switching = new Set<string>();

/** Forgets the switches in flight; tests only. */
export function resetRadarSwitches(): void {
  switching.clear();
}

/**
 * The switch of a radar, on its tile and in its sheet (SCR-026, SCR-028; legacy `RadarScreen.toggle`): a light
 * impact and the new state at once, in both cached lists (`putRadar`). Switching on goes through `withChatAccess`
 * (`patchRadar({ id, active: true })`), pausing is a plain patch (BR-APP-048). The answer replaces the radar; switching
 * on with `starter > 0` → «Радар снова включён. В чате с ботом — непросмотренные: {count}» (`subs.resumed`); an
 * answer with `ask_found` opens the survey with the trigger `pause` — pushed from a tile, replacing the sheet from the
 * sheet, so Back lands on the tab. A failure restores the radar as it was and goes to `radarActionFailed`. Presses
 * while the radar's switch is in flight are ignored.
 */
export function useRadarSwitch(flags: DevFlags = devFlags): (radar: Radar, active: boolean, context: SwitchContext) => Promise<void> {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  return useCallback(
    async (radar, active, { from, gone }) => {
      const key = radar.id.toUpperCase();
      if (switching.has(key)) {
        return;
      }
      switching.add(key);
      tg.haptic.impact();
      putRadar({ ...radar, active });
      const translate: Translate = (message, values) => t(message as never, values as never);
      const patch = () => invokeAction(patchRadar, { id: radar.id, active }, locale);
      try {
        const result = active ? await withChatAccess(patch, { restartText: translate("chat.restart") }) : await patch();
        if (!result.ok) {
          putRadar(radar);
          radarActionFailed(result, { flags, gone });
          return;
        }
        const answer = normalizePatch(result.data);
        putRadar(answer.radar ?? { ...radar, active });
        if (active && answer.starter > 0) {
          showToast({ key: "subs.resumed", values: { count: formatCount(answer.starter, "listings", locale, translate) } });
        }
        if (answer.askFound) {
          const survey = routes.radarFound({ trigger: "pause" });
          if (from === "tile") {
            nav.push(survey);
          } else {
            nav.replace(survey);
          }
        }
      } finally {
        switching.delete(key);
      }
    },
    [t, locale, flags],
  );
}

/** The covers of a radar's finds, newest first: each find's cover, else its first photo; at most `COLLAGE_COVERS`. */
export function collageCovers(finds: RadarFinds["finds"]): string[] {
  const covers: string[] = [];
  for (const item of finds ?? []) {
    const cover = item.photos.cover ?? item.photos.preview[0] ?? null;
    if (cover !== null && cover !== "") {
      covers.push(cover);
    }
  }
  return covers.slice(0, COLLAGE_COVERS);
}

/** The cell layout per number of covers (legacy `radar-coll.n0` … `n4`): one, two columns, one tall and two, 2×2. */
const COLLAGE_GRID: Readonly<Record<number, string>> = {
  0: "grid-cols-1 grid-rows-1 place-items-center",
  1: "grid-cols-1 grid-rows-1",
  2: "grid-cols-2 grid-rows-1",
  3: "grid-cols-2 grid-rows-2 [&>*:first-child]:row-span-2",
  4: "grid-cols-2 grid-rows-2",
};

/**
 * The 84 px collage of a tile (SCR-026, legacy `radar-coll`): the covers of up to four latest finds in a 2 px grid,
 * or the radar icon when there is none. A paused radar's collage is grey and dimmed (legacy: only the collage, the
 * title turns hint-coloured). Decorative: the tile's text names the radar.
 */
export function RadarCollage({ covers, paused }: { covers: readonly string[]; paused: boolean }) {
  return (
    <span
      data-radar-collage={covers.length}
      aria-hidden
      className={cn(
        "grid size-[84px] shrink-0 gap-[2px] overflow-hidden rounded-[14px] bg-fill text-hint",
        COLLAGE_GRID[covers.length],
        paused && "brightness-[.7] grayscale",
      )}
    >
      {covers.length === 0 ? (
        <RadarIcon size={28} />
      ) : (
        covers.map((cover, index) => (
          <span key={`${index}:${cover}`} data-radar-cover="" className="relative block min-h-0 min-w-0 overflow-hidden">
            <Photo src={cover} sizes="84px" />
          </span>
        ))
      )}
    </span>
  );
}

export interface RadarTileProps {
  radar: Radar;
  finds: RadarFinds;
  text: RadarText;
  onOpen: (radar: Radar) => void;
  onToggle: (radar: Radar, active: boolean) => void;
}

/**
 * One tile (SCR-026): a real `<button>` — the collage, the title (it wraps), the area (one line) and the status line —
 * and beside it the switch, a separate focus stop with its own name, «Присылать в чат», described by the title (the
 * fix of LB-APP-014: legacy nested the switch inside a `div role=button` without key handling or a label). Enter and
 * Space on the tile open it; Space on the switch toggles it.
 */
export function RadarTile({ radar, finds, text, onOpen, onToggle }: RadarTileProps) {
  const t = useTranslations();
  const titleId = useId();
  const paused = !radar.active;
  const area = text.area(radar);
  return (
    <li data-radar-tile={radar.id} data-active={radar.active} className="flex items-center gap-[12px] rounded-[20px] bg-fill p-[12px]">
      <button
        type="button"
        data-radar-open=""
        onClick={() => onOpen(radar)}
        className="flex min-w-0 flex-1 items-center gap-[12px] rounded-[14px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <RadarCollage covers={collageCovers(finds.finds)} paused={paused} />
        <span className="flex min-w-0 flex-1 flex-col gap-px leading-[1.3]">
          <b id={titleId} className={cn("text-[16px] leading-[1.25] font-semibold", paused ? "text-hint" : "text-text")}>
            {text.title(radar)}
          </b>
          {area ? <span className="truncate text-[13px] text-hint">{area}</span> : null}
          <span data-radar-status="" className="text-[13px] text-text opacity-85">
            {text.status(radar, finds.flow)}
          </span>
        </span>
      </button>
      <Switch
        checked={radar.active}
        onCheckedChange={(next) => onToggle(radar, next)}
        aria-label={t("radar.send")}
        aria-describedby={titleId}
      />
    </li>
  );
}

export interface RadarTilesProps {
  radars: readonly Radar[];
  finds: Readonly<Record<string, RadarFinds>>;
  onOpen: (radar: Radar) => void;
  onToggle: (radar: Radar, active: boolean) => void;
  flags?: DevFlags;
}

const NO_FINDS: RadarFinds = { finds: null, count: null, flow: null };

/** The tiles of the radar tab (SCR-026), in the server's order, 12 px apart (legacy `radar-tiles`). */
export function RadarTiles({ radars, finds, onOpen, onToggle, flags = devFlags }: RadarTilesProps) {
  const text = useRadarText(flags);
  return (
    <ul data-radar-tiles="" className="flex flex-col gap-[12px]">
      {radars.map((radar) => (
        <RadarTile key={radar.id} radar={radar} finds={finds[radar.id] ?? NO_FINDS} text={text} onOpen={onOpen} onToggle={onToggle} />
      ))}
    </ul>
  );
}
