// Shrinks a photo in the browser before upload: a 12 MP phone picture becomes a ~300 KB JPEG,
// which uploads quickly on mobile data. The server re-encodes it again either way.

const MAX_EDGE = 1600;
const QUALITY = 0.85;

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * A JPEG at most `maxEdge` pixels on its long side, turned the right way up. Falls back to the
 * original file when the browser can't decode it (the server then says what's wrong).
 */
export async function resizeForUpload(file: File, maxEdge = MAX_EDGE): Promise<Blob> {
  if (typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return (await canvasToBlob(canvas, QUALITY)) ?? file;
  } finally {
    bitmap.close();
  }
}
