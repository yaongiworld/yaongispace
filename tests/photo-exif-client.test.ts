import { describe, expect, test } from "vitest";
import sharp from "sharp";
import { readClientMetadata } from "../lib/photos/exif-client";

/**
 * The EXIF parser that runs on the phone (ticket 08).
 *
 * This is the riskiest code in the ticket: it walks a binary format by hand,
 * and every one of its failure modes is silent. A byte-order bug does not throw
 * — it yields plausible nonsense, and a photo taken in Seoul is filed in the
 * South Atlantic. So it is tested against real JPEGs with real EXIF written
 * into them, rather than against fixtures somebody typed out.
 *
 * `createImageBitmap` does not exist in node, so the dimension half comes back
 * null here and is covered by the server-side reader in `photo-pipeline`. What
 * is under test is the tag walking, which is the part that is hand-rolled.
 */

/**
 * A JPEG with EXIF actually written into it.
 *
 * sharp's `withExif` writes a real APP1 segment, so what the parser reads is a
 * genuine one — not a hand-assembled buffer that only proves the parser agrees
 * with the test's own idea of the format.
 */
async function jpegWithExif(exif: Record<string, Record<string, string>>): Promise<Blob> {
  const buffer = await sharp({
    create: { width: 60, height: 40, channels: 3, background: { r: 200, g: 160, b: 140 } },
  })
    .withExif(exif)
    .jpeg()
    .toBuffer();
  /* `new Uint8Array(buffer)` rather than the Buffer itself: node's Buffer is
     typed over ArrayBufferLike, which BlobPart does not accept. */
  return new Blob([new Uint8Array(buffer)], { type: "image/jpeg" });
}

describe("reading EXIF on the phone", () => {
  test("finds the capture time", async () => {
    const blob = await jpegWithExif({
      IFD0: { Make: "Google", Model: "Pixel 8" },
      IFD2: { DateTimeOriginal: "2025:10:05 08:00:00" },
    });

    const metadata = await readClientMetadata(blob);

    expect(metadata.occurredAt).not.toBeNull();
    const date = new Date(metadata.occurredAt!);
    expect(date.getFullYear()).toBe(2025);
    expect(date.getMonth()).toBe(9); // October
    expect(date.getDate()).toBe(5);
  });

  test("keeps tags it has names for", async () => {
    const blob = await jpegWithExif({
      IFD0: { Make: "Google", Model: "Pixel 8" },
    });

    const metadata = await readClientMetadata(blob);
    expect(metadata.exif.Make).toBe("Google");
    expect(metadata.exif.Model).toBe("Pixel 8");
  });

  test("keeps tags it has no name for, rather than discarding them", async () => {
    // The one-way door: a tag dropped here is one that can only be recovered by
    // re-parsing originals out of R2. Unrecognised tags are carried by number.
    const blob = await jpegWithExif({
      IFD0: { Make: "Google", ImageDescription: "무제", Software: "HDR+" },
    });

    const metadata = await readClientMetadata(blob);
    const keys = Object.keys(metadata.exif);
    // More than just the two tags this parser has names for in IFD0.
    expect(keys.length).toBeGreaterThan(1);
    expect(keys.some((k) => k.startsWith("Tag"))).toBe(true);
  });

  test("reads GPS as signed degrees, honouring the hemisphere", async () => {
    // Forgetting the hemisphere letter is how a photo taken in Seoul is filed
    // in the South Atlantic — a failure that never throws.
    const blob = await jpegWithExif({
      IFD0: { Make: "Google" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "37/1 33/1 5940/100",
        GPSLongitudeRef: "E",
        GPSLongitude: "126/1 58/1 4080/100",
      },
    });

    const metadata = await readClientMetadata(blob);
    expect(metadata.latitude).toBeCloseTo(37.5665, 2);
    expect(metadata.longitude).toBeCloseTo(126.978, 2);
  });

  test("a southern, western photo comes back negative", async () => {
    const blob = await jpegWithExif({
      IFD0: { Make: "Google" },
      IFD3: {
        GPSLatitudeRef: "S",
        GPSLatitude: "33/1 51/1 3540/100",
        GPSLongitudeRef: "W",
        GPSLongitude: "70/1 39/1 0/1",
      },
    });

    const metadata = await readClientMetadata(blob);
    expect(metadata.latitude).toBeLessThan(0);
    expect(metadata.longitude).toBeLessThan(0);
  });

  test("half a location is no location", async () => {
    // A half-located photo cannot be drawn and cannot be proposed, matching the
    // check constraint on `photo`.
    const blob = await jpegWithExif({
      IFD0: { Make: "Google" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "37/1 33/1 5940/100" },
    });

    const metadata = await readClientMetadata(blob);
    expect(metadata.latitude).toBeNull();
    expect(metadata.longitude).toBeNull();
  });

  test("a photo with no EXIF comes back empty rather than throwing", async () => {
    const buffer = await sharp({
      create: { width: 60, height: 40, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();

    const metadata = await readClientMetadata(
      new Blob([new Uint8Array(buffer)], { type: "image/jpeg" }),
    );
    expect(metadata.occurredAt).toBeNull();
    expect(metadata.latitude).toBeNull();
  });

  test("a file that is not a JPEG at all comes back empty rather than throwing", async () => {
    // A screenshot, a PNG, or something a messaging app mangled. Refusing it at
    // import would be the app deciding what is worth keeping.
    const metadata = await readClientMetadata(
      new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: "image/png" }),
    );
    expect(metadata.occurredAt).toBeNull();
    expect(metadata.exif).toEqual({});
  });

  test("a truncated file does not throw", async () => {
    // A share interrupted mid-copy. The parser must not take the review grid
    // down with it.
    const full = await jpegWithExif({ IFD0: { Make: "Google" } });
    const truncated = full.slice(0, 40);
    await expect(readClientMetadata(truncated)).resolves.toBeDefined();
  });
});
