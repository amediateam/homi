"use client";

import type { Locale } from "@homi/config";
import { labelFor } from "@homi/i18n";
import type { Translate } from "@homi/i18n/format";
import { findCity } from "@homi/search";
import { Button, Check, ChevronRight, cn, Switch } from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";
import { type KeyboardEvent, type ReactNode, useId, useLayoutEffect, useRef, useState } from "react";

import { forgetFeedScroll } from "@/features/feed/feedScroll";
import type { ListingPreview } from "@/features/feed/types";
import { digestHours, formatDigestHours, useSettings } from "@/features/settings/useSettings";
import { RouteSheet, type RoutePresentation } from "@/features/shell/RouteSheet";
import { deleteRadar, patchRadar } from "@/lib/actions/radars";
import { invokeAction } from "@/lib/actions/useAction";
import { setPreview } from "@/lib/data/previewCache";
import { markSeen } from "@/lib/data/sessionMaps";
import { type DevFlags, devFlags } from "@/lib/flags";
import { currentAddress } from "@/lib/navigation/address";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { useBack } from "@/lib/navigation/useBack";
import { useReference } from "@/lib/reference/useReference";
import { tg } from "@/lib/telegram";
import { confirmText } from "@/lib/ui/confirm";
import { lastSearchHref } from "@/lib/ui/shellState";
import { showToast } from "@/lib/ui/toast";

import { normalizePatch, type Radar, type RadarMode } from "./normalize";
import { type RadarPlace, radarFeedHref, rememberRadarReturn } from "./radarReturn";
import { RadarStrip } from "./RadarStrip";
import { radarActionFailed, useRadarSwitch, useRadarText } from "./RadarTiles";
import { radarFinds } from "./useRadarPreviews";
import { dropRadar, putRadar } from "./useRadars";

/** The delivery modes in the order of the sheet's rows. */
const MODES: readonly RadarMode[] = ["instant", "digest"];

/** A row of the sheet's cards (legacy `set-row`): 52 px, 14 px sides. */
const ROW = "flex min-h-[52px] w-full items-center gap-[12px] px-[14px] text-left outline-none focus-visible:bg-sep";
/** The separator above every row but a card's first (legacy `set-row:before`, 16 px in from the left in this sheet). */
const AFTER_FIRST = "relative before:absolute before:top-0 before:right-0 before:left-[16px] before:h-[0.5px] before:bg-sep";

export interface RadarSheetProps {
  /** The id of the address. */
  id: string;
  /** The radar of the tab's list; `undefined` while the list is not there. */
  radar: Radar | undefined;
  presentation: RoutePresentation;
  /** This opening shows the sheet without the rise (the return from the radar's feed or a find). */
  instant?: boolean;
  /** The return this opening came with: the sheet's body and the strip go back to its scrolls (WP-38). */
  restore?: Pick<RadarPlace, "stripX" | "sheetY"> | null;
  /** The sheet is about to leave by itself (deleted, or gone on the server): the route stops its unknown-radar rule. */
  onLeave: () => void;
  /** The app's flags; tests pass overrides (`withDevFlags`). */
  flags?: DevFlags;
  /**
   * The editor (`/radars/<id>/edit`): the layout keeps the sheet mounted under it. It renders next to the sheet, not
   * inside its content — a direct load renders the editor in place, and inside the sheet's dialog the sheet's page lock
   * would take every touch move of the editor's body.
   */
  children?: ReactNode;
}

