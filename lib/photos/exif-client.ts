/**
 * Reading EXIF on the phone, before anything is uploaded.
 *
 * The phone is the only place the original is actually open. Sending 12MB to a
 * server that must not receive it (ADR-0012) merely to read a capture time off
 * it would defeat the entire upload design, so the parse happens here and the
 * few hundred bytes of result travel instead of the file.
 *
 * The server does **not** trust what this produces — `mergePhotoMetadata`
 * checks it against its own reading of the bytes and refuses an implausible
 * date, a half-location, or Null Island. This is a convenience, not an
 * authority.
 *
 * ## Why this is hand-rolled and small
 *
 * A full EXIF library is 50–100KB on a page whose job is to show a grid and get
 * out of the way, and this needs six tags. So it walks the JPEG's APP1 segment
 * directly: it is a documented format that has not changed since 1998.
 *
 * **Nothing is discarded despite the narrow parse.** Every tag it walks past in
 * the IFDs it recognises goes into the blob, and the blob is stored whole. The
 * fields below are the ones that become columns; the rest are kept so that
 * recovering one later is a migration over data we hold rather than a re-parse
 * of originals out of R2.
 */

export interface ClientPhotoMetadata {
  occurredAt: string | null;
  width: number | null;
  height: number | null;
  latitude: number | null;
  longitude: number | null;
  exif: Record<string, unknown>;
}

/** The tags that become columns. Everything else is kept in the blob by number. */
const TAGS: Record<number, string> = {
  0x010f: "Make",
  0x0110: "Model",
  0x0112: "Orientation",
  0x829a: "ExposureTime",
  0x829d: "FNumber",
  0x8827: "ISOSpeedRatings",
  0x9003: "DateTimeOriginal",
  0x9004: "DateTimeDigitized",
  0x0132: "DateTime",
  0xa002: "ExifImageWidth",
  0xa003: "ExifImageHeight",
  0x920a: "FocalLength",
  0xa432: "LensSpecification",
  0xa434: "LensModel",
  0x8825: "GPSInfoIFDPointer",
  0x8769: "ExifIFDPointer",
};

const GPS_TAGS: Record<number, string> = {
  0x0001: "GPSLatitudeRef",
  0x0002: "GPSLatitude",
  0x0003: "GPSLongitudeRef",
  0x0004: "GPSLongitude",
  0x0005: "GPSAltitudeRef",
  0x0006: "GPSAltitude",
};

/**
 * Read what a file knows about itself.
 *
 * Never throws. A file with no EXIF, or one a messaging app stripped, is still
 * a photo somebody chose to keep — it comes back with nulls and is dated by its
 * import.
 */
export async function readClientMetadata(blob: Blob): Promise<ClientPhotoMetadata> {
  const empty: ClientPhotoMetadata = {
    occurredAt: null,
    width: null,
    height: null,
    latitude: null,
    longitude: null,
    exif: {},
  };

  try {
    /* Only the head of the file. EXIF lives in the first APP1 segment, and
       reading 256KB of a 12MB photo is the difference between a grid that
       appears at once and one that stutters through forty files. */
    const head = new DataView(await blob.slice(0, 256 * 1024).arrayBuffer());
    const tags = parseJpegExif(head);
    if (!tags) return { ...empty, ...(await readDimensions(blob)) };

    const { latitude, longitude } = coordinatesFrom(tags);

    return {
      occurredAt: dateFrom(tags),
      latitude,
      longitude,
      ...(await readDimensions(blob)),
      exif: tags,
    };
  } catch {
    return empty;
  }
}

/**
 * Dimensions from the decoder rather than from EXIF.
 *
 * EXIF's `ExifImageWidth` is frequently absent and occasionally wrong; the
 * browser's own decode is neither. `createImageBitmap` also applies the EXIF
 * orientation, so these are the photo as a person sees it — which is what a
 * grid lays out.
 */
async function readDimensions(
  blob: Blob,
): Promise<{ width: number | null; height: number | null }> {
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return { width: null, height: null };
  }
}

/** Walk to the APP1 segment and read its IFDs. Null when there is no EXIF. */
function parseJpegExif(view: DataView): Record<string, unknown> | null {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null;
    const marker = view.getUint8(offset + 1);
    const length = view.getUint16(offset + 2);

    if (marker === 0xe1) {
      /* "Exif\0\0" precedes the TIFF header. Without it this is some other
         APP1 payload — XMP, most often — which we leave alone. */
      const exifStart = offset + 4;
      if (view.getUint32(exifStart) !== 0x45786966) return null;
      return readTiff(view, exifStart + 6);
    }

    /* SOS: the compressed data starts and there is no more metadata. */
    if (marker === 0xda) return null;
    offset += 2 + length;
  }
  return null;
}

function readTiff(view: DataView, start: number): Record<string, unknown> | null {
  const byteOrder = view.getUint16(start);
  /* "II" is little-endian, "MM" big-endian. Both occur in the wild — Canon and
     Nikon disagree — and reading one as the other yields plausible nonsense
     rather than an error, which is why this is checked rather than assumed. */
  const little = byteOrder === 0x4949;
  if (!little && byteOrder !== 0x4d4d) return null;
  if (view.getUint16(start + 2, little) !== 0x002a) return null;

  const tags: Record<string, unknown> = {};
  const ifd0 = start + view.getUint32(start + 4, little);
  readIfd(view, ifd0, start, little, TAGS, tags);

  /* The interesting tags live in the Exif sub-IFD, which IFD0 only points at. */
  const exifPointer = tags.ExifIFDPointer;
  if (typeof exifPointer === "number") {
    readIfd(view, start + exifPointer, start, little, TAGS, tags);
  }

  const gpsPointer = tags.GPSInfoIFDPointer;
  if (typeof gpsPointer === "number") {
    readIfd(view, start + gpsPointer, start, little, GPS_TAGS, tags);
  }

  delete tags.ExifIFDPointer;
  delete tags.GPSInfoIFDPointer;
  return tags;
}

