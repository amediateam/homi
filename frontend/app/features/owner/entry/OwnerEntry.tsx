"use client";

import { ChevronRight, House } from "@homi/ui";
import { useTranslations } from "next-intl";

import { useOwnerEnabled } from "../store";
import { type EntrySource, useOwnerEntry } from "./useOwnerEntry";

/**
 * The row of the search feed's end block (WP-82, BR-APP-115, DEC-89, DEC-90): a house, «Сдаёте квартиру? Разместите
 * бесплатно» and a chevron. Nothing renders while the cabinet is off.
 */
export function OwnerEntryRow() {
  const t = useTranslations();
  const cabinetOn = useOwnerEnabled();
  const open = useOwnerEntry();
  if (!cabinetOn) {
    return null;
  }
  return (
    <button
      type="button"
      data-owner-entry="feed_end"
      onClick={() => void open("feed_end")}
      className="flex w-full items-center gap-[12px] rounded-[16px] bg-fill px-[14px] py-[12px] text-left"
    >
      <House size={20} aria-hidden className="flex-none text-accent" />
      <span className="min-w-0 flex-1 text-[15px] text-text">
        {t("own.entryAsk")} <b className="font-semibold text-accent">{t("own.entryCta")}</b>
      </span>
      <ChevronRight size={18} aria-hidden className="flex-none text-hint" />
    </button>
  );
}

/**
 * The line of the empty search feed (`empty`) and of a listing card (`listing`, «Тоже сдаёте квартиру?»): «… Разместите
 * бесплатно ›». Nothing renders while the cabinet is off (DEC-89).
 */
export function OwnerEntryLine({ src }: { src: Exclude<EntrySource, "feed_end"> }) {
  const t = useTranslations();
  const cabinetOn = useOwnerEnabled();
  const open = useOwnerEntry();
  if (!cabinetOn) {
    return null;
  }
  return (
    <p data-owner-entry={src} className="px-[16px] py-[12px] text-center text-[14px] text-hint">
      {src === "listing" ? t("own.entryAskToo") : t("own.entryAsk")}{" "}
      <button type="button" onClick={() => void open(src)} className="font-semibold text-accent">
        {t("own.entryCta")} ›
      </button>
    </p>
  );
}
