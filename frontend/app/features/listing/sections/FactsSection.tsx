"use client";

import {
  BedDouble,
  Building,
  Building2,
  Calculator,
  cn,
  FileText,
  House,
  LandPlot,
  Layers,
  type LucideIcon,
  PaintRoller,
  Percent,
  Ruler,
  Sofa,
  WashingMachine,
} from "@homi/ui";
import { useTranslations } from "next-intl";

import type { ListingFact } from "../listingData";

/** The icon of a fact key (legacy); any other key gets the house. */
const FACT_ICONS: Readonly<Record<string, LucideIcon>> = {
  type: Building2,
  rooms: BedDouble,
  area: Ruler,
  land: LandPlot,
  floor: Layers,
  building: Building,
  renovation: PaintRoller,
  furniture: Sofa,
  appliances: WashingMachine,
  per_m2: Calculator,
  commission: Percent,
  conditions: FileText,
};

/** A value longer than this spans both columns (legacy). */
const WIDE_FROM = 18;

/**
 * «Факты» (`03` SCR-018): the server's facts in its order, two to a row, each with the icon of its key. A value
 * longer than 18 characters takes the whole row. Keys may repeat, so the React key is the key and the index. No
 * facts → no section.
 */
export function FactsSection({ facts }: { facts: readonly ListingFact[] }) {
  const t = useTranslations();
  if (facts.length === 0) {
    return null;
  }
  return (
    <section data-section="facts" className="flex flex-col gap-[10px] px-(--gutter) py-[12px]">
      <h2 className="text-[17px] font-bold">{t("details.facts")}</h2>
      <div className="grid grid-cols-2 gap-[8px]">
        {facts.map((fact, index) => {
          const Icon = Object.hasOwn(FACT_ICONS, fact.key) ? FACT_ICONS[fact.key] : House;
          return (
            <div
              key={`${fact.key}:${index}`}
              data-fact-key={fact.key}
              className={cn(
                "flex min-w-0 items-start gap-[10px] rounded-medium bg-fill px-[12px] py-[10px]",
                fact.value.length > WIDE_FROM && "col-span-2",
              )}
            >
              <Icon size={18} strokeWidth={2} aria-hidden className="mt-[2px] flex-none text-hint" />
              <div className="flex min-w-0 flex-col">
                <span className="text-[13px] text-hint">{fact.label}</span>
                <span className="font-semibold break-words">{fact.value}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
