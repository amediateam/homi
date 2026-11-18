"use client";

import { useSyncExternalStore } from "react";

import type { MapScheme } from "./types";

/** The look of the document the basemap follows: `html[data-scheme]` and `html.lite`. */
export type DocumentLook = { scheme: MapScheme; lite: boolean };

/** The server's first paint: `data-scheme="light"` and no `lite` class (`app/[locale]/layout.tsx`). */
const SERVER_LOOK: DocumentLook = { scheme: "light", lite: false };

let cached: DocumentLook = SERVER_LOOK;

/** The same object until the scheme or lite mode changes: `useSyncExternalStore` compares snapshots by identity. */
function readLook(): DocumentLook {
  const html = document.documentElement;
  const scheme: MapScheme = html.dataset.scheme === "dark" ? "dark" : "light";
  const lite = html.classList.contains("lite");
  if (cached.scheme !== scheme || cached.lite !== lite) {
    cached = { scheme, lite };
  }
  return cached;
}

function subscribe(listener: () => void): () => void {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-scheme", "class"] });
  return () => observer.disconnect();
}

function serverLook(): DocumentLook {
  return SERVER_LOOK;
}

/**
 * The scheme and lite mode of `<html>` (WP-27 "Basemap and tiles"): the theme of WP-21 writes `data-scheme`, the
 * graphics mode of `03` §1.7 toggles `lite`, and a `MutationObserver` on `<html>` re-renders the map screen when either
 * changes, so the basemap is restyled without re-creating the map. Other class changes (`chrome-mini`) re-render
 * nothing. The server's first paint is light and full.
 */
export function useDocumentLook(): DocumentLook {
  return useSyncExternalStore(subscribe, readLook, serverLook);
}
