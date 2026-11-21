import { scrubText } from "@/lib/analytics/scrub";

/**
 * The fields of an `app_error` report (WP-32, `03` §1.6, §3.4): their limits and the source extractor. Pure; the
 * reporter (`report.ts`) and the boot-error route apply them, the route a second time on the server.
 */

export const NAME_MAX = 40;
export const MESSAGE_MAX = 300;
export const SOURCE_MAX = 300;
export const SCREEN_MAX = 40;
export const TG_MAX = 10;
export const PLATFORM_MAX = 20;

/** The error of `app_error` as the journal sends it (`JournalEvents.app_error.error`). */
export type ErrorFields = {
  kind: string;
  name: string;
  message: string;
  source: string;
  stage: string;
  screen: string;
  tg: string;
  platform: string;
};

/** `value` as a string of at most `max` characters; anything that is not a string is `""`. */
export function limit(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/** `error.name`, else the `typeof` of the thrown value; characters outside `[\w.$/-]` removed, at most 40. */
export function errorName(error: unknown): string {
  const named = typeof error === "object" && error !== null && typeof (error as { name?: unknown }).name === "string";
  const name = named ? (error as { name: string }).name : typeof error;
  return name.replace(/[^\w.$/-]/g, "").slice(0, NAME_MAX);
}

/** The message of an error, a thrown string as itself; scrubbed, at most 300. */
export function errorMessage(error: unknown): string {
  let message = "";
  if (typeof error === "string") {
    message = error;
  } else if (typeof error === "object" && error !== null && typeof (error as { message?: unknown }).message === "string") {
    message = (error as { message: string }).message;
  }
  return scrubText(message).slice(0, MESSAGE_MAX);
}

/** An address of a source without its query and hash; a trailing `:line:col` is kept. */
export function cleanSource(source: string): string {
  const position = /(:\d+(?::\d+)?)$/.exec(source);
  const tail = position?.[1] ?? "";
  const address = tail === "" ? source : source.slice(0, -tail.length);
  return scrubText(address.replace(/[?#].*$/, "") + tail).slice(0, SOURCE_MAX);
}

/**
 * The source of an error: the given one, else the first `http(s)://…` address of its stack — with `:line:col` when the
 * stack has it — without its query and hash, at most 300.
 */
export function errorSource(error: unknown, given?: string): string {
  if (typeof given === "string" && given !== "") {
    return cleanSource(given);
  }
  const stack = typeof error === "object" && error !== null ? (error as { stack?: unknown }).stack : undefined;
  if (typeof stack !== "string") {
    return "";
  }
  const found = /https?:\/\/[^\s()]+/.exec(stack);
  return found === null ? "" : cleanSource(found[0]);
}
