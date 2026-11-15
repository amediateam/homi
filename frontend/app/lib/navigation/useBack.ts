import { useSearchParams } from "next/navigation";

import { usePathname } from "@/i18n/navigation";

import { useDepth } from "./history";
import { nav } from "./nav";
import { parentOf } from "./routes";

/**
 * Back of the app (`25` §3.2, TMA-022): one step back in the app's history when it pushed something, else the
 * parent address of the current one — a layer loaded directly, or a layer parameter at depth 0, closes in the legacy
 * order (layer parameter, sheet, overlay child, listing). A root tab at depth 0 has no Back.
 */
export function useBack(): { canGoBack: boolean; back: () => void } {
  const level = useDepth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const parent = parentOf(pathname, new URLSearchParams(searchParams?.toString() ?? ""));
  return {
    canGoBack: level > 0 || parent !== null,
    back: () => {
      if (level > 0) {
        nav.back();
      } else if (parent !== null) {
        nav.replace(parent);
      }
    },
  };
}
