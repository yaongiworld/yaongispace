import { NextResponse, type NextRequest } from "next/server";
import { asPerson } from "@/lib/as-person";
import { currentPersonId } from "@/lib/auth/current-person";
import { completeUpload } from "@/lib/photos/import";
import { photoStorage } from "@/lib/photos";

/**
 * The bytes are in R2. Write the Photo.
 *
 * Carries the metadata the phone read off the file — capture time, dimensions,
 * coordinates, and the full EXIF blob — because the phone is the only place the
 * original is open, and shipping 12MB to a server that must not receive it just
 * to read a date would defeat the upload design entirely.
 *
 * Those claims are **checked, not trusted**: `mergePhotoMetadata` refuses an
 * implausible date, a half-location and Null Island, and the server confirms
 * the object is actually in R2 before recording a Photo that points at it.
 *
 * Coordinates, if any, become a **proposal** — never a Place. A human names it
 * or nothing is named.
 */
export async function POST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json({ error: "signed out" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }

  if (typeof body.uploadId !== "string") {
    return NextResponse.json({ error: "expected an uploadId" }, { status: 400 });
  }
  if (typeof body.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(body.sha256)) {
    return NextResponse.json({ error: "expected a sha256" }, { status: 400 });
  }

  const uploadId = body.uploadId;
  const sha256 = body.sha256;

  try {
    const result = await asPerson(personId, async (client) => {
      const { rows } = await client.query<{ person_id: string }>(
        "SELECT person_id FROM import_upload WHERE id = $1",
        [uploadId],
      );
      if (rows.length === 0) return { outcome: "missing" as const };
      if (rows[0].person_id !== personId) return { outcome: "forbidden" as const };

      return completeUpload(client, photoStorage(), {
        uploadId,
        sha256,
        occurredAt: asDate(body.occurredAt),
        width: asPositiveInt(body.width),
        height: asPositiveInt(body.height),
        latitude: asCoordinate(body.latitude, 90),
        longitude: asCoordinate(body.longitude, 180),
        exif: isRecord(body.exif) ? body.exif : {},
        caption: typeof body.caption === "string" ? body.caption : null,
        journeyId: typeof body.journeyId === "string" ? body.journeyId : null,
      });
    });

    if (result.outcome === "missing") {
      return NextResponse.json({ error: "no such upload" }, { status: 404 });
    }
    if (result.outcome === "forbidden") {
      return NextResponse.json({ error: "not your upload" }, { status: 403 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("could not complete an upload", error);
    return NextResponse.json({ error: "could not store the photo" }, { status: 503 });
  }
}

function asDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asPositiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}

/**
 * A coordinate, or null.
 *
 * Bounded here as well as in the check constraint, so an out-of-range value is
 * a null rather than a 500 — the photo is still worth keeping, it just has no
 * location worth proposing.
 */
function asCoordinate(value: unknown, limit: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
