import { getAuth } from "@/lib/session/store";

import { scrubDeep } from "./scrub";

/**
 * The transport of the action log (WP-32, `03` §3.3; DEC-41, DEC-44): `POST /bff/events` with the body of `POST
 * /events` of the WP-11 contract, `{ name, props }` — the only place that knows that shape. Before the session is
 * ready the events wait in a queue of at most 20 (the oldest dropped); `flush()` sends them, in order, with the values
 * measured when they were tracked, and opens the journal; `discard()` drops them and closes it (outside Telegram, a
 * refused or an expired session). Fire-and-forget: `keepalive`, so an event survives the app closing; never read,
 * never retried, never a re-authentication or an error state (it does not use `bffFetch`) — every failure, a `401`
 * included, is swallowed. The body is scrubbed (`scrubDeep`); over 8 KB the error's `message` and `source` are emptied,
 * and a body still over is dropped. In header mode the bearer token of the session store goes along; the cookie of
 * cookie mode goes by itself.
 */

export const QUEUE_MAX = 20;
export const BODY_MAX_BYTES = 8 * 1024;
const PATH = "/bff/events";

type Event = { name: string; props: Record<string, unknown> };

let state: "waiting" | "open" | "closed" = "waiting";
const queue: Event[] = [];

function bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** The JSON body of `event`, scrubbed and within 8 KB, else `null`. */
export function bodyOf(event: Event): string | null {
  const props = (scrubDeep(event.props) ?? {}) as Record<string, unknown>;
  let body = JSON.stringify({ name: event.name, props });
  if (bytes(body) <= BODY_MAX_BYTES) {
    return body;
  }
  const error = props.error;
  if (typeof error === "object" && error !== null) {
    body = JSON.stringify({ name: event.name, props: { ...props, error: { ...error, message: "", source: "" } } });
    if (bytes(body) <= BODY_MAX_BYTES) {
      return body;
    }
  }
  return null;
}

function send(event: Event): void {
  const auth = getAuth();
  if (auth.mode === null) {
    return;
  }
  const body = bodyOf(event);
  if (body === null) {
    return;
  }
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (auth.mode === "header") {
    headers.Authorization = `Bearer ${auth.token}`;
  }
  try {
    void fetch(PATH, { method: "POST", keepalive: true, credentials: "same-origin", headers, body }).catch(() => undefined);
  } catch {
    // A fetch that throws at once (an engine without keepalive, a blocked request) changes nothing.
  }
}

/** Hands an event to the journal: sent at once while it is open, queued before the session is ready, else dropped. */
export function enqueue(name: string, props: Record<string, unknown>): void {
  const event = { name, props };
  if (state === "open") {
    send(event);
    return;
  }
  if (state === "closed") {
    return;
  }
  queue.push(event);
  if (queue.length > QUEUE_MAX) {
    queue.shift();
  }
}

/** The session is ready: the queued events go, in order, and later ones go at once. */
export function flush(): void {
  state = "open";
  for (const event of queue.splice(0)) {
    send(event);
  }
}

/** Outside Telegram, a refused or an expired session: the queue is dropped and nothing more is sent. */
export function discard(): void {
  state = "closed";
  queue.length = 0;
}

/** Tests only: the journal of a new launch. */
export function resetJournal(): void {
  state = "waiting";
  queue.length = 0;
}

/** Tests only: what waits. */
export function queuedEvents(): readonly Event[] {
  return queue;
}
