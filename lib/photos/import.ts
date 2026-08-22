import type { Pool, PoolClient } from "pg";
import { makeRenditions } from "./renditions";
import {
  originalKey,
  UPLOAD_URL_TTL_SECONDS,
  type PhotoStorage,
  type UploadTicket,
} from "./storage";

/**
 * The import path, from a share sheet to a Photo.
 *
 * Three steps, and the split between them is the whole design:
 *
 *   1. **`enqueue`** — the review grid has been through, these are the keepers.
 *      Writes queue rows and nothing else. Fast, so the share sheet closes at
 *      once, and durable, so killing the app loses progress and not the list.
 *
 *   2. **`grantUpload`** — hand out a presigned URL. The client PUTs the
 *      original **directly to R2**; the bytes never come near our servers
 *      (ADR-0012). This step is where a digest we already hold becomes a silent
 *      no-op: no ticket, no upload, no UI.
 *
 *   3. **`completeUpload`** — the bytes are in R2. Write the Photo, make the
 *      renditions, and propose a Place if there were coordinates.
 *
 * Steps 2 and 3 are what the service worker retries. Both are safe to run
 * again: the key is the digest, so a repeated upload overwrites itself with
 * identical bytes, and the Photo insert conflicts on `sha256` and does nothing.
 */

export interface QueuedFile {
  filename?: string | null;
  contentType: string;
  byteSize?: number | null;
  /** Hashed on the phone, before any bytes are spent. */
  sha256?: string | null;
}

export interface QueuedUpload {
  id: string;
  filename: string | null;
  contentType: string;
  byteSize: number | null;
  sha256: string | null;
  state: string;
}

/** A database handle. A pool or a client both work; nothing here holds state. */
type Db = Pick<Pool | PoolClient, "query">;

/**
 * Accept the files the review grid kept.
 *
 * Deliberately does not touch storage. The point of the queue is that the
 * decision — *these ones* — is recorded the instant it is made, before anything
 * slow or failable happens. An import interrupted by a dead battery on the
 * station platform resumes from here.
 */
export async function enqueue(
  db: Db,
  personId: string,
  files: readonly QueuedFile[],
): Promise<QueuedUpload[]> {
  if (files.length === 0) return [];

  const queued: QueuedUpload[] = [];
  for (const file of files) {
    const { rows } = await db.query<QueuedUpload>(
      `INSERT INTO import_upload (person_id, filename, content_type, byte_size, sha256)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, filename, content_type AS "contentType", byte_size AS "byteSize",
                 sha256, state`,
      [
        personId,
        file.filename ?? null,
        file.contentType,
        file.byteSize ?? null,
        file.sha256 ?? null,
      ],
    );
    queued.push(rows[0]);
  }
  return queued;
}

export type UploadGrant =
  | { outcome: "upload"; ticket: UploadTicket }
  /** Already held. The queue row settles and the person is told nothing. */
  | { outcome: "duplicate" };

/**
 * Hand out a URL for one queued file, or discover we already have it.
 *
 * **The duplicate check happens here, before the bytes are spent.** That is the
 * whole reason the client hashes on the phone: re-sharing a photo we already
 * hold should cost nothing — not a wasted upload settled afterwards, and
 * certainly not a message. Re-importing is a silent no-op with no UI.
 */
export async function grantUpload(
  db: Db,
  storage: PhotoStorage,
  uploadId: string,
  sha256: string,
): Promise<UploadGrant> {
  const { rows } = await db.query<{ content_type: string; byte_size: string | null }>(
    "SELECT content_type, byte_size FROM import_upload WHERE id = $1",
    [uploadId],
  );
  if (rows.length === 0) throw new Error("no such queued upload");

  /* Tombstoned photos count as held: otherwise deleting a photo would silently
     un-delete it the next time the same file was shared, which is a delete that
     does not stick. */
  const held = await db.query(
    "SELECT 1 FROM photo WHERE sha256 = $1",
    [sha256],
  );
  if (held.rowCount && held.rowCount > 0) {
    await db.query(
      "UPDATE import_upload SET state = 'duplicate', sha256 = $2, updated_at = now() WHERE id = $1",
      [uploadId, sha256],
    );
    return { outcome: "duplicate" };
  }

  /* Already on its way up, from an earlier share of the same file. The key is
     the digest, so a second grant would hand out the identical storage key and
     collide on `import_upload_storage_key_key` — which surfaces to the phone as
     an opaque 503 rather than the silent no-op a re-import is supposed to be.
     Sharing the same photo twice before the first upload finishes is ordinary,
     not an error: the queue already holds it. */
  const inFlight = await db.query(
    `SELECT 1 FROM import_upload
      WHERE sha256 = $1 AND id <> $2 AND state IN ('uploading', 'stored')`,
    [sha256, uploadId],
  );
  if (inFlight.rowCount && inFlight.rowCount > 0) {
    await db.query(
      "UPDATE import_upload SET state = 'duplicate', sha256 = $2, updated_at = now() WHERE id = $1",
      [uploadId, sha256],
    );
    return { outcome: "duplicate" };
  }

  const key = originalKey(sha256, rows[0].content_type);
  const ticket = await storage.signedUpload({
    key,
    contentType: rows[0].content_type,
    byteSize: rows[0].byte_size ? Number(rows[0].byte_size) : undefined,
    expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
  });

  await db.query(
    `UPDATE import_upload
        SET state = 'uploading', sha256 = $2, storage_key = $3,
            attempts = attempts + 1, updated_at = now()
      WHERE id = $1`,
    [uploadId, sha256, key],
  );

  return { outcome: "upload", ticket };
}

