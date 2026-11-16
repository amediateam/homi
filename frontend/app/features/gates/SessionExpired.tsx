"use client";

import type { ReactNode } from "react";

import { useSession } from "@/lib/session/SessionProvider";

import { SessionExpiredScreen } from "./SessionExpiredScreen";

/**
 * Row 3 of the gates (D-S-14): while the session is `expired` the screen is rendered in place of the route — it is
 * not a route, so the address stays. Wraps the page of the root layout, inside the session provider.
 */
export function SessionExpired({ children }: { children: ReactNode }) {
  const { status } = useSession();
  return status === "expired" ? <SessionExpiredScreen /> : children;
}
