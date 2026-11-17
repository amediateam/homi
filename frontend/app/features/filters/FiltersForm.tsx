"use client";

import type { MessageKey } from "@homi/i18n";
import { resetAll, type SearchFilters, type SearchMode, type SearchRules, sectionsFor } from "@homi/search";
import { Button } from "@homi/ui";
import { useTranslations } from "next-intl";
import { type RefObject, useEffect, useRef } from "react";

import { CityPickerSheet } from "@/features/city/CityPickerSheet";
import { useCityPick } from "@/features/city/useCityPick";
import { type RoutePresentation, RouteSheet } from "@/features/shell/RouteSheet";
import { ToastHost } from "@/features/shell/ToastHost";
import { useLayerState } from "@/lib/navigation/useLayerState";
import { useCityStats, useReference } from "@/lib/reference/useReference";

import { FiltersFooter } from "./FiltersFooter";
import { AppliancesSection } from "./sections/AppliancesSection";
import { AreaSection } from "./sections/AreaSection";
import { CitySection } from "./sections/CitySection";
import { DealSection } from "./sections/DealSection";
import { FloorSection } from "./sections/FloorSection";
import { FurnitureSection } from "./sections/FurnitureSection";
import { MarketSection } from "./sections/MarketSection";
import { OwnerSection } from "./sections/OwnerSection";
import { PetsSection } from "./sections/PetsSection";
import { PostedSection } from "./sections/PostedSection";
import { PriceSection } from "./sections/PriceSection";
import { RenovationSection } from "./sections/RenovationSection";
import { RentTermSection } from "./sections/RentTermSection";
import { RoomsSection } from "./sections/RoomsSection";
import { TenantSection } from "./sections/TenantSection";
import { TypeSection } from "./sections/TypeSection";
import type { SectionProps } from "./sections/types";
import { WhereSection } from "./sections/WhereSection";
import { useDraft } from "./useDraft";
import { useLiveStats } from "./useLiveStats";

/** `03` §3.4: the section a launch asks for scrolls into view this long after the sheet opens. */
export const FOCUS_DELAY_MS = 350;

const TITLES: Readonly<Record<SearchMode, MessageKey>> = {
  search: "sheet.title",
  "radar-new": "sheet.createTitle",
  "radar-edit": "sheet.editTitle",
};

export interface FiltersFormProps {
  /** `search`: the feed's filters (SCR-014); `radar-new` and `radar-edit`: the radar layouts of WP-30 (SCR-030, SCR-029). */
  mode: SearchMode;
  /** Seeds the draft once; the route keys the form so that every fresh open starts from the address. */
  initial: SearchFilters;
  /** `data-focus` of the section to scroll to after opening (`pets`, BR-APP-057). */
  focus?: string | null;
  presentation: RoutePresentation;
  /** `data-route` of the content: `filters`, or WP-30's `radar/new` and `radar/edit`. */
  route: string;
  /** `searchRules(devFlags)`, from the route. */
  rules: SearchRules;
  /** `devFlags.dev021OneFlowVocabulary`, from the route. */
  oneVocabulary: boolean;
  /** «Показать …» (search mode). */
  onApply: (draft: SearchFilters) => void;
  /** «Включить радар»: search and `radar-new` modes, with the relax code last taken. */
  onSubscribe: (draft: SearchFilters, relaxed: string | null) => void;
  /** «Сохранить» (`radar-edit`). */
  onSave: (draft: SearchFilters, relaxed: string | null) => void;
  /** «Обвести на карте» (search mode): the draft without districts and zones. */
  onDraw?: (cleared: SearchFilters) => void;
  /** A subscribe or save is on its way. */
  submitting: boolean;
}

