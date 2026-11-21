import { type ApiFailure, failureOf } from "@/lib/api/errors";
import type { ApiResult } from "@/lib/api/types";
import { getAuth } from "@/lib/session/store";
import { reauthenticate } from "@/lib/session/bootstrap";

import type { OwnerListingBody } from "../store";

/** An upload that has not answered in this time fails with `own.photoFailed`. */
export const UPLOAD_TIMEOUT_MS = 90_000;

const where = { method: "POST", path: "owner/listings/:id/photos" };

/** One attempt of the upload; `401` is answered as it is, for `uploadPhoto` to sign in again. */
function attempt(id: string, photo: Blob, onProgress: (share: number) => void, signal?: AbortSignal): Promise<ApiResult<OwnerListingBody>> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/bff/owner/listings/${id}/photos`);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader("Accept", "application/json");
    const locale = document.documentElement.lang;
    if (locale !== "") {
      xhr.setRequestHeader("Accept-Language", locale);
    }
    const auth = getAuth();
    if (auth.mode === "header") {
      xhr.setRequestHeader("Authorization", `Bearer ${auth.token}`);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total);
      }
    };
    xhr.onerror = () => resolve(failureOf(where, "offline"));
    xhr.ontimeout = () => resolve(failureOf(where, "timeout"));
    xhr.onabort = () => resolve(failureOf(where, "offline"));
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      const envelope = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
      if (xhr.status >= 200 && xhr.status < 300) {
        // A 2xx without the listing in JSON is a failure too (`own.photoFailed`).
        resolve(
          envelope !== null && typeof envelope.data === "object" && envelope.data !== null
            ? { ok: true, data: envelope.data as OwnerListingBody, meta: {} }
            : failureOf(where, { status: 502, code: "bad_answer" }),
        );
        return;
      }
      resolve(
        failureOf(where, {
          status: xhr.status,
          ...(typeof envelope?.code === "string" ? { code: envelope.code } : {}),
          ...(typeof envelope?.reason === "string" ? { reason: envelope.reason } : {}),
        }),
      );
    };
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    const body = new FormData();
    body.append("file", photo, "photo.jpg");
    xhr.send(body);
  });
}

/**
 * Sends one shrunk photo with its upload progress (WP-81, DEC-92): `XMLHttpRequest` to `/bff/owner/listings/{id}/photos`
 * with the session's token in header mode, 90 s at most; a `401` signs in again once and repeats. The answer is the
 * listing, or the failure with its code (`owner_photo_limit`, the media codes, `owner_disabled`).
 */
export async function uploadPhoto(id: string, photo: Blob, onProgress: (share: number) => void, signal?: AbortSignal): Promise<ApiResult<OwnerListingBody>> {
  const first = await attempt(id, photo, onProgress, signal);
  if (first.ok || first.error !== "unauthorized" || !(await reauthenticate())) {
    return first;
  }
  return attempt(id, photo, onProgress, signal);
}

/** The text key of a failed upload: not a photo, too big, the limit, or failed (BR-APP-082). */
export function photoErrorKey(failure: ApiFailure): "own.photoBad" | "own.photoBig" | "own.photosMax" | "own.photoFailed" {
  switch (failure.code) {
    case "unsupported_mime":
    case "undecodable":
      return "own.photoBad";
    case "too_large":
    case "too_big":
    case "payload_too_large":
      return "own.photoBig";
    case "owner_photo_limit":
      return "own.photosMax";
    default:
      return failure.status === 413 ? "own.photoBig" : "own.photoFailed";
  }
}
