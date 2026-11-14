/**
 * Contract types of /api/v1 (ADR-0007, ADR-0017). `paths` and `components` are generated from
 * docs/api/openapi.json into ./generated/api.ts (`pnpm types:generate`; CI fails when the file is stale);
 * only the envelope below is maintained by hand.
 */

export type { components, operations, paths } from "./generated/api";

/** The driver that produced `data` (`meta.source`); `stub` shows the client's "demo data" marker. */
export type SourceDriver = "stub" | "legacy" | "native";

export interface PaginationMeta {
  page: number;
  size: number;
  total: number;
  last_page: number;
}

export interface PaginationLinks {
  next: string | null;
  prev: string | null;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
  /** Page-number lists fill the pagination keys; source methods `source`; cursor lists `next_cursor` (`null` ends the list). */
  meta?: Partial<PaginationMeta> & { source?: SourceDriver; next_cursor?: string | null } & Record<string, unknown>;
  links?: PaginationLinks;
}

export interface ApiFailure {
  success: false;
  message: string;
  /** Stable machine-readable code, snake_case (docs/api/README.md). */
  code: string;
  /** Laravel validation errors: field → messages (HTTP 422). */
  errors?: Record<string, string[]>;
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export function isApiFailure<T>(body: ApiEnvelope<T>): body is ApiFailure {
  return body.success === false;
}
