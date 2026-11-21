"use client";

import { Info, leaveRef, ShieldCheck, X } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { track } from "@/lib/analytics/events";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { tg } from "@/lib/telegram";

import { countOwnerTip, dismissOwnerTip, OWNER_TIP_DELAY_MS, OWNER_TIP_SHOWN_MS, ownerTipDue } from "./ownerTip";

/**
 * «Проверенный хозяин» under the title (WP-83, BR-APP-100, BR-APP-101, BR-APP-103): a shield, the words and ⓘ, on its
 * own grid row and never wrapped. It shows from the preview already and is inert until the full card is there
 * (`loaded`): a tap then does nothing and leaves the tip (fix of LB-APP-072). With the card a tap gives a light haptic,
 * `owner_info_opened`, ends the tip for good and opens the info sheet. The tip «Нажмите — расскажем, что это значит»
 * shows at most twice per device, 700 ms after the chip mounts, for 7 s, with the chip's pulse (none in lite or under
 * reduced motion, `motion.css`); «×» ends it for good. It leaves with WP-39's tip leave.
 */
export function OwnerChip({ number, loaded }: { number: number; loaded: boolean }) {
  const t = useTranslations();
  const [tip, setTip] = useState(false);
  /** One opening per tap: a second tap while the sheet's push lands opens nothing and sends nothing. */
  const opening = useRef(false);

  useEffect(() => {
    if (!ownerTipDue()) {
      return;
    }
    const show = setTimeout(() => {
      countOwnerTip();
      setTip(true);
    }, OWNER_TIP_DELAY_MS);
    const hide = setTimeout(() => setTip(false), OWNER_TIP_DELAY_MS + OWNER_TIP_SHOWN_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [number]);

  const open = () => {
    if (!loaded || opening.current) {
      return;
    }
    opening.current = true;
    setTimeout(() => {
      opening.current = false;
    }, 800);
    tg.haptic.impact("light");
    track("owner_info_opened", { listing_id: number });
    dismissOwnerTip();
    setTip(false);
    nav.push(routes.listingOwner(number));
  };

  return (
    <div data-owner-chip="" className="relative col-span-full justify-self-start">
      <button
        type="button"
        onClick={open}
        aria-disabled={!loaded}
        data-pulse={tip ? "" : undefined}
        className="inline-flex items-center gap-[6px] rounded-pill bg-badge-good-bg px-[10px] py-[5px] text-[13px] font-semibold whitespace-nowrap text-badge-good data-pulse:animate-pulse"
      >
        <ShieldCheck size={15} aria-hidden />
        {t("owner.verified")}
        <Info size={14} aria-hidden className="opacity-70" />
      </button>
      {tip ? (
        <div ref={leaveRef("tip")} role="status" data-owner-tip="" className="absolute top-[calc(100%+6px)] left-0 z-2 flex items-center gap-[6px] rounded-[12px] bg-accent px-[10px] py-[6px] text-[13px] whitespace-nowrap text-accent-text shadow-(--shadow-float)">
          <button type="button" onClick={open} className="font-semibold">
            {t("owner.tip")}
          </button>
          <button
            type="button"
            aria-label={t("owner.tipClose")}
            onClick={() => {
              dismissOwnerTip();
              setTip(false);
            }}
            className="grid size-[22px] place-items-center"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  );
}
