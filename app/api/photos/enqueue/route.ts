import { NextResponse, type NextRequest } from "next/server";
import { asPerson } from "@/lib/as-person";
import { currentPersonId } from "@/lib/auth/current-person";
import { enqueue, type QueuedFile } from "@/lib/photos/import";

/**
 * The review grid has been through: these are the keepers.
 *
 * Takes **metadata only** — filenames, sizes, content types and digests. Not
 * one byte of any photo comes through here; the originals stay on the phone
 * until the service worker PUTs them straight to R2 (ADR-0012).
 *
 * Answers with the queue rows, whose ids are how the service worker refers to
 * each file from then on.
 */
export async function POST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json({ error: "signed out" }, { status: 401 });
  }

  let body: { files?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }

  const files = Array.isArray(body.files) ? body.files : null;
  if (!files) {
    return NextResponse.json({ error: "expected a files array" }, { status: 400 });
  }

  /* Deselecting everything is a legitimate outcome of the review grid — the
     whole point is that you may keep none of them — so an empty list is a
     success with nothing in it, not an error. */
  const parsed: QueuedFile[] = [];
  for (const file of files) {
    if (typeof file !== "object" || file === null) {
      return NextResponse.json({ error: "malformed file" }, { status: 400 });
    }
    const f = file as Record<string, unknown>;
    if (typeof f.contentType !== "string" || !f.contentType.startsWith("image/")) {
      return NextResponse.json(
        { error: "only images can be imported" },
        { status: 400 },
      );
    }
    if (f.sha256 !== undefined && f.sha256 !== null) {
      if (typeof f.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(f.sha256)) {
        return NextResponse.json({ error: "malformed sha256" }, { status: 400 });
      }
    }
    parsed.push({
      filename: typeof f.filename === "string" ? f.filename.slice(0, 255) : null,
      contentType: f.contentType,
      byteSize: typeof f.byteSize === "number" ? f.byteSize : null,
      sha256: typeof f.sha256 === "string" ? f.sha256 : null,
    });
  }

  const queued = await asPerson(personId, (client) =>
    enqueue(client, personId, parsed),
  );

  return NextResponse.json({ queued });
}
