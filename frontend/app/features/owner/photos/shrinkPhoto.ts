/** The long side of a photo the form sends, and its JPEG quality (BR-APP-082). */
export const PHOTO_LONG_SIDE = 2048;
export const PHOTO_QUALITY = 0.88;

/**
 * A photo shrunk in the browser to a long side of at most 2048 px, as JPEG at quality 0.88, or `null` when the
 * browser cannot read it (the form then shows `own.photoUnreadable` and sends nothing; fix of LB-APP-061's client
 * half — the server re-encodes every upload anyway, WP-84). The orientation of the file is applied.
 */
export async function shrinkPhoto(file: Blob): Promise<Blob | null> {
  if (typeof createImageBitmap !== "function") {
    return null;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  try {
    const scale = Math.min(1, PHOTO_LONG_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context === null) {
      return null;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", PHOTO_QUALITY));
  } catch {
    return null;
  } finally {
    bitmap.close?.();
  }
}
