"use client";

import { RoutePlaceholder } from "@/features/shell/RoutePlaceholder";

/** Placeholder; WP-23 writes the crash screen (SCR-045). */
export default function RouteError() {
  return <RoutePlaceholder name="error" />;
}
