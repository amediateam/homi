import type { ReactNode } from "react";

import { RoutePlaceholder } from "@/features/shell/RoutePlaceholder";

/** Settings (SCR-032), kept mounted under its seven sub-pages; WP-31 replaces the placeholder. */
export default function Layout({ children }: { children: ReactNode }) {
  return <RoutePlaceholder name="settings">{children}</RoutePlaceholder>;
}
