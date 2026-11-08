/**
 * Hand-written contract types that exist before the OpenAPI spec (ADR-0007).
 * Resource/DTO types are GENERATED into this package from docs/api/openapi.json in Phase 3;
 * only the envelope and pagination shapes below are maintained by hand.
 */

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
  meta?: PaginationMeta & Record<string, unknown>;
  links?: PaginationLinks;
}

export interface ApiFailure {
  success: false;
  message: string;
  /** Laravel validation errors: field → messages (HTTP 422). */
  errors?: Record<string, string[]>;
  /** Stable machine-readable code, snake_case. */
  code?: string;
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export function isApiFailure<T>(body: ApiEnvelope<T>): body is ApiFailure {
  return body.success === false;
}
