"use client";

import type { Translate } from "@homi/i18n/format";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { priceKindLabel } from "@/features/feed/cardText";
import type { ListingPreview } from "@/features/listing/listingData";
import { track } from "@/lib/analytics/events";
import { prepareShare } from "@/lib/actions/listing";
import { useAction } from "@/lib/actions/useAction";
import { botStartAppUrl } from "@/lib/deeplinks/build";
import { reportError } from "@/lib/errors/report";
import { tg } from "@/lib/telegram";

/** `03` §3.4: a share holds the button while it runs and this long after. */
export const SHARE_LOCK_MS = 1500;

type ShareItem = Pick<ListingPreview, "title" | "price" | "district">;

/**
 * The text of the share link (BR-APP-038): title · amount and period · price-kind label · district, empty parts
 * left out. The label is the card's (`priceKindLabel`) without its «· »: only `down_payment` and `business` have one.
 */
export function shareText(item: ShareItem, t: Translate): string {
  const price = item.price === null ? null : `${item.price.display}${item.price.period ?? ""}`;
  const kind = item.price === null ? null : priceKindLabel(item.price.kind, t);
  return [item.title, price, kind, item.district?.name].filter(Boolean).join(" · ");
}

/**
 * Share of the title row (BR-APP-038, TMA-030, TMA-031). `shareable` only when the bot's start link can be built;
 * the row hides the button otherwise. A tap while a share runs, or within 1.5 s after it, is ignored; else the light
 * haptic and `listing_shared` (before trying, as legacy), then Telegram's picker with the prepared message. The share
 * link (`shareUrl`) is the fallback only when the client cannot send a prepared message, `prepareShare` fails or the
 * picker throws; a picker that was shown and answers «not sent» ends quietly (D-5). No toast in any outcome.
 */
export function useShareListing(number: number, item: ShareItem | null): { share: () => void; shareable: boolean } {
  const t = useTranslations();
  const translate: Translate = (key, values) => t(key as never, values as never);
  const prepare = useAction(prepareShare);
  const locked = useRef(false);
  const unlock = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // A listing hidden with its cached route (or left) shares anew when it is shown again.
  useEffect(
    () => () => {
      clearTimeout(unlock.current);
      locked.current = false;
    },
    [],
  );

  const link = botStartAppUrl(number);

  const share = () => {
    if (locked.current || link === null) {
      return;
    }
    locked.current = true;
    tg.haptic.impact("light");
    track("listing_shared", { listing_id: number });
    // Without the details or the preview the link goes alone.
    const fallback = () => tg.shareUrl(link, item === null ? "" : shareText(item, translate));
    const send = async (): Promise<void> => {
      if (!tg.supports("shareMessage")) {
        return fallback();
      }
      const prepared = await prepare({ number });
      if (!prepared.ok) {
        return fallback();
      }
      try {
        await tg.shareMessage(prepared.data.prepared_message_id);
      } catch {
        await fallback();
      }
    };
    void send()
      .catch((error: unknown) => reportError(error, { kind: "error", where: "share" }))
      .finally(() => {
        unlock.current = setTimeout(() => {
          locked.current = false;
        }, SHARE_LOCK_MS);
      });
  };

  return { share, shareable: link !== null };
}
