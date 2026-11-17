"use client";

import type { MessageKey } from "@homi/i18n";
import { type CityRef, type ListingSort, normalizeSort, type SearchFilters, sortOptions } from "@homi/search";
import { Check } from "@homi/ui";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useId, useRef } from "react";

import { labelFor } from "@/i18n/labels";

const SORT_HINTS: Readonly<Partial<Record<ListingSort, MessageKey>>> = {
  deal: "sort.dealHint",
  center: "sort.centerHint",
  ppm: "sort.ppmHint",
};

const ROW =
  "flex w-full items-center gap-3 border-b-[0.5px] border-sep px-1 py-[13px] text-left outline-none last:border-b-0 focus-visible:bg-fill active:opacity-70";

export interface SortListProps {
  filters: Pick<SearchFilters, "deal" | "types">;
  /** The search's city in the reference data; `null` while it loads or for a stale code: the three basic sorts. */
  city: CityRef | null;
  sort: ListingSort;
  /** A row was tapped, the current one included: the sheet closes on any pick. */
  onPick: (sort: ListingSort) => void;
}

/**
 * The rows of the sort sheet (SCR-016, legacy `SortSheet.jsx`): the sorts `sortOptions` offers for the search and its
 * city (BR-APP-023; an unknown city offers «Сначала новые», «Сначала дешевле», «Сначала дороже» and nothing throws,
 * fix of LB-APP-023), `deal`, `center` and `ppm` with their hint line, which describes the row rather than names it.
 * The sort in force — `normalizeSort`, so a sort the search no longer offers reads as `new` — carries ✓ and
 * `aria-checked`.
 *
 * A `radiogroup` whose selection does not follow the focus: every pick closes the sheet, so the arrow keys, Home and
 * End only move the focus (one tab stop, on the checked row) and Enter, Space or a tap picks, the checked row too.
 */
export function SortList({ filters, city, sort, onPick }: SortListProps) {
  const t = useTranslations();
  const options = sortOptions(filters, city);
  const current = normalizeSort(sort, options);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = rows.current.findIndex((row) => row === document.activeElement);
    const last = options.length - 1;
    const next =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? (at + 1) % options.length
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? (at - 1 + options.length) % options.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next !== null && at >= 0) {
      event.preventDefault();
      rows.current[next]?.focus();
    }
  };

  return (
    <div data-slot="sort-list" role="radiogroup" aria-label={t("sort.title")} onKeyDown={onKeyDown} className="flex flex-col px-4">
      {options.map((option, index) => {
        const checked = option === current;
        const hint = SORT_HINTS[option];
        return (
          <button
            key={option}
            ref={(row) => {
              rows.current[index] = row;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-labelledby={`${id}-${option}`}
            aria-describedby={hint ? `${id}-${option}-hint` : undefined}
            tabIndex={checked ? 0 : -1}
            data-sort={option}
            onClick={() => onPick(option)}
            className={ROW}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span id={`${id}-${option}`} className="text-[17px] font-semibold tracking-[-0.01em] text-text">
                {t(labelFor("sort", option))}
              </span>
              {hint ? (
                <span id={`${id}-${option}-hint`} className="text-[14px] leading-snug text-hint">
                  {t(hint)}
                </span>
              ) : null}
            </span>
            {checked ? <Check size={20} strokeWidth={2.5} aria-hidden className="flex-none text-text" /> : null}
          </button>
        );
      })}
    </div>
  );
}
