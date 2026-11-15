import type { components } from "@homi/types";

import type { DataSource } from "@/lib/data/sources";

/** `GET /reference` (WP-11) and one element of `GET /cities`, as the contract names them. */
export type Reference = components["schemas"]["ReferenceResource"];
export type City = components["schemas"]["CityResource"];
export type CityStats = components["schemas"]["CityStatsResource"];

/** A cached read: `loaded` is `false` when the API could not be read and the empty value stands in. */
export type Cached<T> = { loaded: true; data: T; source?: DataSource } | { loaded: false; data: T };
