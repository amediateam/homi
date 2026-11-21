"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { useReference } from "@/lib/reference/useReference";

import type { OwnerPhoto } from "../normalize";
import { Field } from "./Field";

/** The photos (SCR-052, BR-APP-082): «Фото {n} из {max}» with the limit of the reference data; the grid is `children`. */
export function PhotosSection({ photos, invalid, children }: { photos: readonly OwnerPhoto[]; invalid: boolean; children?: ReactNode }) {
  const t = useTranslations();
  const { ownerPhotosLimit } = useReference();
  return (
    <Field
      focus="photos"
      invalid={invalid}
      label={
        <span className="flex items-baseline justify-between">
          <span>{t("own.photos")}</span>
          <span data-photos-count className="text-[13px] font-normal text-hint">
            {t("own.photosHint", { n: photos.length, max: ownerPhotosLimit })}
          </span>
        </span>
      }
    >
      {children}
    </Field>
  );
}
