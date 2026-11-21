"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

import { reportError } from "@/lib/errors/report";

export interface MapViewBoundaryProps {
  children: ReactNode;
  /** The view threw while rendering: the screen shows the error pill, whose «Повторить» remounts the boundary. */
  onError(): void;
}

/**
 * Keeps a render error of the engine view inside the map (WP-37, SCR-011): a throw while rendering `MapViewGL` or
 * `MapViewLeaflet` leaves the map's area empty, is reported with the kind `render`, and tells `MapScreen`, which shows
 * «Не загрузилось» with «Повторить» in the points pill's place; the tab bar, the view toggle and the list keep working,
 * and `app/[locale]/error.tsx` is not reached. «Повторить» remounts it with a new key. A failed chunk is not a throw:
 * the loaders of `MapScreen` turn it into the GL fallback or the Leaflet retry (WP-28).
 */
export class MapViewBoundary extends Component<MapViewBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, { kind: "render", where: "map", componentStack: info.componentStack ?? null });
    this.props.onError();
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
