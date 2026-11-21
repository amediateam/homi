import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PHOTO_QUALITY, shrinkPhoto } from "@/features/owner/photos/shrinkPhoto";

const drawn: { width: number; height: number }[] = [];
let toBlobArgs: unknown[] = [];

beforeEach(() => {
  drawn.length = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function getContext(this: HTMLCanvasElement) {
    return { drawImage: () => drawn.push({ width: this.width, height: this.height }) } as unknown as CanvasRenderingContext2D;
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback: BlobCallback, ...args: unknown[]) => {
    toBlobArgs = args;
    callback(new Blob(["jpeg"], { type: "image/jpeg" }));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("shrinkPhoto (WP-81, BR-APP-082)", () => {
  it("shrinks the long side to 2048 px and encodes JPEG at 0.88", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 4096, height: 3072, close: vi.fn() })));
    const blob = await shrinkPhoto(new Blob(["x"]));

    expect(blob?.type).toBe("image/jpeg");
    expect(drawn).toEqual([{ width: 2048, height: 1536 }]);
    expect(toBlobArgs).toEqual(["image/jpeg", PHOTO_QUALITY]);
  });

  it("keeps a smaller photo's size", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 800, height: 1200, close: vi.fn() })));
    await shrinkPhoto(new Blob(["x"]));

    expect(drawn).toEqual([{ width: 800, height: 1200 }]);
  });

  it("is null for a file the browser cannot read, and without createImageBitmap", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => Promise.reject(new Error("InvalidStateError"))));
    await expect(shrinkPhoto(new Blob(["x"]))).resolves.toBeNull();

    vi.stubGlobal("createImageBitmap", undefined);
    await expect(shrinkPhoto(new Blob(["x"]))).resolves.toBeNull();
  });
});
