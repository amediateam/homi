import type { ApiResult } from "@/lib/api/types";

import type { OwnerForm } from "../normalize";
import { fieldsOfError, floorAboveFloors } from "./rules";

/** BR-APP-079: an edit restarts this wait before the save. */
export const AUTOSAVE_MS = 600;

export type FieldKey = keyof OwnerForm;
export type SaveError = "locked" | "offline" | "failed";

/** What a flush ended with: saved (or nothing to save), held by an error, or refused while the cabinet is off. */
export type FlushResult = { ok: true } | { ok: false; error: SaveError | "disabled" | "invalid" };

export interface AutosaveState {
  form: OwnerForm;
  dirty: ReadonlySet<FieldKey>;
  invalid: ReadonlySet<string>;
  saving: boolean;
  error: SaveError | null;
}

export interface AutosaveOptions<T> {
  initial: OwnerForm;
  /** `PATCH` of the changed fields (`updateOwnerListing`). */
  save: (fields: Partial<OwnerForm>) => Promise<ApiResult<T>>;
  /** An answer that is the listing (into the store). */
  onSaved?: (data: T) => void;
  /** `403 owner_disabled`: the form closes with a toast; the save stays dirty and is not retried. */
  onDisabled?: () => void;
  /** The clock, for tests. */
  setTimer?: (run: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The autosave of the owner questionnaire (WP-81, BR-APP-079), without React: every edit marks its fields dirty and
 * restarts 600 ms; flushes run one at a time (a flush asked while one runs waits for it, then sends what is still
 * dirty) and also before «Дальше», before publish and when the form unmounts; the body holds the dirty fields, cleared
 * ones as `null`; while the floor is above the number of floors those two are held back. A field edited while its
 * save was out stays dirty. `409 owner_listing_locked` → `locked`; offline → `offline`; `422 validation_failed`
 * highlights the fields of `detail.fields` (`floor` both floor fields, `point` both coordinates), re-sends the rest
 * in a separate `PATCH`, and the failed fields stay dirty; editing a field removes its highlight.
 */
export class AutosaveController<T> {
  private state: AutosaveState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<FlushResult> | null = null;
  private readonly listeners = new Set<() => void>();
  private closed = false;

  constructor(private options: AutosaveOptions<T>) {
    this.state = { form: options.initial, dirty: new Set(), invalid: new Set(), saving: false, error: null };
  }

  /** The latest callbacks of the component that owns the controller (`useAutosave`). */
  setHandlers(handlers: Pick<AutosaveOptions<T>, "save" | "onSaved" | "onDisabled">): void {
    this.options = { ...this.options, ...handlers };
  }

  getState = (): AutosaveState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<AutosaveState>): void {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** An edit: the fields change, turn dirty and lose their highlight; the wait restarts. */
  edit(change: Partial<OwnerForm>): void {
    if (this.closed) {
      return;
    }
    const keys = Object.keys(change) as FieldKey[];
    const dirty = new Set(this.state.dirty);
    const invalid = new Set(this.state.invalid);
    for (const key of keys) {
      dirty.add(key);
      for (const field of fieldsOfError(key)) {
        invalid.delete(field);
      }
    }
    this.set({ form: { ...this.state.form, ...change }, dirty, invalid, error: null });
    this.schedule();
  }

  private schedule(): void {
    this.cancelTimer();
    const setTimer = this.options.setTimer ?? ((run: () => void, ms: number) => setTimeout(run, ms));
    this.timer = setTimer(() => {
      this.timer = null;
      void this.flush();
    }, AUTOSAVE_MS);
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      (this.options.clearTimer ?? clearTimeout)(this.timer);
      this.timer = null;
    }
  }

  /** Saves what is dirty now, after any flush that is running. */
  async flush(): Promise<FlushResult> {
    this.cancelTimer();
    while (this.running !== null) {
      await this.running;
    }
    const run = this.send();
    this.running = run;
    try {
      return await run;
    } finally {
      this.running = null;
    }
  }

  /** The form unmounts or is hidden (`<Activity>`): one last flush, then nothing more is scheduled until `open()`. */
  close(): Promise<FlushResult> {
    const last = this.flush();
    this.closed = true;
    return last;
  }

  /** The form mounts or is shown again (also React's development double run of effects): edits are taken again. */
  open(): void {
    this.closed = false;
  }

  private body(): Partial<OwnerForm> {
    const { form, dirty } = this.state;
    const held = floorAboveFloors(form) ? new Set<FieldKey>(["floor", "floors_total"]) : new Set<FieldKey>();
    const out: Record<string, unknown> = {};
    for (const key of dirty) {
      if (!held.has(key)) {
        out[key] = form[key];
      }
    }
    return out as Partial<OwnerForm>;
  }

  private async send(): Promise<FlushResult> {
    const body = this.body();
    if (Object.keys(body).length === 0) {
      return { ok: true };
    }
    this.set({ saving: true });
    try {
      return await this.patch(body, true);
    } finally {
      this.set({ saving: false });
    }
  }

  /** One `PATCH`; on `422` the fields that passed are sent once more on their own. */
  private async patch(body: Partial<OwnerForm>, retryRest: boolean): Promise<FlushResult> {
    const result = await this.options.save(body);
    if (result.ok) {
      this.settle(body);
      this.options.onSaved?.(result.data);
      this.set({ error: null });
      return { ok: true };
    }
    if (result.code === "owner_disabled") {
      this.options.onDisabled?.();
      return { ok: false, error: "disabled" };
    }
    if (result.code === "owner_listing_locked") {
      this.set({ error: "locked" });
      return { ok: false, error: "locked" };
    }
    if (result.error === "offline" || result.error === "timeout") {
      this.set({ error: "offline" });
      return { ok: false, error: "offline" };
    }
    if (result.error === "validation" && result.detail?.fields !== undefined) {
      const failed = new Set(result.detail.fields.flatMap(fieldsOfError));
      this.set({ invalid: new Set([...this.state.invalid, ...failed]) });
      const rest = Object.fromEntries(Object.entries(body).filter(([key]) => !failed.has(key))) as Partial<OwnerForm>;
      if (retryRest && Object.keys(rest).length > 0) {
        await this.patch(rest, false);
      }
      return { ok: false, error: "invalid" };
    }
    this.set({ error: "failed" });
    return { ok: false, error: "failed" };
  }

  /** The fields sent are clean unless they changed while the save was out. */
  private settle(sent: Partial<OwnerForm>): void {
    const dirty = new Set(this.state.dirty);
    for (const [key, value] of Object.entries(sent) as [FieldKey, unknown][]) {
      if (same(this.state.form[key], value)) {
        dirty.delete(key);
      }
    }
    this.set({ dirty });
  }
}
