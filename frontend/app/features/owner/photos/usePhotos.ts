"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { deleteOwnerPhoto, orderOwnerPhotos } from "@/lib/actions/owner";
import { useAction } from "@/lib/actions/useAction";
import { tg } from "@/lib/telegram";
import { showToast, TOAST_ACTION_MS } from "@/lib/ui/toast";

import type { OwnerPhoto } from "../normalize";
import { invalidateOwner, type OwnerListingBody, putOwnerListing } from "../store";
import { shrinkPhoto } from "./shrinkPhoto";
import { photoErrorKey, uploadPhoto } from "./upload";

/** A file of the batch on its way: waiting, uploading with its share, or answered. */
export interface UploadTile {
  key: string;
  status: "queued" | "uploading";
  progress: number;
}

export type PhotoError = { key: "own.photosMax"; n: number } | { key: "own.photoBad" | "own.photoBig" | "own.photoFailed" | "own.photoUnreadable" };

export interface Photos {
  /** The listing's photos without the ones deleted in this form and not yet sent. */
  photos: OwnerPhoto[];
  tiles: UploadTile[];
  /** The ids of photos that arrived in this batch, for their tick (1.5 s). */
  arrived: ReadonlySet<string>;
  busy: boolean;
  error: PhotoError | null;
  add: (files: readonly File[]) => Promise<void>;
  makeCover: (id: string) => Promise<void>;
  remove: (id: string) => void;
  /** Sends the deletes still inside their «Вернуть» window now (before «Дальше» and before publish). */
  flushDeletes: () => Promise<void>;
}

/** How long a new photo carries its tick. */
export const ARRIVED_MS = 1500;

/**
 * The photos of the questionnaire (WP-81, BR-APP-082, DEV-057, LB-APP-061): one batch at a time, files one by one,
 * cut to the free places of `limit` («Не больше N фото.»); each shrunk (a file the browser cannot read is skipped
 * with `own.photoUnreadable`) and sent with its progress; `409 owner_photo_limit` stops the batch, the media codes
 * show their text and the batch goes on. «Сделать обложкой» sends the full order with that id first. «Удалить фото»
 * hides the photo at once and offers «Вернуть» for 6 s; the delete is sent when that time ends or the form unmounts,
 * never before, and «Вернуть» sends nothing.
 */
