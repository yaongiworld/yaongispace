import sharp from "sharp";

/**
 * Reading what a photo knows about itself.
 *
 * **Nothing is discarded.** The few fields worth querying become columns; the
 * whole blob is kept as JSON beside them. That is not tidiness — it is the
 * one-way door: recovering an unanticipated field later means re-parsing
 * originals out of R2, at which point the cost is proportional to the library
 * and the field may be one that only mattered because we noticed it was
 * missing. Keeping everything makes that a migration over data we already hold.
 */

export interface PhotoMetadata {
  /** EXIF capture time, if there is one. The caller falls back to import time. */
  occurredAt: Date | null;
  width: number | null;
  height: number | null;
  /** Null unless *both* are present — a half-located photo cannot be proposed. */
  latitude: number | null;
  longitude: number | null;
  /** Everything, including the fields above. The blob is the whole point. */
  exif: Record<string, unknown>;
}

/**
 * Extract what we know from a photo's bytes.
 *
 * Never throws. A file that sharp cannot parse — a stripped screenshot, a
 * format it does not know, something a messaging app mangled — is still a photo
 * somebody chose to keep, and refusing it at import would be the app deciding
 * what is worth keeping. It comes back with nulls and an empty blob, and the
 * caller dates it by its import.
 */
export async function readPhotoMetadata(bytes: Uint8Array): Promise<PhotoMetadata> {
  const empty: PhotoMetadata = {
    occurredAt: null,
    width: null,
    height: null,
    latitude: null,
    longitude: null,
    exif: {},
  };

  try {
    const image = sharp(bytes);
    const metadata = await image.metadata();

    /* sharp hands back EXIF as a raw TIFF buffer. Rather than take a second
       dependency to parse it, we read the fields we name and keep sharp's own
       structured view as the blob. If a future need justifies full tag
       coverage, `exifr` drops in here and the blob simply gets richer — which
       is exactly the migration this design is meant to make possible. */
    const blob: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      /* Buffers are the raw EXIF/ICC/IPTC chunks. They are the only part that
         cannot go in jsonb as-is, and hex is a lossless way to hold them: the
         bytes survive, so nothing is discarded even here. */
      if (Buffer.isBuffer(value)) {
        blob[key] = { encoding: "hex", data: value.toString("hex") };
      } else if (value !== undefined) {
        blob[key] = value;
      }
    }

    /* `orientation` is why width and height are read after it: an EXIF
       orientation of 5–8 means the file's stored dimensions are transposed
       relative to how the photo should be seen. The columns record the photo as
       a person sees it, because that is what a grid lays out. The original
       bytes are untouched either way (ADR-0013). */
    const rotated = (metadata.orientation ?? 1) >= 5;
    const width = metadata.width ?? null;
    const height = metadata.height ?? null;

    return {
      occurredAt: null,
      width: rotated ? height : width,
      height: rotated ? width : height,
      latitude: null,
      longitude: null,
      exif: blob,
    };
  } catch {
    return empty;
  }
}

/**
 * Merge metadata a client parsed on the phone with what the server can see.
 *
 * The phone is the only place the full EXIF exists in convenient form — it has
 * the file open already, and shipping 12MB to a server that must not receive it
 * (ADR-0012) to read a date off it would defeat the whole upload design. So the
 * client parses, and this is where its claims are checked rather than trusted.
 *
 * Client values win where they are *plausible*; the server's own reading of the
 * bytes wins where they are not. A phone reporting a capture time in the year
 * 3000 or a latitude of 400 is a bug, not a memory.
 */
export function mergePhotoMetadata(
  fromClient: Partial<PhotoMetadata> & { exif?: Record<string, unknown> },
  fromServer: PhotoMetadata,
): PhotoMetadata {
  const occurredAt = plausibleDate(fromClient.occurredAt) ?? fromServer.occurredAt;

  const lat = fromClient.latitude ?? fromServer.latitude;
  const lon = fromClient.longitude ?? fromServer.longitude;
  const bothPresent =
    lat !== null && lat !== undefined && lon !== null && lon !== undefined;
  const inRange =
    bothPresent && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);

  return {
    occurredAt,
    width: positive(fromClient.width) ?? fromServer.width,
    height: positive(fromClient.height) ?? fromServer.height,
    /* A half-located photo cannot be drawn and cannot be proposed, so it is
       both or neither — matching the check constraint on `photo`. (0, 0) is
       excluded on purpose: it is Null Island, and it is what a phone reports
       when it has no fix rather than a place anybody has been. */
    latitude: inRange ? lat : null,
    longitude: inRange ? lon : null,
    /* The server's reading first so the client cannot overwrite what the bytes
       actually say, then the client's richer tags on top of it. */
    exif: { ...fromServer.exif, ...(fromClient.exif ?? {}) },
  };
}

/**
 * A capture time we are willing to believe.
 *
 * Bounded because a wrong date is worse than no date: it files a photo under a
 * year we were not alive, and the timeline is the substrate everything else is
 * a lens over. 1900 is comfortably before any photo either of us will import;
 * "tomorrow" allows for a phone clock a few hours out without admitting 3000.
 */
function plausibleDate(value: Date | null | undefined): Date | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  const year = value.getUTCFullYear();
  if (year < 1900) return null;
  if (value.getTime() > Date.now() + 24 * 60 * 60 * 1000) return null;
  return value;
}

function positive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}
