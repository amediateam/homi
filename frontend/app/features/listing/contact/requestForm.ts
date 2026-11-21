import type { ContactRequestWho } from "@/lib/actions/listing";

/** The five «Кто будет жить» chips (SCR-061), in their order, with the count each sets while the stepper is untouched. */
export const WHO_DEFAULTS: readonly { who: ContactRequestWho; people: number }[] = [
  { who: "one", people: 1 },
  { who: "couple", people: 2 },
  { who: "family", people: 3 },
  { who: "students", people: 2 },
  { who: "friends", people: 2 },
];

export const PEOPLE_MIN = 1;
export const PEOPLE_MAX = 20;
export const MOVE_IN_MAX = 32;
export const MESSAGE_MAX = 500;

export interface RequestDraft {
  who: ContactRequestWho | null;
  people: number;
  /** The stepper was changed by hand: a later «who» no longer resets it (fix of LB-APP-077). */
  peopleTouched: boolean;
  moveIn: string;
  message: string;
}

export const EMPTY_DRAFT: RequestDraft = { who: null, people: 1, peopleTouched: false, moveIn: "", message: "" };

/** A chip picked: its default count applies only while the stepper is untouched. */
export function pickWho(draft: RequestDraft, who: ContactRequestWho): RequestDraft {
  const people = draft.peopleTouched ? draft.people : (WHO_DEFAULTS.find((entry) => entry.who === who)?.people ?? draft.people);
  return { ...draft, who, people };
}

/** The stepper moved by `delta`, kept within 1 … 20, and marked as touched. */
export function stepPeople(draft: RequestDraft, delta: number): RequestDraft {
  return { ...draft, people: Math.min(PEOPLE_MAX, Math.max(PEOPLE_MIN, draft.people + delta)), peopleTouched: true };
}

/** The body the action takes: trimmed texts, empty ones as `null`; `null` while no «who» is picked. */
export function requestBody(draft: RequestDraft): { who: ContactRequestWho; people: number; move_in: string | null; message: string | null } | null {
  if (draft.who === null) {
    return null;
  }
  const text = (value: string, max: number) => {
    const trimmed = value.trim().slice(0, max);
    return trimmed === "" ? null : trimmed;
  };
  return { who: draft.who, people: draft.people, move_in: text(draft.moveIn, MOVE_IN_MAX), message: text(draft.message, MESSAGE_MAX) };
}
