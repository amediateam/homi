"use client";

import { useTranslations } from "next-intl";

import { thumbUrl } from "@/features/feed/images";
import { useReference } from "@/lib/reference/useReference";

import type { OwnerListingView } from "../normalize";

const grouped = (value: number) => new Intl.NumberFormat("ru-RU").format(value).replace(/ /g, " ");

/**
 * «Так увидят люди» (WP-81, SCR-055): the cover's small variant (or a placeholder), the price with «/мес», «rooms ·
 * district or landmark», area and «floor из total», `own.verified`; below it «Ваш номер: {phone}» from
 * `phone_display` — marked `ph-mask` and `ph-no-capture` (DEC-72: replay masks it, autocapture never takes it).
 */
export function ListingPreview({ listing }: { listing: OwnerListingView }) {
  const t = useTranslations();
  const { findCity } = useReference();
  const { form } = listing;
  const cover = listing.photos[0] ?? null;
  const city = findCity(form.city);
  const district = city?.districts.find((item) => item.code === form.district_code)?.name ?? null;
  const rooms = form.room ? t("own.whatRoom") : form.rooms === null ? null : t("own.whatRooms", { n: form.rooms });
  const where = district ?? form.landmark;
  const price = form.price === null ? null : form.currency === "UZS" ? `${grouped(form.price)} ${t("own.sum")}` : `$${grouped(form.price)}`;
  const floor = form.floor === null ? null : form.floors_total === null ? String(form.floor) : `${form.floor}/${form.floors_total}`;
  return (
    <div>
      <h2 className="mb-2 text-[15px] font-semibold">{t("own.preview")}</h2>
      <div data-listing-preview="" className="overflow-hidden rounded-medium bg-fill">
        <div className="aspect-[3/2] bg-bg2">
          {cover === null ? null : (
            // eslint-disable-next-line @next/next/no-img-element -- a draft's photo from a temporary URL
            <img src={thumbUrl(cover.url)} alt="" className="size-full object-cover" />
          )}
        </div>
        <div className="flex flex-col gap-1 p-3">
          {price === null ? null : (
            <p className="text-[18px] font-bold">
              {price}
              <span className="text-[14px] font-normal text-hint">{t("own.perMonth")}</span>
            </p>
          )}
          <p className="text-[14px] text-text">{[rooms, where].filter(Boolean).join(" · ")}</p>
          <p className="text-[13px] text-hint">{[form.area_m2 === null ? null : `${String(form.area_m2).replace(".", ",")} м²`, floor].filter(Boolean).join(" · ")}</p>
          <p className="text-[13px] text-good">{t("own.verified")}</p>
        </div>
      </div>
      {listing.phoneDisplay === null ? null : (
        <p className="mt-2 text-[13px] text-hint">
          {t("own.phoneIs", { phone: "" })}
          <span data-owner-phone="" className="ph-mask ph-no-capture">
            {listing.phoneDisplay}
          </span>
        </p>
      )}
    </div>
  );
}
