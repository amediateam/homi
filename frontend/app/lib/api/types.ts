import type { ApiSuccess } from "@homi/types";

import type { ApiFailure } from "./errors";

/** `meta` of a successful answer: `source` on every sourced method, `next_cursor` on cursor lists (`25` §4.3). */
export type ApiMeta = NonNullable<ApiSuccess<unknown>["meta"]>;

/** What every call of WP-22 returns — on the server, through `/bff` and from a Server Action; serialisable. */
export type ApiResult<T> = { ok: true; data: T; meta: ApiMeta } | ApiFailure;
