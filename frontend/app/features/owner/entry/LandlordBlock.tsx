"use client";

import type { Locale } from "@homi/config";
import { Button } from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";

import { track } from "@/lib/analytics/events";
import { brand } from "@/lib/brand";
import { botStartUrl } from "@/lib/deeplinks/build";
import { tg } from "@/lib/telegram";

import { useOwnerEnabled } from "../store";

/** The owners' landing page for a tenant who moves out, or `null` until WP-61 builds it. */
function ownersPage(locale: Locale): string | null {
  const page = brand.links.owners[locale];
  if (page === null) {
    return null;
  }
  const url = new URL(page);
  url.searchParams.set("s", "tenant");
  return url.toString();
}

/**
 * «Съезжаете со старой квартиры?» of the survey (WP-82, BR-APP-116, F-OWNER-011, DEC-91, TMA-048), on the step `done`
 * (`src: homi`) and on WP-39's step `moved` (`src: elsewhere`), only while the cabinet is on (DEC-89). With the owners'
 * page: «Отправить хозяину» shares legacy's message with the page, and «Отправить ссылку на бота» HOMI's message with
 * the bot link (`owner_new`, WP-88); without the page one «Отправить хозяину» shares the bot message; without a bot no
 * bot button, and with neither no block. Each tap: a light haptic, `landlord_share {src, to}`, then the share.
 */
export function LandlordBlock({ src }: { src: "homi" | "elsewhere" }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const cabinetOn = useOwnerEnabled();
  if (!cabinetOn) {
    return null;
  }
  const page = ownersPage(locale);
  const bot = botStartUrl("owner_new");
  const buttons: { to: "page" | "bot"; label: string; text: string }[] = [];
  if (page !== null) {
    buttons.push({ to: "page", label: t("found.landlordSend"), text: t("found.landlordShare", { url: page }) });
    if (bot !== null) {
      buttons.push({ to: "bot", label: t("found.landlordSendBot"), text: t("found.landlordShareBot", { url: bot }) });
    }
  } else if (bot !== null) {
    buttons.push({ to: "bot", label: t("found.landlordSend"), text: t("found.landlordShareBot", { url: bot }) });
  }
  if (buttons.length === 0) {
    return null;
  }
  return (
    <div data-landlord={src} className="mt-[12px] flex w-full flex-col gap-[8px] rounded-[16px] bg-fill p-[14px] text-left">
      <p className="text-[16px] font-semibold text-text">{t("found.landlordTitle")}</p>
      <p className="text-[14px] leading-[1.4] text-hint">{t("found.landlordText")}</p>
      {buttons.map(({ to, label, text }, index) => (
        <Button
          key={to}
          variant={index === 0 ? "primary" : "secondary"}
          data-landlord-to={to}
          className="h-[44px] w-full text-[15px]"
          onClick={() => {
            tg.haptic.impact("light");
            track("landlord_share", { src, to });
            void tg.shareText(text);
          }}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
