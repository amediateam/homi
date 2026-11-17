"use client";

import { useTranslations } from "next-intl";

import { RoomsPicker } from "../RoomsPicker";
import { Section } from "./Section";
import type { SectionProps } from "./types";

/**
 * Section 5 of the filters sheet (SCR-014): «Комнаты» with the muted «— два числа задают диапазон» and the room
 * buttons (BR-APP-007). The form shows it by `sections.rooms` (BR-APP-006); a range set before the types turned to
 * land only stays in the draft and is sent, as in legacy.
 */
export function RoomsSection({ filters, update }: SectionProps) {
  const t = useTranslations();

  return (
    <Section name="rooms" title={t("sheet.rooms")} hint={t("sheet.roomsHint")}>
      <RoomsPicker filters={filters} update={update} />
    </Section>
  );
}
