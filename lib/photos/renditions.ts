import sharp from "sharp";
import { renditionKey, type PhotoStorage, type StorageKey } from "./storage";

/**
 * Renditions: the derived versions of a Photo.
 *
 * Generated **once at import** and stored beside the original, never in place
 * of it (ADR-0013). Rebuildable from the original, so losing one costs nothing
 * — which is why they can be overwritten freely while an original never is.
 *
 * Made here with sharp rather than by Supabase's image transformations, which
 * only work on Supabase-hosted files. That turned out to be preferable anyway:
 * serving cost is flat rather than per-view (ADR-0012).
 */

export interface RenditionSpec {
  /** Free text, matching the `kind` column. 'thumb' and 'display' today. */
  kind: string;
  /** The long edge, in pixels. Never upscaled — see below. */
  longEdge: number;
  quality: number;
}

/**
 * Two sizes, and deliberately only two.
 *
 * `thumb` is what the chronological grid lays out — three across on a phone at
 * 3x is about 360px, so 480 covers it with room. `display` is a photo opened
 * full-screen on a 3x phone. A third intermediate size would be a third of the
 * library's storage and a third more import time to serve a viewport nobody has.
 *
 * WebP for both: it is smaller than JPEG at the same quality and universally
 * supported on both of our phones. The *original* stays whatever it was.
 */
export const RENDITIONS: readonly RenditionSpec[] = [
  { kind: "thumb", longEdge: 480, quality: 72 },
  { kind: "display", longEdge: 1600, quality: 82 },
] as const;

export const RENDITION_CONTENT_TYPE = "image/webp";

export interface MadeRendition {
  kind: string;
  key: StorageKey;
  contentType: string;
  width: number;
  height: number;
  byteSize: number;
}

/**
 * Make and store every rendition for one photo's bytes.
 *
 * Returns what was made, ready to insert into `rendition`. Renditions are
 * written to storage here — they are small, server-made bytes, which is the one
 * case where `put` is right; an *original* going through this path would mean
 * bytes travelled through Vercel, which the design forbids.
 *
 * A rendition that fails to generate is skipped rather than fatal. A photo with
 * no thumbnail is a photo we still have; a failed import is one we do not. The
 * original is already safely in R2 by the time this runs, and renditions are
 * rebuildable by definition.
 */
export async function makeRenditions(
  storage: PhotoStorage,
  sha256: string,
  bytes: Uint8Array,
  specs: readonly RenditionSpec[] = RENDITIONS,
): Promise<MadeRendition[]> {
  const made: MadeRendition[] = [];

  for (const spec of specs) {
    try {
      const { data, info } = await sharp(bytes)
        /* `rotate()` with no argument applies the EXIF orientation. The
           rendition is the photo as a person sees it; the original keeps its
           sideways bytes and its orientation tag, untouched. */
        .rotate()
        .resize({
          width: spec.longEdge,
          height: spec.longEdge,
          fit: "inside",
          /* Never upscale. A 200px photo blown up to 1600 is a bigger file
             carrying no more picture, and it makes an old low-resolution
             keepsake look worse than leaving it alone. */
          withoutEnlargement: true,
        })
        .webp({ quality: spec.quality })
        .toBuffer({ resolveWithObject: true });

      const key = renditionKey(sha256, spec.kind, RENDITION_CONTENT_TYPE);
      await storage.put({ key, body: data, contentType: RENDITION_CONTENT_TYPE });

      made.push({
        kind: spec.kind,
        key,
        contentType: RENDITION_CONTENT_TYPE,
        width: info.width,
        height: info.height,
        byteSize: info.size,
      });
    } catch {
      /* Skipped, not fatal. The original is already safe and this is derived. */
    }
  }

  return made;
}
