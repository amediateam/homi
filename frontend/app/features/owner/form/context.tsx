"use client";

import { createContext, useContext } from "react";

import type { OwnerForm, OwnerListingView } from "../normalize";
import type { FlushResult } from "./autosave";

/** What the questionnaire hands to its steps (the picker, the phone, the mode): the form and its autosave. */
export interface OwnerFormValue {
  listing: OwnerListingView;
  form: OwnerForm;
  /** An edit with its couplings (BR-APP-080). */
  edit: (change: Partial<OwnerForm>) => void;
  /** An edit as it is: an undo restores exactly what was there. */
  restore: (change: Partial<OwnerForm>) => void;
  flush: () => Promise<FlushResult>;
  /** The form as it is now (after an await). */
  current: () => OwnerForm;
  /** A publish refused with `422`: the questionnaire highlights the parts it names (or shows the save-failed text). */
  reportInvalid: (fields: readonly string[]) => void;
}

export const OwnerFormContext = createContext<OwnerFormValue | null>(null);

/** The questionnaire's form and autosave, for a step rendered below it; `null` outside the form. */
export function useOwnerForm(): OwnerFormValue | null {
  return useContext(OwnerFormContext);
}
