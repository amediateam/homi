"use client";

import { storageGet, storageSet } from "@/lib/storage";

/** The chip's tip shows at most this many times per device (BR-APP-101, TMA-037). */
export const OWNER_TIP_SHOWS = 2;
/** It shows this long after the chip mounts for a listing, for this long. */
export const OWNER_TIP_DELAY_MS = 700;
export const OWNER_TIP_SHOWN_MS = 7000;

/** Whether the tip may show once more: `homi-owner-tip` is a number of shows below the limit, or missing. */
export function ownerTipDue(): boolean {
  const value = storageGet("homi-owner-tip");
  if (value === "done") {
    return false;
  }
  const shows = value === null ? 0 : Number.parseInt(value, 10);
  return !Number.isFinite(shows) || shows < OWNER_TIP_SHOWS;
}

/** One more show counted. */
export function countOwnerTip(): void {
  const value = storageGet("homi-owner-tip");
  const shows = value === null || value === "done" ? 0 : Number.parseInt(value, 10) || 0;
  if (value !== "done") {
    storageSet("homi-owner-tip", String(shows + 1));
  }
}

/** A tap on the chip or the tip, or «×»: never again. */
export function dismissOwnerTip(): void {
  storageSet("homi-owner-tip", "done");
}
