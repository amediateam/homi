import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Locale-aware navigation (WP-20). Addresses come from `lib/navigation/routes.ts` without a locale; these add it.
 * Never import `next/link` or `next/navigation`'s router in feature code.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