export interface CompletionInput {
  uploadId: string;
  sha256: string;
  occurredAt?: Date | null;
  width?: number | null;
  height?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  exif?: Record<string, unknown>;
  caption?: string | null;
  journeyId?: string | null;
  /**
   * The original's bytes, for making renditions **only**.
   *
   * Optional, and the shape of that optionality matters: in production the
   * server fetches them back out of R2 (where the phone has already put them)
   * rather than receiving them from the client, so no original ever transits
   * Vercel on the way *in*. Passing them here is what a Takeout backfill — a
   * local script, out of this ticket's scope — would do, since it holds the
   * files already.
   */
  bytes?: Uint8Array;
}

export type Completion =
  | { outcome: "stored"; photoId: string; proposalId: string | null }
  | { outcome: "duplicate" };

/**
 * The bytes are in R2. Write the Photo.
 *
 * Confirms the object is actually there before recording a Photo that points at
 * it — the ordering that keeps the library from containing rows whose bytes
 * were never written.
 */
export async function completeUpload(
  db: Db,
  storage: PhotoStorage,
  input: CompletionInput,
): Promise<Completion> {
  const { rows: queue } = await db.query<{
    person_id: string;
    storage_key: string | null;
    content_type: string;
    byte_size: string | null;
  }>(
    "SELECT person_id, storage_key, content_type, byte_size FROM import_upload WHERE id = $1",
    [input.uploadId],
  );
  if (queue.length === 0) throw new Error("no such queued upload");

  const key = queue[0].storage_key ?? originalKey(input.sha256, queue[0].content_type);

  if (!(await storage.exists(key))) {
    await db.query(
      `UPDATE import_upload SET state = 'failed', error = $2, updated_at = now()
        WHERE id = $1`,
      [input.uploadId, "the bytes are not in R2"],
    );
    throw new Error(`the bytes for ${key} are not in R2`);
  }

  /* `on conflict do nothing` is the duplicate no-op. It catches the race two
     phones importing the same photo at the same moment would otherwise win
     together — the digest is the only thing that can actually arbitrate that. */
  const { rows: photo } = await db.query<{ id: string }>(
    `INSERT INTO photo (storage_key, sha256, content_type, byte_size, width, height,
                        caption, occurred_at, latitude, longitude, journey_id,
                        person_id, exif)
     VALUES ($1, $2, $3, $4, $5, $6, $7, coalesce($8, now()), $9, $10, $11, $12, $13)
     ON CONFLICT (sha256) DO NOTHING
     RETURNING id`,
    [
      key,
      input.sha256,
      queue[0].content_type,
      queue[0].byte_size ? Number(queue[0].byte_size) : null,
      input.width ?? null,
      input.height ?? null,
      input.caption ?? null,
      input.occurredAt ?? null,
      input.latitude ?? null,
      input.longitude ?? null,
      input.journeyId ?? null,
      queue[0].person_id,
      JSON.stringify(input.exif ?? {}),
    ],
  );

  if (photo.length === 0) {
    /* The digest is already held. Two ways to arrive here, and they are not the
       same event:

         - a genuine duplicate, which settles quietly as one; or
         - *this upload's own* retry, whose acknowledgement was lost. That row
           is already 'stored' and pointing at its Photo, and demoting it would
           throw away the link between a queue entry and the photo it produced.

       So a row that already succeeded is left exactly as it is. */
    const { rows: settled } = await db.query<{ id: string; state: string }>(
      `UPDATE import_upload SET state = 'duplicate', updated_at = now()
        WHERE id = $1 AND state <> 'stored'
        RETURNING id, state`,
      [input.uploadId],
    );
    if (settled.length === 0) {
      /* Already stored: report the Photo it made rather than a duplicate, so a
         retry is idempotent rather than merely harmless. */
      const { rows: existing } = await db.query<{ photo_id: string }>(
        "SELECT photo_id FROM import_upload WHERE id = $1",
        [input.uploadId],
      );
      if (existing[0]?.photo_id) {
        return { outcome: "stored", photoId: existing[0].photo_id, proposalId: null };
      }
    }
    return { outcome: "duplicate" };
  }

  const photoId = photo[0].id;

  await db.query(
    `UPDATE import_upload SET state = 'stored', photo_id = $2, storage_key = $3,
            error = NULL, updated_at = now()
      WHERE id = $1`,
    [input.uploadId, photoId, key],
  );

  /* GPS proposes, never creates. Coordinates become a question for a human, not
     a pin named after decimals. */
  let proposalId: string | null = null;
  if (input.latitude != null && input.longitude != null) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO place_proposal (photo_id, latitude, longitude, photo_occurred_at, person_id)
       SELECT id, latitude, longitude, occurred_at_effective, person_id
         FROM photo WHERE id = $1
       ON CONFLICT (photo_id) DO NOTHING
       RETURNING id`,
      [photoId],
    );
    proposalId = rows[0]?.id ?? null;
  }

  /* Renditions, once, from the original. Never fatal: the original is already
     safe in R2 and a rendition is rebuildable by definition. */
  const bytes = input.bytes ?? (await fetchOriginal(storage, key));
  if (bytes) {
    const made = await makeRenditions(storage, input.sha256, bytes);
    for (const rendition of made) {
      await db.query(
        `INSERT INTO rendition (photo_id, kind, storage_key, content_type,
                                width, height, byte_size)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (photo_id, kind) DO NOTHING`,
        [
          photoId,
          rendition.kind,
          rendition.key,
          rendition.contentType,
          rendition.width,
          rendition.height,
          rendition.byteSize,
        ],
      );
    }
  }

  return { outcome: "stored", photoId, proposalId };
}

/**
 * Read an original back out of R2 to make renditions from.
 *
 * This is the one place the server holds an original's bytes, and it pulls the
 * whole file into the function's memory so `sharp` can resize it.
 *
 * Be honest about what that costs against ADR-0012. The rule is that bytes
 * never transit Vercel; this reads them *out* of R2 after they are safely
 * stored, so the upload path — the one that matters for a 40-photo import on
 * mobile data — is genuinely direct and never touches us. But "never transits
 * Vercel" is not true without qualification, and the qualification is the
 * author's, not the ticket's. The rendition path does transit, once, per
 * photo, on the way back out.
 *
 * The alternative is renditions made on the phone before upload, which trades
 * a server round-trip for battery and a much wider surface of device quirks.
 * Worth revisiting if the memory ceiling ever bites on a large original.
 *
 * Returns null on any failure. Renditions are derived; not having them yet is a
 * missing thumbnail, not a lost photo.
 */
async function fetchOriginal(
  storage: PhotoStorage,
  key: string,
): Promise<Uint8Array | null> {
  try {
    const { url } = await storage.signedRead({ key, expiresInSeconds: 300, internal: true });
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`no renditions for ${key}: storage answered ${response.status}`);
      return null;
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    /* Still not fatal — the original is safe and renditions are rebuildable —
       but it must not be *silent*. A swallowed failure here is a library that
       quietly has no thumbnails, discovered months later. */
    console.warn(`no renditions for ${key}:`, error);
    return null;
  }
}

/** What the resumed queue asks for after the app was killed. */
export async function outstandingUploads(
  db: Db,
  personId: string,
): Promise<QueuedUpload[]> {
  const { rows } = await db.query<QueuedUpload>(
    `SELECT id, filename, content_type AS "contentType", byte_size AS "byteSize",
            sha256, state
       FROM import_upload
      WHERE person_id = $1 AND state IN ('queued', 'uploading', 'failed')
      ORDER BY created_at`,
    [personId],
  );
  return rows;
}

/** Record that an attempt failed, so the queue can show it and retry it. */
export async function failUpload(
  db: Db,
  uploadId: string,
  reason: string,
): Promise<void> {
  await db.query(
    `UPDATE import_upload SET state = 'failed', error = $2, updated_at = now()
      WHERE id = $1 AND state <> 'stored'`,
    [uploadId, reason],
  );
}
