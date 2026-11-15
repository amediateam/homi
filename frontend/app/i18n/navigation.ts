import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Locale-aware navigation (WP-20, WP-21). Addresses come from `lib/navigation/routes.ts` without a locale; these add
 * it. `useRouter` and `Link` count every navigation in the app's history stack (`./CountedNavigation.tsx`). Never
 * import a router or `Link` from `next/navigation`, `next/link` or next-intl in feature code.
 */
export const { redirect, usePathname, getPathname } = createNavigation(routing);
export { Link, useRouter } from "./CountedNavigation";