/**
 * The radar sheet (SCR-028, BR-APP-047, BR-APP-048): a compact `RouteSheet` — closed by ×, the backdrop, a drag,
 * Telegram's Back (`back()`), opening the feed and deleting — with:
 *
 * - the header: the title (`filtersTitle`), the area and the status dot with the status line (`radarStatus`);
 * - «Последние находки» (`RadarStrip`): ghosts, «Пока ничего…» or the finds; a find opens the listing over the tab
 *   (`seen` and the preview recorded, the return stored, so Back brings the sheet back without the rise);
 * - the settings card: «Присылать в чат» with the same switch as the tile (a pause with `ask_found` replaces the sheet
 *   with the survey), and while the radar is on the two mode rows — «Сразу» («Каждое новое — как только появится») and
 *   «Подборкой» («Списком в 9 и 21» with the user's digest hours, «Списком в заданное время» while the settings are
 *   not there); a change to the other mode is a light impact and optimistic, the answer replaces the radar, a failure
 *   reverts it. The rows are a `radiogroup` named «Когда присылать» (`settings.group.notify`) whose selection does not
 *   follow the focus, as `SortList`'s: a pick is a server write, so the arrow keys, Home and End only move the focus
 *   (one tab stop, on the selected row) and Enter, Space or a tap picks;
 * - the actions card: «Изменить условия ›» (the editor), «Скрыто: N — Вернуть» only while `hidden > 0` (success
 *   haptic and «Скрытое снова показывается»), and the red «Удалить радар»: `tg.confirm` «Удалить радар «{name}»?»,
 *   Cancel sends nothing; OK deletes — success haptic, the radar leaves both lists, then the survey with the trigger
 *   `delete` replaces the sheet when the server asks for it, else `back()` — both only while the address is still the
 *   one of the request (`currentAddress()`): a user who left the sheet meanwhile (×, Back) is neither stepped back
 *   once more nor sent to the survey; «Радар удалён» only with `dev016SuccessToastOnDestructive` (off);
 * - the sticky footer «Смотреть найденное · {n}» (`radar.foundPlain` while the count is unknown): the feed of the
 *   radar's filters with `from=radar`, the return stored with the tab's scroll, then the window scrolled to the top —
 *   the feed starts at its top whether or not it was mounted before (legacy `switchTab` scrolled to 0; `nav.push`
 *   keeps the scroll).
 *
 * `dev022RadarCountLabel` (LB-APP-034) on: the footer and the strip link read «Смотреть найденное» and a muted line
 * above the footer reads «Сейчас подходит: {n}». Every failure goes to `radarActionFailed`; an unknown radar
 * (`not_found`) gives way to the tab. While the radar is not known yet the sheet shows its title «Радар» and the
 * strip's ghosts.
 */
/** How many frames a restored scroll is set again while the sheet's layout settles (`holdScroll`). */
const HOLD_FRAMES = 10;

/**
 * Sets a scroll position, then again on the next frames until it holds or `HOLD_FRAMES` have passed: the sheet's
 * header and footer padding (`useSheetChrome`) and late rows arrive after the opening's layout effect, so the first
 * write can be clamped short.
 */
function holdScroll(node: HTMLElement, axis: "scrollTop" | "scrollLeft", value: number, frames = HOLD_FRAMES): void {
  node[axis] = value;
  if (frames > 0 && node.isConnected && Math.abs(node[axis] - value) > 1) {
    requestAnimationFrame(() => holdScroll(node, axis, value, frames - 1));
  }
}

