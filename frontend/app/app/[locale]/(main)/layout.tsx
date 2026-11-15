import type { ReactNode } from "react";

/**
 * The shell group (WP-20, `25` §3.2): the page, then the overlay slot (listing layer), then the sheet slot — the
 * legacy stacking, listing below sheets (`03` §3.6). WP-23 turns it into the shell with the tab bar.
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
    <>
      {children}
      {overlay}
      {sheet}
    </>
  );
}
