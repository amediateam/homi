"use client";

import { ArrowUp } from "@homi/ui";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { usePathname } from "@/i18n/navigation";
import { useSession } from "@/lib/session/SessionProvider";
import { tg } from "@/lib/telegram";

import { bumpFeedEpoch } from "./feedQuery";
import { feedListFree, freshFeed, useFreshCount } from "./fresh";

/**
 * «Показать N новых» (WP-38, SCR-063; legacy `button.fresh-pill` of `TopBar.jsx` since `index-CIa0Ldj2.js`): under the
 * search list's top bar while the long return's count is above 0 and the feed list is free (`feedListFree`, the
 * nudges' rule) — so after a return with a listing open it shows once the listing closes, after a return on the map
 * once the list is back. It is no radar offer and shows with radars off too (DEC-51). It has no timer, no × and no
 * event; a new list key takes it away. A tap: a light haptic, the top, and the list re-created from page one.
 * Placed and moved with the collapsing chrome by `styles/shell.css`.
 */
export function FreshPill() {
  const t = useTranslations();
  const count = useFreshCount();
  const pathname = usePathname();
  const searchParams = new URLSearchParams(useSearchParams()?.toString() ?? "");
  const { status } = useSession();
  if (count <= 0 || !feedListFree(pathname, searchParams, status === "ready")) {
    return null;
  }
  const show = () => {
    tg.haptic.impact();
    window.scrollTo(0, 0);
    freshFeed.dismiss();
    bumpFeedEpoch();
  };
  return (
    <button type="button" data-fresh-pill="" onClick={show}>
      <ArrowUp size={16} aria-hidden />
      <span>{t("app.freshShow", { n: count })}</span>
    </button>
  );
}