function readIfd(
  view: DataView,
  offset: number,
  tiffStart: number,
  little: boolean,
  names: Record<number, string>,
  into: Record<string, unknown>,
): void {
  if (offset + 2 > view.byteLength) return;
  const count = view.getUint16(offset, little);

  for (let i = 0; i < count; i++) {
    const entry = offset + 2 + i * 12;
    if (entry + 12 > view.byteLength) return;

    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const length = view.getUint32(entry + 4, little);
    /* Values of four bytes or fewer are inline; anything longer is a pointer
       into the TIFF block. */
    const size = BYTES_PER_TYPE[type] ?? 0;
    const total = size * length;
    const valueAt =
      total <= 4 ? entry + 8 : tiffStart + view.getUint32(entry + 8, little);
    if (valueAt + total > view.byteLength) continue;

    const value = readValue(view, valueAt, type, length, little);
    if (value === undefined) continue;

    /* Named where we have a name, numbered where we do not — so an unrecognised
       tag is still carried into the blob rather than dropped. */
    into[names[tag] ?? `Tag${tag.toString(16)}`] = value;
  }
}

const BYTES_PER_TYPE: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  7: 1, // UNDEFINED
  9: 4, // SLONG
  10: 8, // SRATIONAL
};

function readValue(
  view: DataView,
  offset: number,
  type: number,
  length: number,
  little: boolean,
): unknown {
  switch (type) {
    case 2: {
      let text = "";
      for (let i = 0; i < length - 1; i++) {
        const code = view.getUint8(offset + i);
        if (code === 0) break;
        text += String.fromCharCode(code);
      }
      return text;
    }
    case 3:
      return length === 1
        ? view.getUint16(offset, little)
        : range(length, (i) => view.getUint16(offset + i * 2, little));
    case 4:
      return length === 1
        ? view.getUint32(offset, little)
        : range(length, (i) => view.getUint32(offset + i * 4, little));
    case 5:
      return length === 1
        ? rational(view, offset, little)
        : range(length, (i) => rational(view, offset + i * 8, little));
    case 10:
      return length === 1
        ? signedRational(view, offset, little)
        : range(length, (i) => signedRational(view, offset + i * 8, little));
    case 1:
    case 7:
      return length === 1 ? view.getUint8(offset) : undefined;
    default:
      return undefined;
  }
}

function rational(view: DataView, offset: number, little: boolean): number {
  const denominator = view.getUint32(offset + 4, little);
  return denominator === 0 ? 0 : view.getUint32(offset, little) / denominator;
}

function signedRational(view: DataView, offset: number, little: boolean): number {
  const denominator = view.getInt32(offset + 4, little);
  return denominator === 0 ? 0 : view.getInt32(offset, little) / denominator;
}

function range<T>(length: number, read: (index: number) => T): T[] {
  return Array.from({ length }, (_, i) => read(i));
}

/**
 * The capture time, as an ISO string.
 *
 * EXIF writes `2025:10:05 08:00:00` with **no timezone** — the camera's local
 * wall clock and nothing more. It is read as local time here, which is right
 * for two people whose photos are almost entirely taken in `Asia/Seoul` and is
 * the only available reading in any case: there is no offset to honour.
 */
function dateFrom(tags: Record<string, unknown>): string | null {
  const raw =
    tags.DateTimeOriginal ?? tags.DateTimeDigitized ?? tags.DateTime ?? null;
  if (typeof raw !== "string") return null;

  const match = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Coordinates, in degrees, or nulls.
 *
 * EXIF stores GPS as three rationals — degrees, minutes, seconds — plus a
 * hemisphere letter held separately. Forgetting the letter is how a photo taken
 * in Seoul is filed in the South Atlantic, so both halves are required here.
 */
function coordinatesFrom(tags: Record<string, unknown>): {
  latitude: number | null;
  longitude: number | null;
} {
  const latitude = degrees(tags.GPSLatitude, tags.GPSLatitudeRef, "S");
  const longitude = degrees(tags.GPSLongitude, tags.GPSLongitudeRef, "W");

  /* Both or neither, matching the check constraint on `photo`: a half-located
     photo cannot be drawn and would be a silent hole in the map. (0, 0) is
     dropped by the server, which is where Null Island is refused. */
  if (latitude === null || longitude === null) {
    return { latitude: null, longitude: null };
  }
  return { latitude, longitude };
}

function degrees(value: unknown, ref: unknown, negative: string): number | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const [d, m, s] = value.map(Number);
  if (![d, m, s].every(Number.isFinite)) return null;

  const decimal = d + m / 60 + s / 3600;
  if (!Number.isFinite(decimal)) return null;
  return typeof ref === "string" && ref.toUpperCase().startsWith(negative)
    ? -decimal
    : decimal;
}
