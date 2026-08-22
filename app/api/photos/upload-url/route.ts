import { NextResponse, type NextRequest } from "next/server";
import { asPerson } from "@/lib/photos/as-person";
import { currentPersonId } from "@/lib/photos/session";
import { grantUpload } from "@/lib/photos/import";
import { photoStorage } from "@/lib/photos";

/**
 * Somewhere to put one photo — or the news that we already have it.
 *
 * Hands back a presigned URL the client PUTs the original to **directly**. That
 * is the entire reason this endpoint returns a URL instead of accepting a file:
 * bytes never transit Vercel (ADR-0012).
 *
 * `{ outcome: "duplicate" }` is the silent no-op. The digest was already held,
 * so no ticket is issued and no bytes are spent — and the client shows nothing.
 * Re-importing a photo we have is not an error and not a message.
 */
export async function POST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json({ error: "signed out" }, { status: 401 });
  }

  let body: { uploadId?: unknown; sha256?: unknown };
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

  const { uploadId, sha256 } = body;

  try {
    const grant = await asPerson(personId, async (client) => {
      /* RLS lets both of us *read* a queue row but only its owner update one,
         so a request for somebody else's upload fails on the write rather than
         quietly succeeding. Checked here as well so the answer is a clean 403
         instead of a policy error. */
      const { rows } = await client.query<{ person_id: string }>(
        "SELECT person_id FROM import_upload WHERE id = $1",
        [uploadId],
      );
      if (rows.length === 0) return { outcome: "missing" as const };
      if (rows[0].person_id !== personId) return { outcome: "forbidden" as const };

      return grantUpload(client, photoStorage(), uploadId, sha256);
    });

    if (grant.outcome === "missing") {
      return NextResponse.json({ error: "no such upload" }, { status: 404 });
    }
    if (grant.outcome === "forbidden") {
      return NextResponse.json({ error: "not your upload" }, { status: 403 });
    }

    return NextResponse.json(grant);
  } catch (error) {
    /* R2 being unconfigured or unreachable is a photos problem, and the queue
       is built to retry — so this is a 503 the client comes back from, not a
       failure it should give up on. */
    console.error("could not grant an upload", error);
    return NextResponse.json({ error: "storage unavailable" }, { status: 503 });
  }
}
