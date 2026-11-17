"use client";

import { MapPin } from "@homi/ui";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { routes } from "@/lib/navigation/routes";
import { tg } from "@/lib/telegram";

/**
 * The place of the listing's spot map (`03` SCR-018, block 9): a 2:1 box with a pin until WP-28 draws the map in
 * it. A tap (light haptic) opens the full-screen map. `data-no-swipe` keeps a swipe that starts on it from closing
 * the listing, as a map will need.
 */
export function SpotMapSlot({ number }: { number: number }) {
  const t = useTranslations();
  const router = useRouter();

  return (
    <button
      type="button"
      data-spot-map=""
      data-no-swipe=""
      aria-label={t("listing.mapOpen")}
      onClick={() => {
        tg.haptic.impact("light");
        router.push(routes.listingLocation(number));
      }}
      className="grid aspect-[2/1] w-full place-items-center overflow-hidden rounded-medium bg-fill text-accent outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <MapPin size={28} strokeWidth={2} aria-hidden />
    </button>
  );
}
