import type { ReactNode } from "react";

import { AppShell } from "@/features/shell/AppShell";

/**
 * The shell group (WP-20, WP-23, `25` §3.2): the page inside the app shell (SCR-006) with its top bar and tab bar,
 * then the overlay slot (listing layer), then the sheet slot — the legacy stacking, listing below sheets (`03` §3.6).
 * A Server Component that reads nothing per request; `AppShell` reads the address on the client.
 */
export default function MainLayout({
  children,
  overlay,
  sheet,
}: {
  children: ReactNode;
  overlay: ReactNode;
  sheet: ReactNode;
}) {
  return (
    <AppShell sheet={sheet} overlay={overlay}>
      {children}
    </AppShell>
  );
}
