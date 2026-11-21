"use client";

import { Camera, Check, ImagePlus, prefersReducedMotion } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { thumbUrl } from "@/features/feed/images";

import type { OwnerPhoto } from "../normalize";
import type { PhotoError, UploadTile } from "./usePhotos";

/** The ring's easing (BR-APP-119): toward the real share by `1 − e^(−dt / 0.25 s)` per frame, steps of ≤ 50 ms. */
export function easeToward(shown: number, target: number, dtMs: number): number {
  const step = Math.min(dtMs, 50) / 1000;
  const next = shown + (target - shown) * (1 - Math.exp(-step / 0.25));
  return Math.abs(target - next) < 0.002 ? target : next;
}

/** The percent shows only between 0.5 % and 99.5 %; from 99.5 % the ring pulses while the answer is awaited. */
export function ringLabel(share: number): { percent: string | null; pulse: boolean } {
  if (share >= 0.995) {
    return { percent: null, pulse: true };
  }
  return { percent: share >= 0.005 ? `${Math.round(share * 100)}%` : null, pulse: false };
}

const RADIUS = 16;
const CIRCLE = 2 * Math.PI * RADIUS;

function UploadRing({ tile }: { tile: UploadTile }) {
  const [shown, setShown] = useState(0);
  const target = tile.status === "queued" ? 0 : tile.progress;
  const last = useRef<number | null>(null);

  useEffect(() => {
    const reduced = prefersReducedMotion();
    let frame = 0;
    const tick = (now: number) => {
      // Reduced motion jumps the ring to its target.
      const dt = reduced ? Number.POSITIVE_INFINITY : last.current === null ? 16 : now - last.current;
      last.current = now;
      let done = false;
      setShown((value) => {
        const next = reduced ? target : easeToward(value, target, dt);
        done = next === target;
        return next;
      });
      if (!done) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      last.current = null;
    };
  }, [target]);

  const { percent, pulse } = ringLabel(shown);
  return (
    <span
      data-upload={tile.status}
      data-pulse={pulse ? "" : undefined}
      className="grid aspect-square place-items-center rounded-medium bg-fill data-pulse:animate-pulse data-[upload=queued]:opacity-50"
    >
      <svg viewBox="0 0 40 40" className="size-10 -rotate-90 text-accent data-[upload=queued]:text-hint" aria-hidden>
        <circle cx="20" cy="20" r={RADIUS} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
        <circle
          cx="20"
          cy="20"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={CIRCLE}
          strokeDashoffset={CIRCLE * (1 - shown)}
        />
      </svg>
      {percent === null ? null : (
        <span data-upload-percent className="absolute text-[11px] font-semibold text-text">
          {percent}
        </span>
      )}
    </span>
  );
}

/**
 * The photo grid of the questionnaire (WP-81, BR-APP-082, BR-APP-119): the first photo carries «Обложка»; a tap opens
 * a mini menu with «Сделать обложкой» (from the second photo on) and «Удалить фото»; uploading tiles show their ring;
 * a new photo carries a tick for 1.5 s; the add tile (camera when empty, image-plus otherwise) is hidden while
 * uploading and at the limit; the error line; `own.photosTip` with more than one photo.
 */
export function PhotoGrid({
  photos,
  tiles,
  arrived,
  busy,
  error,
  limit,
  onAdd,
  onCover,
  onRemove,
}: {
  photos: readonly OwnerPhoto[];
  tiles: readonly UploadTile[];
  arrived: ReadonlySet<string>;
  busy: boolean;
  error: PhotoError | null;
  limit: number;
  onAdd: (files: File[]) => void;
  onCover: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations();
  const input = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const full = photos.length + tiles.length >= limit;

  return (
    <div data-photo-grid="">
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo, index) => (
          <div key={photo.id} className="relative">
            <button
              type="button"
              data-photo={photo.id}
              aria-label={t("own.photoMenu")}
              aria-expanded={menu === photo.id}
              onClick={() => setMenu(menu === photo.id ? null : photo.id)}
              className="block aspect-square w-full overflow-hidden rounded-medium bg-fill"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a draft's photo from a temporary URL */}
              <img src={thumbUrl(photo.url)} alt="" className="size-full object-cover" />
            </button>
            {index === 0 ? (
              <span data-cover className="absolute bottom-1 left-1 rounded-pill bg-dim/70 px-2 py-0.5 text-[11px] text-white">
                {t("own.cover")}
              </span>
            ) : null}
            {arrived.has(photo.id) ? (
              <span data-arrived className="absolute top-1 right-1 grid size-5 place-items-center rounded-pill bg-good text-white motion-reduce:hidden">
                <Check size={12} aria-hidden />
              </span>
            ) : null}
            {menu === photo.id ? (
              <div role="menu" className="absolute inset-x-1 top-1 z-1 flex flex-col overflow-hidden rounded-medium bg-sheet text-[13px] shadow-lg">
                {index > 0 ? (
                  <button
                    type="button"
                    role="menuitem"
                    data-action="cover"
                    className="px-2 py-2 text-left"
                    onClick={() => {
                      setMenu(null);
                      onCover(photo.id);
                    }}
                  >
                    {t("own.makeCover")}
                  </button>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  data-action="remove-photo"
                  className="px-2 py-2 text-left text-danger"
                  onClick={() => {
                    setMenu(null);
                    onRemove(photo.id);
                  }}
                >
                  {t("own.removePhoto")}
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {tiles.map((tile) => (
          <div key={tile.key} className="relative">
            <UploadRing tile={tile} />
          </div>
        ))}
        {busy || full ? null : (
          <button
            type="button"
            data-action="add-photo"
            aria-label={t("own.addPhoto")}
            onClick={() => input.current?.click()}
            className="grid aspect-square place-items-center rounded-medium border border-dashed border-sep bg-fill text-hint"
          >
            {photos.length === 0 ? <Camera size={24} aria-hidden /> : <ImagePlus size={24} aria-hidden />}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        data-photo-input=""
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          onAdd(files);
        }}
      />
      {error === null ? null : (
        <p data-photo-error role="alert" className="mt-2 text-[13px] text-danger">
          {error.key === "own.photosMax" ? t(error.key, { n: error.n }) : t(error.key)}
        </p>
      )}
      {photos.length > 1 ? <p className="mt-2 text-[13px] text-hint">{t("own.photosTip")}</p> : null}
    </div>
  );
}
