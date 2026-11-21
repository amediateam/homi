"use client";

import { FilterChip, IntInput } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { OwnerForm } from "../normalize";
import { NumberTextField } from "./NumberTextField";
import { Chips, Field } from "./Field";
import { FLOOR_FIELD_MAX, NUMBER_FIELD_MAX, parseArea, parseFloor } from "./rules";

const ROOMS = [1, 2, 3, 4, 5] as const;

const areaText = (value: number | null) => (value === null ? "" : String(value).replace(".", ","));
const floorText = (value: number | null) => (value === null ? "" : String(value));

/**
 * Rooms, area and floors (SCR-052, BR-APP-080): 1 … 4, «5+» and the wide «Комната» (they exclude each other);
 * «Площадь» as a decimal (a comma works) and «Этаж» as typed («5/9» also fills «Этажей»), both kept as text while
 * typed; «Этажей» through `IntInput`.
 */
export function RoomsSection({ form, invalid, edit }: { form: OwnerForm; invalid: ReadonlySet<string>; edit: (change: Partial<OwnerForm>) => void }) {
  const t = useTranslations();
  const [area, setArea] = useState(() => areaText(form.area_m2));
  const [floor, setFloor] = useState(() => floorText(form.floor));

  return (
    <>
      <Field label={t("own.rooms")} focus="rooms" invalid={invalid.has("rooms")}>
        <Chips>
          {ROOMS.map((rooms) => (
            <FilterChip key={rooms} data-rooms={rooms} pressed={!form.room && form.rooms === rooms} onClick={() => edit({ rooms })}>
              {rooms === 5 ? "5+" : String(rooms)}
            </FilterChip>
          ))}
          <FilterChip data-rooms="room" className="min-w-[40%] grow" pressed={form.room} onClick={() => edit({ room: !form.room })}>
            {t("own.roomOnly")}
          </FilterChip>
        </Chips>
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label={t("own.area")} focus="area_m2" invalid={invalid.has("area_m2")}>
          <NumberTextField
            data-field="area_m2"
            inputMode="decimal"
            maxLength={NUMBER_FIELD_MAX}
            value={area}
            onValueChange={(text) => {
              setArea(text);
              // A half-typed number («45,») keeps the saved value until it reads.
              const parsed = parseArea(text);
              if (text.trim() === "" || parsed !== null) {
                edit({ area_m2: parsed });
              }
            }}
          />
        </Field>
        <Field label={t("own.floor")} focus="floor" invalid={invalid.has("floor")}>
          <NumberTextField
            data-field="floor"
            inputMode="text"
            maxLength={FLOOR_FIELD_MAX}
            value={floor}
            onValueChange={(text) => {
              setFloor(text);
              if (text.trim() === "") {
                edit({ floor: null });
                return;
              }
              const parsed = parseFloor(text);
              if (parsed !== null) {
                edit(parsed.floors === null ? { floor: parsed.floor } : { floor: parsed.floor, floors_total: parsed.floors });
              }
            }}
          />
        </Field>
        <Field label={t("own.floors")} focus="floors_total" invalid={invalid.has("floors_total")}>
          <IntInput data-field="floors_total" value={form.floors_total} max={99} onValueChange={(floors) => edit({ floors_total: floors })} />
        </Field>
      </div>
    </>
  );
}