export function usePhotos({
  listingId,
  photos: all,
  limit,
  onDisabled,
  texts,
}: {
  listingId: string;
  photos: readonly OwnerPhoto[];
  limit: number;
  onDisabled: () => void;
  /** The toast of a deleted photo: `own.photoDeleted` and «Вернуть», translated by the caller. */
  texts: { deleted: string; undo: string };
}): Photos {
  const order = useAction(orderOwnerPhotos);
  const remove = useAction(deleteOwnerPhoto);
  const [tiles, setTiles] = useState<UploadTile[]>([]);
  const [arrived, setArrived] = useState<ReadonlySet<string>>(new Set());
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<PhotoError | null>(null);
  const busy = tiles.length > 0;
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** Aborted when the form unmounts: a batch on its way stops. */
  const alive = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    alive.current = controller;
    return () => controller.abort();
  }, []);

  const accept = useCallback((data: OwnerListingBody) => {
    putOwnerListing(data);
    invalidateOwner();
  }, []);

  const add = useCallback(
    async (files: readonly File[]) => {
      if (busy || files.length === 0) {
        return;
      }
      tg.haptic.impact("light");
      const free = Math.max(0, limit - all.length);
      const batch = files.slice(0, free);
      setError(files.length > free ? { key: "own.photosMax", n: limit } : null);
      const keys = batch.map((_, index) => `upload-${Date.now()}-${index}`);
      setTiles(keys.map((key) => ({ key, status: "queued", progress: 0 })));
      let known = new Set(all.map((photo) => photo.id));
      for (const [index, file] of batch.entries()) {
        const key = keys[index]!;
        setTiles((list) => list.map((tile) => (tile.key === key ? { ...tile, status: "uploading" } : tile)));
        const photo = await shrinkPhoto(file);
        if (photo === null) {
          setError({ key: "own.photoUnreadable" });
          setTiles((list) => list.filter((tile) => tile.key !== key));
          continue;
        }
        const signal = alive.current?.signal;
        if (signal?.aborted) {
          // Hidden (`<Activity>`) or gone: the batch stops and its tiles go, so a later show is not left busy.
          setTiles([]);
          return;
        }
        const result = await uploadPhoto(
          listingId,
          photo,
          (share) => setTiles((list) => list.map((tile) => (tile.key === key ? { ...tile, progress: share } : tile))),
          signal,
        );
        if (signal?.aborted) {
          setTiles([]);
          return;
        }
        setTiles((list) => list.filter((tile) => tile.key !== key));
        if (result.ok) {
          const fresh = (result.data.photos ?? []).map((item) => item.id).filter((id) => !known.has(id));
          known = new Set([...known, ...fresh]);
          setArrived((set) => new Set([...set, ...fresh]));
          setTimeout(() => setArrived((set) => new Set([...set].filter((id) => !fresh.includes(id)))), ARRIVED_MS);
          accept(result.data);
          continue;
        }
        tg.haptic.error();
        if (result.code === "owner_disabled") {
          setTiles([]);
          onDisabled();
          return;
        }
        const text = photoErrorKey(result);
        setError(text === "own.photosMax" ? { key: text, n: limit } : { key: text });
        if (result.code === "owner_photo_limit") {
          setTiles([]);
          return;
        }
      }
      setTiles([]);
    },
    [busy, limit, all, listingId, accept, onDisabled],
  );

  const makeCover = useCallback(
    async (id: string) => {
      tg.haptic.impact("light");
      // The full order the contract asks for: a photo hidden by a delete not sent yet stays, at the end.
      const visible = all.filter((photo) => !hidden.has(photo.id));
      const waiting = all.filter((photo) => hidden.has(photo.id));
      const ids = [id, ...visible.map((photo) => photo.id).filter((other) => other !== id), ...waiting.map((photo) => photo.id)];
      const result = await order({ id: listingId, ids });
      if (result.ok) {
        accept(result.data);
      } else {
        tg.haptic.error();
        setError({ key: "own.photoFailed" });
      }
    },
    [all, hidden, order, listingId, accept],
  );

  /** The deletes on their way: `flushDeletes` waits for them too. */
  const sending = useRef(new Set<Promise<void>>());
  const send = useCallback(
    (photo: string) => {
      pending.current.delete(photo);
      const run = (async () => {
        const result = await remove({ id: listingId, photo });
        if (result.ok) {
          accept(result.data);
        } else {
          tg.haptic.error();
          setHidden((set) => new Set([...set].filter((id) => id !== photo)));
        }
      })();
      sending.current.add(run);
      void run.finally(() => sending.current.delete(run));
      return run;
    },
    [remove, listingId, accept],
  );

  const removePhoto = useCallback(
    (photo: string) => {
      tg.haptic.impact("light");
      setHidden((set) => new Set([...set, photo]));
      pending.current.set(
        photo,
        setTimeout(() => void send(photo), TOAST_ACTION_MS),
      );
      showToast({
        text: texts.deleted,
        action: texts.undo,
        run: () => {
          clearTimeout(pending.current.get(photo));
          pending.current.delete(photo);
          setHidden((set) => new Set([...set].filter((id) => id !== photo)));
        },
      });
    },
    [send, texts.deleted, texts.undo],
  );

  const flushDeletes = useCallback(async () => {
    const waiting = [...pending.current.entries()];
    for (const [, timer] of waiting) {
      clearTimeout(timer);
    }
    waiting.forEach(([photo]) => void send(photo));
    await Promise.all([...sending.current]);
  }, [send]);

  // The form unmounts: the deletes still waiting are sent now.
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);
  useEffect(() => {
    const waiting = pending.current;
    return () => {
      for (const [photo, timer] of waiting) {
        clearTimeout(timer);
        void sendRef.current(photo);
      }
      waiting.clear();
    };
  }, []);

  return { photos: all.filter((photo) => !hidden.has(photo.id)), tiles, arrived, busy, error, add, makeCover, remove: removePhoto, flushDeletes };
}