export function RadarSheet({ id, radar, presentation, instant = false, restore = null, onLeave, flags = devFlags, children }: RadarSheetProps) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const translate: Translate = (key, values) => t(key as never, values as never);
  const text = useRadarText(flags);
  const { cities } = useReference();
  const { back } = useBack();
  const toggle = useRadarSwitch(flags);
  const { settings } = useSettings({ enabled: radar?.active === true });
  const sendId = useId();
  const modeRows = useRef<(HTMLButtonElement | null)[]>([]);
  const content = useRef<HTMLDivElement>(null);
  const running = useRef(false);
  const [busy, setBusy] = useState(false);

  const finds = radarFinds(radar);
  const countLabel = flags.dev022RadarCountLabel;
  const foundLabel = !countLabel && finds.count !== null ? t("radar.found", { n: finds.count }) : t("radar.foundPlain");
  const allLabel = !countLabel && finds.count !== null ? t("radar.all", { n: finds.count }) : t("radar.foundPlain");
  const title = radar ? text.title(radar) : t("tab.subs");

  /** The radar is gone on the server: the lists are read again (`radarActionFailed`) and the sheet gives way to the tab. */
  const gone = () => {
    onLeave();
    nav.replace(routes.radars());
  };

  /** Runs one action of the cards at a time: a tap while one runs is ignored (`aria-disabled` shows it). */
  const once = (action: (current: Radar) => Promise<void>) => async () => {
    if (radar === undefined || running.current) {
      return;
    }
    running.current = true;
    setBusy(true);
    try {
      await action(radar);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  /** The sheet's body and the strip of finds, inside the dialog of `RouteSheet` (`BottomSheet`'s scroll body). */
  const scrollers = () => {
    const root = content.current;
    return {
      body: root?.closest<HTMLElement>('[data-slot="bottom-sheet-body"]') ?? null,
      strip: root?.querySelector<HTMLElement>('[data-radar-strip="finds"]') ?? null,
    };
  };
  const place = (via: RadarPlace["via"]): RadarPlace => {
    const { body, strip } = scrollers();
    return { via, stripX: strip?.scrollLeft ?? 0, sheetY: body?.scrollTop ?? 0 };
  };

  // The return's scrolls, each once per opening: the body's once the radar renders its rows, the strip's once the
  // finds replace the ghosts (a ghost strip would clamp it).
  const restored = useRef({ body: false, strip: false });
  const findsShown = finds.finds !== null && finds.finds.length > 0;
  useLayoutEffect(() => {
    if (restore === null) {
      return;
    }
    const { body, strip } = scrollers();
    if (!restored.current.body && radar !== undefined && body !== null) {
      restored.current.body = true;
      holdScroll(body, "scrollTop", restore.sheetY);
    }
    if (!restored.current.strip && findsShown && strip !== null) {
      restored.current.strip = true;
      holdScroll(strip, "scrollLeft", restore.stripX);
    }
  });

  const openFeed = () => {
    if (radar === undefined) {
      return;
    }
    tg.haptic.impact();
    // The tab's position first (Back restores it), then the top for the feed; the search list's own position is
    // dropped (BR-APP-105).
    rememberRadarReturn(radar.id, window.scrollY, place("feed"));
    forgetFeedScroll();
    window.scrollTo(0, 0);
    nav.push(radarFeedHref(radar, lastSearchHref(), findCity(cities, radar.filters.city)));
  };

  const openListing = (item: ListingPreview) => {
    markSeen(item.number);
    setPreview(item.number, item);
    rememberRadarReturn(id, window.scrollY, place("listing"));
    nav.push(routes.listing(item.number));
  };

  /** The arrow keys, Home and End move the focus between the mode rows (wrapping); they never pick (`SortList`). */
  const onModeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = modeRows.current.findIndex((row) => row === document.activeElement);
    const count = MODES.length;
    const next =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? (at + 1) % count
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? (at - 1 + count) % count
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? count - 1
              : null;
    if (next !== null && at >= 0) {
      event.preventDefault();
      modeRows.current[next]?.focus();
    }
  };

  /** Only a change to the other mode does anything (legacy). */
  const changeMode = (mode: RadarMode) =>
    once(async (current) => {
      if (mode === current.mode) {
        return;
      }
      tg.haptic.impact();
      putRadar({ ...current, mode });
      const result = await invokeAction(patchRadar, { id: current.id, mode }, locale);
      if (!result.ok) {
        putRadar(current);
        radarActionFailed(result, { flags, gone });
        return;
      }
      putRadar(normalizePatch(result.data).radar ?? { ...current, mode });
    });

  const unhide = once(async (current) => {
    tg.haptic.impact();
    const result = await invokeAction(patchRadar, { id: current.id, unhide: true }, locale);
    if (!result.ok) {
      radarActionFailed(result, { flags, gone });
      return;
    }
    putRadar(normalizePatch(result.data).radar ?? { ...current, hidden: 0 });
    tg.haptic.success();
    showToast({ key: "radar.unhidden" });
  });

  const remove = once(async (current) => {
    if (!(await confirmText(t("subs.deleteConfirm", { name: text.title(current) })))) {
      return;
    }
    const at = currentAddress();
    const result = await invokeAction(deleteRadar, { id: current.id }, locale);
    if (!result.ok) {
      radarActionFailed(result, { flags, gone });
      return;
    }
    tg.haptic.success();
    onLeave();
    dropRadar(current.id);
    if (flags.dev016SuccessToastOnDestructive) {
      showToast({ key: "toast.subDeleted" });
    }
    if (currentAddress() !== at) {
      return;
    }
    if (result.data.ask_found) {
      nav.replace(routes.radarFound({ trigger: "delete" }));
    } else {
      back();
    }
  });

  const digest = digestHours(settings);
  const hints: Record<RadarMode, string> = {
    instant: t("radar.instantHint"),
    digest: digest === null ? t("radar.digestHintAny") : t("radar.digestHint", { time: formatDigestHours(digest, translate) }),
  };

  const area = radar ? text.area(radar) : "";
  const header = radar ? (
    <div data-radar-head="" className="flex flex-col items-center gap-[2px] px-(--gutter) pb-[10px] text-center">
      {area ? <span className="text-[13px] text-hint">{area}</span> : null}
      <span data-radar-status="" className="flex items-center gap-[6px] text-[13px] text-text opacity-85">
        <i aria-hidden data-radar-dot="" className={cn("size-[8px] shrink-0 rounded-pill", radar.active ? "bg-accent" : "bg-hint")} />
        {text.status(radar, finds.flow)}
      </span>
    </div>
  ) : null;

  const footer = radar ? (
    <div className="flex flex-col gap-[8px]">
      {countLabel && finds.count !== null ? (
        <p data-radar-matching="" className="text-center text-[13px] text-hint">
          {t("sheet.matchingNow", { n: finds.count })}
        </p>
      ) : null}
      <Button data-radar-feed="" className="h-[48px] w-full" onClick={openFeed}>
        {foundLabel}
      </Button>
    </div>
  ) : undefined;

  return (
    <>
      <RouteSheet presentation={presentation} instant={instant} title={title} header={header} footer={footer} closeLabel={t("common.close")}>
      <div
        ref={content}
        data-route="radar"
        data-layer={presentation === "layer" ? "sheet" : undefined}
        data-radar-id={id}
        data-active={radar?.active}
        className="flex flex-col gap-[14px] px-(--gutter) pt-[6px]"
      >
        <section data-radar-finds="" className={cn(radar?.active === false && "[&_[data-radar-strip=finds]]:opacity-45")}>
          <h3 className="mb-[8px] text-[13px] font-semibold text-hint">{t("radar.latest")}</h3>
          <RadarStrip
            finds={finds.finds}
            active={radar?.active === true}
            allLabel={allLabel}
            onListing={openListing}
            onAll={openFeed}
          />
        </section>
        {radar ? (
          <>
            <div data-radar-settings="" className="overflow-hidden rounded-medium bg-fill">
              <div className={ROW}>
                <span id={sendId} className="min-w-0 flex-1 text-[16px]">
                  {t("radar.send")}
                </span>
                <Switch
                  checked={radar.active}
                  aria-labelledby={sendId}
                  onCheckedChange={(next) => void toggle(radar, next, { from: "sheet", gone })}
                />
              </div>
              {radar.active ? (
                <div role="radiogroup" aria-label={t("settings.group.notify")} onKeyDown={onModeKeyDown}>
                  {MODES.map((mode, index) => {
                    const selected = radar.mode === mode;
                    return (
                      <button
                        key={mode}
                        ref={(row) => {
                          modeRows.current[index] = row;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        tabIndex={selected ? 0 : -1}
                        data-radar-mode={mode}
                        onClick={changeMode(mode)}
                        className={cn(ROW, AFTER_FIRST, "min-h-[56px] py-[8px]")}
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-px">
                          <span className="text-[16px]">{t(labelFor("radarMode", mode))}</span>
                          <span data-radar-mode-hint="" className="text-[13px] text-hint">
                            {hints[mode]}
                          </span>
                        </span>
                        {selected ? <Check size={20} aria-hidden className="shrink-0 text-text" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div data-radar-actions="" className="overflow-hidden rounded-medium bg-fill">
              <button type="button" data-radar-edit="" onClick={() => nav.push(routes.radarEdit(radar.id))} className={ROW}>
                <span className="min-w-0 flex-1 text-[16px]">{t("radar.edit")}</span>
                <ChevronRight size={18} aria-hidden className="-mr-[4px] shrink-0 text-hint" />
              </button>
              {radar.hidden > 0 ? (
                <button type="button" data-radar-unhide="" aria-disabled={busy || undefined} onClick={unhide} className={cn(ROW, AFTER_FIRST)}>
                  <span className="min-w-0 flex-1 text-[16px]">{t("subs.hidden", { n: radar.hidden })}</span>
                  <span className="max-w-[45%] shrink-0 text-[15px] text-hint">{t("radar.unhide")}</span>
                </button>
              ) : null}
              <button type="button" data-radar-delete="" aria-disabled={busy || undefined} onClick={remove} className={cn(ROW, AFTER_FIRST)}>
                <span className="min-w-0 flex-1 text-[16px] text-danger">{t("radar.delete")}</span>
              </button>
            </div>
          </>
        ) : null}
      </div>
    </RouteSheet>
      {children}
    </>
  );
}
