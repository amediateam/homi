import type { SearchFilters, SearchMode, SearchRules, Sections } from "@homi/search";

import type { City, CityStats } from "@/lib/reference/types";

/**
 * What every section of the filters sheet receives (WP-25). Sections are stateless: they render `filters` (the
 * draft) and hand the next draft to `update`, built with the transitions of `@homi/search` (`switchDeal`,
 * `toggleType`, `pickRooms`, …); `update` normalises it. `sections` is `sectionsFor(…)` of the same draft, so a
 * section never decides visibility itself; `rules` is `searchRules(devFlags)`, passed down, never imported here.
 */
export interface SectionProps {
  filters: SearchFilters;
  update: (patch: Partial<SearchFilters>) => void;
  /** The draft's city in the reference data; `null` while it loads or for an unknown code. */
  city: City | null;
  /** The draft's city in `GET /cities`; `null` while it loads, when it failed or for an unknown code. */
  stats: CityStats | null;
  mode: SearchMode;
  rules: SearchRules;
  sections: Sections;
}
