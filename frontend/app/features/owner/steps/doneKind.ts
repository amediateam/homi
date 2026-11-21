/**
 * What the done step shows (WP-81, SCR-056): a new listing (the celebration), a publish the checks held for the
 * operators («На проверке», default 26), or an edit («Сохранили», DEV-062). The mode step records it just before it
 * opens the done step; a done step loaded directly reads it from the listing (held, else an edit).
 */
export type DoneKind = "new" | "held" | "edit";

let recorded: { id: string; kind: DoneKind } | null = null;

export function recordDone(id: string, kind: DoneKind): void {
  recorded = { id, kind };
}

export function doneKindOf(id: string, held: boolean): DoneKind {
  if (recorded !== null && recorded.id === id) {
    return recorded.kind;
  }
  return held ? "held" : "edit";
}

/** Tests only. */
export function resetDone(): void {
  recorded = null;
}
