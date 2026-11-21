import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTOSAVE_MS, AutosaveController } from "@/features/owner/form/autosave";
import { normalizeForm } from "@/features/owner/normalize";
import type { ApiResult } from "@/lib/api/types";

type Answer = ApiResult<{ id: string }>;
const ok: Answer = { ok: true, data: { id: "x" }, meta: { source: "stub" } };
const fail = (error: "offline" | "conflict" | "validation" | "server" | "forbidden", code?: string, fields?: string[]): Answer => ({
  ok: false,
  error,
  status: 0,
  ...(code === undefined ? {} : { code }),
  ...(fields === undefined ? {} : { detail: { fields } }),
  method: "PATCH",
  path: "owner/listings/:id",
});

let answers: Answer[];
let sent: Record<string, unknown>[];
let save: (fields: Record<string, unknown>) => Promise<Answer>;

function controller(onDisabled = vi.fn()) {
  return new AutosaveController({ initial: normalizeForm({ city: "tashkent", floors_total: 9 }), save: (fields) => save(fields), onDisabled });
}

beforeEach(() => {
  vi.useFakeTimers();
  answers = [];
  sent = [];
  save = vi.fn(async (fields) => {
    sent.push(fields);
    return answers.shift() ?? ok;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AutosaveController (WP-81, BR-APP-079)", () => {
  it("saves the dirty fields 600 ms after the last edit, cleared ones as null", async () => {
    const autosave = controller();
    autosave.edit({ price: 600 });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 1);
    autosave.edit({ landmark: null, rooms: 2 });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 1);
    expect(sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);

    expect(sent).toEqual([{ price: 600, landmark: null, rooms: 2 }]);
    expect(autosave.getState().dirty.size).toBe(0);
  });

  it("runs one flush at a time: a field edited while its save is out stays dirty and goes next", async () => {
    let release: (answer: Answer) => void = () => undefined;
    save = vi.fn((fields) => {
      sent.push(fields);
      return sent.length === 1 ? new Promise<Answer>((resolve) => (release = resolve)) : Promise.resolve(ok);
    });
    const autosave = controller();
    autosave.edit({ price: 600 });
    const first = autosave.flush();
    autosave.edit({ price: 650 });
    const second = autosave.flush();
    release(ok);
    await first;
    await second;

    expect(sent).toEqual([{ price: 600 }, { price: 650 }]);
    expect(autosave.getState().dirty.size).toBe(0);
  });

  it("holds the floor fields back while the floor is above the floors, and sends them once it is not", async () => {
    const autosave = controller();
    autosave.edit({ floor: 12, price: 500 });
    await autosave.flush();
    expect(sent).toEqual([{ price: 500 }]);
    expect([...autosave.getState().dirty]).toEqual(["floor"]);

    autosave.edit({ floors_total: 14 });
    await autosave.flush();
    expect(sent[1]).toEqual({ floor: 12, floors_total: 14 });
  });

  it("a 422 highlights its fields, re-sends the rest on their own, and the failed fields stay dirty until edited", async () => {
    answers = [fail("validation", "validation_failed", ["floor"])];
    const autosave = controller();
    autosave.edit({ floor: 4, price: 700 });
    await expect(autosave.flush()).resolves.toEqual({ ok: false, error: "invalid" });

    expect(sent).toEqual([{ floor: 4, price: 700 }, { price: 700 }]);
    expect([...autosave.getState().invalid].sort()).toEqual(["floor", "floors_total"]);
    expect([...autosave.getState().dirty]).toEqual(["floor"]);

    autosave.edit({ floor: 5 });
    expect(autosave.getState().invalid.size).toBe(0);
  });

  it("a switched-off cabinet on the re-send after a 422 answers disabled (round 3)", async () => {
    answers = [fail("validation", "validation_failed", ["floor"]), fail("forbidden", "owner_disabled")];
    const onDisabled = vi.fn();
    const autosave = controller(onDisabled);
    autosave.edit({ floor: 4, price: 700 });

    await expect(autosave.flush()).resolves.toEqual({ ok: false, error: "disabled" });
    expect(onDisabled).toHaveBeenCalledTimes(1);
  });

  it("locked, offline and any other failure are kept as the error; the fields stay dirty", async () => {
    answers = [fail("conflict", "owner_listing_locked"), fail("offline"), fail("server")];
    const autosave = controller();
    autosave.edit({ price: 1 });
    await expect(autosave.flush()).resolves.toEqual({ ok: false, error: "locked" });
    expect(autosave.getState().error).toBe("locked");
    await expect(autosave.flush()).resolves.toEqual({ ok: false, error: "offline" });
    await expect(autosave.flush()).resolves.toEqual({ ok: false, error: "failed" });
    expect([...autosave.getState().dirty]).toEqual(["price"]);
  });

  it("403 owner_disabled calls onDisabled and is not retried", async () => {
    answers = [fail("forbidden", "owner_disabled")];
    const onDisabled = vi.fn();
    const autosave = controller(onDisabled);
    autosave.edit({ price: 1 });
    await expect(autosave.flush()).resolves.toEqual({ ok: false, error: "disabled" });

    expect(onDisabled).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(1);
  });

  it("close flushes once more and takes no edit after it", async () => {
    const autosave = controller();
    autosave.edit({ price: 1 });
    await autosave.close();
    autosave.edit({ price: 2 });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2);

    expect(sent).toEqual([{ price: 1 }]);
  });

  it("open() after close() takes edits again (a remount, an Activity show; first review)", async () => {
    const autosave = controller();
    await autosave.close();
    autosave.open();
    autosave.edit({ price: 3 });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);

    expect(sent).toEqual([{ price: 3 }]);
  });

  it("nothing dirty: a flush sends nothing", async () => {
    await expect(controller().flush()).resolves.toEqual({ ok: true });
    expect(sent).toEqual([]);
  });
});
