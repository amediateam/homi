import type { Settings } from "./useSettings";

/** The `{ code, name }` entries of an option list of `GET /settings`; anything else is dropped. */
export function namedOptions(value: unknown): { code: string; name: string }[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (option): option is { code: string; name: string } =>
      typeof option === "object" && option !== null && typeof (option as { code?: unknown }).code === "string" && typeof (option as { name?: unknown }).name === "string",
  );
}

/** The key a quiet-hours value has in its option list: `off`, or `23-08`. */
export function quietKey(value: Settings["quiet_hours"]): string {
  return value === null ? "off" : `${value.from}-${value.to}`;
}

/** The key a digest value has in its option list: `9,21`. */
export function digestKey(value: readonly number[]): string {
  return value.join(",");
}
