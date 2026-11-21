import { track } from "@/lib/analytics/events";

type What = "dot" | "coach" | "banner";
type Action = "shown" | "clicked";

const sent = new Set<string>();

/** `owner_attention {what, action}` at most once per launch for each pair (WP-82, SCR-059, SCR-060). */
export function trackAttention(what: What, action: Action): void {
  const key = `${what}:${action}`;
  if (sent.has(key)) {
    return;
  }
  sent.add(key);
  track("owner_attention", { what, action });
}

/** Tests only. */
export function resetAttention(): void {
  sent.clear();
}
