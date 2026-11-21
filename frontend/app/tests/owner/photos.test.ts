import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/actions/run";

const state = vi.hoisted(() => ({
  upload: vi.fn(),
  shrink: vi.fn(),
  order: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/features/owner/photos/shrinkPhoto", () => ({ shrinkPhoto: (file: Blob) => state.shrink(file) }));
vi.mock("@/features/owner/photos/upload", async (original) => ({
  ...(await original<typeof import("@/features/owner/photos/upload")>()),
  uploadPhoto: (id: string, blob: Blob, onProgress: (share: number) => void) => state.upload(id, blob, onProgress),
}));
vi.mock("@/lib/actions/owner", () => ({ orderOwnerPhotos: (input: unknown) => state.order(input), deleteOwnerPhoto: (input: unknown) => state.remove(input) }));
vi.mock("@/lib/actions/useAction", () => ({ useAction: (action: (input: unknown) => unknown) => (input: unknown) => action(input) }));
vi.mock("@/features/owner/store", () => ({ putOwnerListing: vi.fn(), invalidateOwner: vi.fn() }));
vi.mock("@/lib/session/bootstrap", () => ({ refresh: vi.fn(), reauthenticate: vi.fn() }));

import { usePhotos } from "@/features/owner/photos/usePhotos";
import { TOAST_ACTION_MS, currentToast, dismissToast } from "@/lib/ui/toast";

const ID = "01JF0000000000000000000004";
const P1 = { id: "01JF0000000000000000000101", url: "https://cdn.test/1.jpg" };
const P2 = { id: "01JF0000000000000000000102", url: "https://cdn.test/2.jpg" };
const P3 = { id: "01JF0000000000000000000103", url: "https://cdn.test/3.jpg" };
const listing = (photos: { id: string; url: string }[]) => ({ ok: true, data: { id: ID, photos }, meta: {} }) as ActionResult<unknown>;
const failure = (status: number, code: string) => ({ ok: false, error: status === 409 ? "conflict" : "validation", status, code, method: "POST", path: "p" });
const file = (name: string) => new File(["x"], name, { type: "image/jpeg" });
const texts = { deleted: "Фото удалили", undo: "Вернуть" };

function hook(photos = [P1], limit = 10) {
  return renderHook(() => usePhotos({ listingId: ID, photos, limit, onDisabled: vi.fn(), texts }));
}

beforeEach(() => {
  vi.useFakeTimers();
  for (const mock of Object.values(state)) {
    mock.mockReset();
  }
  state.shrink.mockImplementation(async () => new Blob(["jpeg"]));
});

afterEach(() => {
  dismissToast("app");
  vi.useRealTimers();
});

describe("usePhotos (WP-81, BR-APP-082, DEV-057)", () => {
  it("uploads one by one with progress; a new photo is marked arrived", async () => {
    state.upload.mockImplementation(async (_id: string, _blob: Blob, onProgress: (share: number) => void) => {
      onProgress(0.5);
      return listing([P1, P2]);
    });
    const { result } = hook();
    await act(() => result.current.add([file("a.jpg")]));

    expect(state.upload).toHaveBeenCalledTimes(1);
    expect(result.current.arrived.has(P2.id)).toBe(true);
    expect(result.current.tiles).toEqual([]);
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(result.current.arrived.size).toBe(0);
  });

  it("cuts a selection to the free places and says «Не больше N фото.»", async () => {
    state.upload.mockResolvedValue(listing([P1, P2]));
    const { result } = hook([P1], 2);
    await act(() => result.current.add([file("a.jpg"), file("b.jpg"), file("c.jpg")]));

    expect(state.upload).toHaveBeenCalledTimes(1);
    expect(result.current.error).toEqual({ key: "own.photosMax", n: 2 });
  });

  it("skips a file the browser cannot read, goes on after a media code, stops at owner_photo_limit", async () => {
    state.shrink.mockResolvedValueOnce(null);
    state.upload.mockResolvedValueOnce(failure(422, "unsupported_mime")).mockResolvedValueOnce(failure(409, "owner_photo_limit"));
    const { result } = hook();
    await act(() => result.current.add([file("bad.heic"), file("a.txt"), file("c.jpg"), file("d.jpg")]));

    expect(state.upload).toHaveBeenCalledTimes(2);
    expect(result.current.error).toEqual({ key: "own.photosMax", n: 10 });
  });

  it("«Сделать обложкой» sends the full order with that id first", async () => {
    state.order.mockResolvedValue(listing([P2, P1, P3]));
    const { result } = hook([P1, P2, P3]);
    await act(() => result.current.makeCover(P2.id));

    expect(state.order).toHaveBeenCalledWith({ id: ID, ids: [P2.id, P1.id, P3.id] });
  });

  it("«Удалить фото» hides at once and sends after the toast's 6 s; «Вернуть» shows it again and sends nothing", async () => {
    state.remove.mockResolvedValue(listing([P1]));
    const { result } = hook([P1, P2]);
    act(() => result.current.remove(P2.id));
    expect(result.current.photos).toEqual([P1]);
    expect(currentToast("app")?.message).toMatchObject({ text: "Фото удалили", action: "Вернуть" });
    await act(() => vi.advanceTimersByTimeAsync(TOAST_ACTION_MS));
    expect(state.remove).toHaveBeenCalledWith({ id: ID, photo: P2.id });

    state.remove.mockClear();
    const second = hook([P1, P2]);
    act(() => second.result.current.remove(P2.id));
    act(() => (currentToast("app")!.message as { run: () => void }).run());
    expect(second.result.current.photos).toEqual([P1, P2]);
    await act(() => vi.advanceTimersByTimeAsync(TOAST_ACTION_MS));
    expect(state.remove).not.toHaveBeenCalled();
  });

  it("«Сделать обложкой» keeps a photo whose delete is still waiting, at the end of the order (first review)", async () => {
    state.order.mockResolvedValue(listing([P3, P1, P2]));
    const { result } = hook([P1, P2, P3]);
    act(() => result.current.remove(P2.id));
    await act(() => result.current.makeCover(P3.id));

    expect(state.order).toHaveBeenCalledWith({ id: ID, ids: [P3.id, P1.id, P2.id] });
  });

  it("flushDeletes sends the waiting deletes at once (before «Дальше» and publish)", async () => {
    state.remove.mockResolvedValue(listing([P1]));
    const { result } = hook([P1, P2]);
    act(() => result.current.remove(P2.id));
    await act(() => result.current.flushDeletes());

    expect(state.remove).toHaveBeenCalledWith({ id: ID, photo: P2.id });
    state.remove.mockClear();
    await act(() => vi.advanceTimersByTimeAsync(TOAST_ACTION_MS));
    expect(state.remove).not.toHaveBeenCalled();
  });

  it("a delete still waiting is sent when the form unmounts", async () => {
    state.remove.mockResolvedValue(listing([P1]));
    const { result, unmount } = hook([P1, P2]);
    act(() => result.current.remove(P2.id));
    unmount();

    expect(state.remove).toHaveBeenCalledWith({ id: ID, photo: P2.id });
  });
});