/** Scrolls the section marked `data-focus={focus}` to the middle of the sheet once, `FOCUS_DELAY_MS` after mounting. */
function useFocusSection(root: RefObject<HTMLElement | null>, focus: string | null | undefined): void {
  useEffect(() => {
    if (!focus) {
      return undefined;
    }
    const timer = setTimeout(() => {
      const target = [...(root.current?.querySelectorAll("[data-focus]") ?? [])].find(
        (element) => element.getAttribute("data-focus") === focus,
      );
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [root, focus]);
}

/**
 * The full filters sheet (SCR-014; SCR-029 and SCR-030 for WP-30's radar layouts): a `full` `RouteSheet` with ×, the
 * title of the mode and «Сбросить», the sections over a local draft (`useDraft`, nothing reaches the address before
 * apply) and `FiltersFooter` with the live count and the radar forecast of the draft (`useLiveStats`).
 *
 * - Which sections show is `sectionsFor(draft, city, mode, rules, stats)` alone, in the fixed order deal, city,
 *   housing, rent term, rooms, price, where, who posts, tenant, pets, furniture, renovation, floor, area, market,
 *   appliances, posted; the city section hides itself with a single city.
 * - «Сбросить» is `resetAll` of the rules (BR-APP-022; `dev018ResetKeepsDaily`, LB-APP-030); a relax chip replaces
 *   the draft with its re-normalised filters and remembers its code, which a reset keeps and a later subscribe or
 *   save sends.
 * - The city field opens the nested picker as the `pick=city` layer (`useLayerState`): Back closes it before the
 *   sheet, and a pick changes the draft only (`useCityPick`, BR-APP-009).
 * - The pets tips show in the sheet's own toast host, which takes them along when the sheet closes (SCR-042).
 *
 * The content carries `data-route={route}` (with `data-layer="sheet"` for the copy in `@sheet`) as the child of the
 * sheet, which the end-to-end specs select; the standalone sheet renders in place, so a direct load's server HTML
 * holds it. An unknown city renders the sections that need none.
 */
export function FiltersForm({
  mode,
  initial,
  focus,
  presentation,
  route,
  rules,
  oneVocabulary,
  onApply,
  onSubscribe,
  onSave,
  onDraw,
  submitting,
}: FiltersFormProps) {
  const t = useTranslations();
  const { draft, update, replace, relaxed, setRelaxed } = useDraft(initial);
  const { findCity } = useReference();
  const city = findCity(draft.city);
  const stats = useCityStats(draft.city);
  const sections = sectionsFor(draft, city, mode, rules, stats);
  const { count, flow } = useLiveStats(draft, { flow: true, rules });
  const picker = useLayerState("pick");
  const pick = useCityPick({ variant: "nested", draft, update, close: picker.close });
  const content = useRef<HTMLDivElement>(null);
  useFocusSection(content, focus);

  const section: SectionProps = { filters: draft, update, city, stats, mode, rules, sections };

  return (
    <RouteSheet
      presentation={presentation}
      variant="full"
      title={t(TITLES[mode])}
      closeLabel={t("common.close")}
      header={
        <Button
          variant="text"
          size="md"
          data-action="reset"
          onClick={() => replace(resetAll(draft, draft.city, rules))}
          className="text-[15px] text-accent"
        >
          {t("sheet.reset")}
        </Button>
      }
      footer={
        <FiltersFooter
          mode={mode}
          draft={draft}
          count={count}
          flow={flow}
          oneVocabulary={oneVocabulary}
          submitting={submitting}
          onApply={() => onApply(draft)}
          onSubscribe={() => onSubscribe(draft, relaxed)}
          onSave={() => onSave(draft, relaxed)}
          onRelax={(option) => {
            replace(option.filters);
            setRelaxed(option.code);
          }}
        />
      }
    >
      <div ref={content} data-route={route} data-layer={presentation === "layer" ? "sheet" : undefined}>
        <DealSection {...section} />
        <CitySection {...section} onOpenCity={() => picker.open("city")} />
        <TypeSection {...section} />
        {sections.rentTerm ? <RentTermSection {...section} /> : null}
        {sections.rooms ? <RoomsSection {...section} /> : null}
        <PriceSection {...section} />
        <WhereSection {...section} onDraw={onDraw} />
        <OwnerSection {...section} />
        {sections.tenant ? <TenantSection {...section} /> : null}
        {sections.pets ? <PetsSection {...section} /> : null}
        <FurnitureSection {...section} />
        <RenovationSection {...section} />
        <FloorSection {...section} />
        {sections.area ? <AreaSection {...section} /> : null}
        {sections.market ? <MarketSection {...section} /> : null}
        {sections.appliances ? <AppliancesSection {...section} /> : null}
        {sections.posted ? <PostedSection {...section} /> : null}
      </div>
      <ToastHost scope="sheet" />
      {picker.value === "city" ? (
        <CityPickerSheet variant="nested" current={draft.city} onPick={pick} onClose={picker.close} />
      ) : null}
    </RouteSheet>
  );
}
