"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import type { ApiResult } from "@/lib/api/types";

import type { OwnerForm } from "../normalize";
import { AutosaveController, type AutosaveState, type FlushResult } from "./autosave";

export interface UseAutosaveOptions<T> {
  initial: OwnerForm;
  save: (fields: Partial<OwnerForm>) => Promise<ApiResult<T>>;
  onSaved?: (data: T) => void;
  onDisabled?: () => void;
}

export interface Autosave extends AutosaveState {
  edit: (change: Partial<OwnerForm>) => void;
  flush: () => Promise<FlushResult>;
}

/**
 * The questionnaire's autosave (BR-APP-079): one `AutosaveController` per form, its state as React state, the latest
 * callbacks always used, and one last flush when the form unmounts.
 */
export function useAutosave<T>(options: UseAutosaveOptions<T>): Autosave {
  const [controller] = useState(() => new AutosaveController<T>(options));
  const { save, onSaved, onDisabled } = options;
  useEffect(() => {
    controller.setHandlers({ save, onSaved, onDisabled });
  }, [controller, save, onSaved, onDisabled]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  useEffect(() => () => void controller.close(), [controller]);
  return { ...state, edit: (change) => controller.edit(change), flush: () => controller.flush() };
}
