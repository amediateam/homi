import { RadarIcon } from "@homi/ui";
import { useTranslations } from "next-intl";

/**
 * The radar tab while the server has radars switched off (DEC-51; HOMI only — legacy radars worked from the first
 * day): the radar icon in a 64 px circle, still (no sweep, nothing to animate), «Радар скоро заработает» and «Мы
 * включим уведомления о новых объявлениях в ближайшее время.» — no button, and the top bar has no «+». The column of
 * the empty state (legacy `empty tall`: 96 px from the top, the text at most 300 px wide). No hooks but the
 * catalogue's, so it renders on the server as it is.
 */
export function RadarSoonState() {
  const t = useTranslations();
  return (
    <div data-radar-state="soon" className="flex flex-col items-center gap-[10px] px-[24px] pt-[96px] pb-[64px] text-center text-hint">
      <span aria-hidden className="mb-[6px] grid size-[64px] place-items-center rounded-pill bg-fill text-text">
        <RadarIcon size={28} />
      </span>
      <h2 className="text-[17px] font-bold text-text">{t("radar.soon.title")}</h2>
      <p className="max-w-[300px]">{t("radar.soon.body")}</p>
    </div>
  );
}
