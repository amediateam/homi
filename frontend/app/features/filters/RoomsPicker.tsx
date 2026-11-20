"use client";

import { isRoomPicked, pickRooms, ROOM_OPTIONS, type SearchFilters } from "@homi/search";
import { FilterChip } from "@homi/ui";
import { useTranslations } from "next-intl";

import { tg } from "@/lib/telegram";

import { ChipRow } from "./sections/Section";

/** The largest room button reads «4+»: `pickRooms` treats it as "4 or more". */
const OPEN_ROOMS = ROOM_OPTIONS[ROOM_OPTIONS.length - 1];

export interface RoomsPickerProps {
  filters: SearchFilters;
  update: (patch: Partial<SearchFilters>) => void;
}

/**
 * The room buttons of the full and the quick filters sheets (WP-25, legacy `RoomsPicker.jsx`): «Любые», 1, 2, 3, «4+».
 * A tap plays a light impact and goes through `pickRooms` (BR-APP-007): one value, then a range with a second value,
 * «4+» without an upper bound, «Любые» clears. A button is pressed while its value lies in the range (only «до N» counts
 * from 1); «Любые» only while neither bound is set.
 */
export function RoomsPicker({ filters, update }: RoomsPickerProps) {
  const t = useTranslations();
  const pick = (rooms: number | null) => {
    tg.haptic.impact("light");
    update(pickRooms(filters, rooms));
  };

  return (
    <ChipRow>
      <FilterChip data-rooms="any" pressed={filters.rooms_min === null && filters.rooms_max === null} onClick={() => pick(null)} className="px-[14px]">
        {t("sheet.roomsAny")}
      </FilterChip>
      {ROOM_OPTIONS.map((rooms) => (
        <FilterChip
          key={rooms}
          data-rooms={rooms}
          pressed={isRoomPicked(filters, rooms)}
          onClick={() => pick(rooms)}
          className="min-w-[48px] justify-center px-[14px] tabular-nums"
        >
          {rooms === OPEN_ROOMS ? `${rooms}+` : String(rooms)}
        </FilterChip>
      ))}
    </ChipRow>
  );
}
