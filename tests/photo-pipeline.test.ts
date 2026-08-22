import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { Client } from "pg";
import sharp from "sharp";
import { migrate } from "./db";
import { reset, twoPeople } from "./world";
import { FakePhotoStorage } from "../lib/photos/fake";
import {
  completeUpload,
  enqueue,
  failUpload,
  grantUpload,
  outstandingUploads,
} from "../lib/photos/import";
import { readPhotoMetadata, mergePhotoMetadata } from "../lib/photos/exif";
import { makeRenditions } from "../lib/photos/renditions";
import { originalKey } from "../lib/photos/storage";

/**
 * The import path end to end: share sheet → review → queue → R2 → Photo.
 *
 * Real Postgres, fake R2 — the split the skeleton's seams call for. The
 * database half is the behaviour under test; the bucket is not, and faking it
 * is what lets this run with no credentials.
 *
 * The property these tests exist for is the one that is invisible when broken:
 * that **the bytes go phone → R2 directly**, so nothing here ever hands an
 * original to a server. The test plays the phone, redeeming its own ticket.
 */

let db: Client;
let towee: string;
let yangcho: string;
let storage: FakePhotoStorage;

beforeAll(async () => {
  db = await migrate();
});

afterAll(async () => {
  await db?.end();
});

beforeEach(async () => {
  await reset(db);
  ({ towee, yangcho } = await twoPeople(db));
  storage = new FakePhotoStorage();
});

/** A real JPEG, so sharp has something honest to read and resize. */
async function aPhoto(
  width = 1200,
  height = 900,
  tint = { r: 240, g: 180, b: 140 },
): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: tint },
  })
    .jpeg()
    .toBuffer();
  return new Uint8Array(buffer);
}

/**
 * A photo guaranteed distinct from every other.
 *
 * Flat-colour JPEGs a shade apart compress to *identical bytes* — the
 * difference is quantised away — so a fixture varying only the tint silently
 * produces duplicates, and the import path correctly refuses them. Varying the
 * dimensions is what actually makes two different files.
 */
async function aDistinctPhoto(n: number): Promise<Uint8Array> {
  return aPhoto(400 + n, 300);
}

function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Everything the phone does: enqueue, ask for a URL, PUT the bytes to R2
 * itself, then tell the server it is done.
 */
async function importOne(
  personId: string,
  bytes: Uint8Array,
  extra: {
    caption?: string;
    latitude?: number;
    longitude?: number;
    occurredAt?: Date;
    exif?: Record<string, unknown>;
  } = {},
) {
  const sha = sha256Of(bytes);
  const [queued] = await enqueue(db, personId, [
    { filename: "IMG_0042.jpg", contentType: "image/jpeg", byteSize: bytes.byteLength, sha256: sha },
  ]);

  const grant = await grantUpload(db, storage, queued.id, sha);
  if (grant.outcome === "duplicate") return { outcome: "duplicate" as const, sha };

  // The phone PUTs directly to R2. This is the step that never touches Vercel.
  await storage.uploadWithTicket(grant.ticket.url, bytes, "image/jpeg");

  const done = await completeUpload(db, storage, {
    uploadId: queued.id,
    sha256: sha,
    bytes,
    ...extra,
  });
  return { ...done, sha, uploadId: queued.id };
}

// ---------------------------------------------------------------------------

describe("importing a photo", () => {
  test("stores the original, makes renditions, and emits an Entry", async () => {
    const bytes = await aPhoto();
    const result = await importOne(towee, bytes, { caption: "성산일출봉 앞에서" });
    expect(result.outcome).toBe("stored");

    // The original is in the bucket, byte for byte as the phone sent it.
    const key = originalKey(result.sha, "image/jpeg");
    expect(await storage.exists(key)).toBe(true);
    expect(Buffer.from(storage.read(key)!)).toEqual(Buffer.from(bytes));

    // Renditions were made once, at import, beside it.
    const { rows: renditions } = await db.query<{ kind: string; storage_key: string }>(
      "SELECT kind, storage_key FROM rendition ORDER BY kind",
    );
    expect(renditions.map((r) => r.kind)).toEqual(["display", "thumb"]);
    for (const r of renditions) {
      expect(await storage.exists(r.storage_key)).toBe(true);
      expect(r.storage_key).not.toBe(key);
    }

    // And the caption is searchable.
    const { rows: entry } = await db.query<{ text: string }>(
      "SELECT text FROM entry WHERE kind = 'photo'",
    );
    expect(entry[0].text).toBe("성산일출봉 앞에서");
  });

  test("the original bytes are never rewritten by rendition-making", async () => {
    // ADR-0013's consequence stated plainly: the app cannot damage a photo.
    const bytes = await aPhoto();
    const result = await importOne(towee, bytes);
    const key = originalKey(result.sha, "image/jpeg");

    const after = storage.read(key)!;
    expect(sha256Of(after)).toBe(result.sha);
  });

  test("the queue row settles as stored and names its Photo", async () => {
    const bytes = await aPhoto();
    const result = await importOne(towee, bytes);

    const { rows } = await db.query<{ state: string; photo_id: string }>(
      "SELECT state, photo_id FROM import_upload",
    );
    expect(rows[0].state).toBe("stored");
    expect(rows[0].photo_id).toBe(
      result.outcome === "stored" ? result.photoId : undefined,
    );
  });
});

describe("re-importing one we already hold", () => {
  test("spends no bytes and shows no UI", async () => {
    const bytes = await aPhoto();
    await importOne(towee, bytes);

    const uploadsBefore = storage.keys().length;

    // Yangcho shares the same photo from her phone a week later.
    const second = await importOne(yangcho, bytes);
    expect(second.outcome).toBe("duplicate");

    // Nothing new was written, and the check happened *before* the upload —
    // which is the whole reason the client hashes on the phone.
    expect(storage.keys().length).toBe(uploadsBefore);

    const { rows } = await db.query<{ n: string }>("SELECT count(*) AS n FROM photo");
    expect(Number(rows[0].n)).toBe(1);

    // The queue row settles quietly: a terminal state, and no error to show.
    const { rows: queue } = await db.query<{ state: string; error: string | null }>(
      "SELECT state, error FROM import_upload ORDER BY created_at DESC LIMIT 1",
    );
    expect(queue[0].state).toBe("duplicate");
    expect(queue[0].error).toBeNull();
  });

  test("a tombstoned photo still counts as held, so a delete sticks", async () => {
    const bytes = await aPhoto();
    const first = await importOne(towee, bytes);
    await db.query("UPDATE photo SET deleted_at = now() WHERE sha256 = $1", [first.sha]);

    const second = await importOne(towee, bytes);
    expect(second.outcome).toBe("duplicate");
  });
});

describe("EXIF on the way in", () => {
  test("dimensions land in columns and the blob survives whole", async () => {
    const bytes = await aPhoto(1200, 900);
    const fromServer = await readPhotoMetadata(bytes);
    expect(fromServer.width).toBe(1200);
    expect(fromServer.height).toBe(900);

    const merged = mergePhotoMetadata(
      {
        occurredAt: new Date("2025-10-05T08:00:00+09:00"),
        latitude: 33.4581,
        longitude: 126.9425,
        exif: { Make: "Google", Model: "Pixel 8", SubSecTimeOriginal: "482" },
      },
      fromServer,
    );

    const result = await importOne(towee, bytes, {
      occurredAt: merged.occurredAt ?? undefined,
      latitude: merged.latitude ?? undefined,
      longitude: merged.longitude ?? undefined,
      exif: merged.exif,
    });
    expect(result.outcome).toBe("stored");

    const { rows } = await db.query<{
      width: number;
      latitude: number;
      occurred_at: Date;
      exif: Record<string, unknown>;
    }>("SELECT width, latitude, occurred_at, exif FROM photo");

    expect(rows[0].latitude).toBeCloseTo(33.4581, 4);
    expect(rows[0].occurred_at.getUTCFullYear()).toBe(2025);
    // Both the client's tags and the server's own reading of the bytes.
    expect(rows[0].exif.Model).toBe("Pixel 8");
    expect(rows[0].exif.SubSecTimeOriginal).toBe("482");
    expect(rows[0].exif.format).toBe("jpeg");
  });

  test("an implausible date from the phone is refused, not filed under year 3000", async () => {
    const fromServer = await readPhotoMetadata(await aPhoto());
    const merged = mergePhotoMetadata(
      { occurredAt: new Date("3000-01-01T00:00:00Z") },
      fromServer,
    );
    expect(merged.occurredAt).toBeNull();
  });

  test("Null Island is not a place anybody has been", async () => {
    // (0, 0) is what a phone reports with no fix. Proposing it would put a pin
    // in the Gulf of Guinea for every photo taken indoors.
    const fromServer = await readPhotoMetadata(await aPhoto());
    const merged = mergePhotoMetadata({ latitude: 0, longitude: 0 }, fromServer);
    expect(merged.latitude).toBeNull();
    expect(merged.longitude).toBeNull();
  });

  test("half a location is no location", async () => {
    const fromServer = await readPhotoMetadata(await aPhoto());
    const merged = mergePhotoMetadata({ latitude: 33.4581 }, fromServer);
    expect(merged.latitude).toBeNull();
    expect(merged.longitude).toBeNull();
  });



  test("sharing the same photo twice before the first lands is a no-op, not a 503", async () => {
    // The storage key is the digest, so two queue rows for one file would ask
    // for the same key and collide on import_upload_storage_key_key. That
    // surfaced to the phone as an opaque "storage unavailable" 503 — for
    // something that is meant to be a silent no-op.
    //
    // Found by running the real import flow twice against a live S3 server;
    // the fake never produced a second queue row for the same bytes.
    const bytes = await aPhoto(300, 200);
    const sha = sha256Of(bytes);

    const [first, second] = await enqueue(db, towee, [
      { filename: "제주.jpg", contentType: "image/jpeg", byteSize: bytes.byteLength, sha256: sha },
      { filename: "제주-again.jpg", contentType: "image/jpeg", byteSize: bytes.byteLength, sha256: sha },
    ]);

    const granted = await grantUpload(db, storage, first.id, sha);
    expect(granted.outcome).toBe("upload");

    // The second asks while the first is still uploading — nothing has been
    // stored yet, so the `photo` check above cannot catch it.
    const again = await grantUpload(db, storage, second.id, sha);
    expect(again.outcome).toBe("duplicate");

    const { rows } = await db.query<{ state: string }>(
      "SELECT state FROM import_upload WHERE id = $1",
      [second.id],
    );
    expect(rows[0].state).toBe("duplicate");
  });

  test("the complete route puts the phone's claims through the guard", () => {
    // The tests above prove `mergePhotoMetadata` refuses Null Island and a
    // year-3000 date. They do not prove anything *calls* it — and for a while
    // nothing did: the route's own comment described the check while passing
    // raw client values straight through, so (0, 0) became a place_proposal
    // and any parseable date became the primary time axis.
    //
    // A source-level assertion because the route is a Next handler that wants
    // a running server to exercise; what is worth pinning is the wiring, which
    // is exactly the part that was missing.
    const route = readFileSync(
      join(import.meta.dirname, "..", "app/api/photos/complete/route.ts"),
      "utf8",
    );
    expect(route).toContain("mergePhotoMetadata");
    // And that its result is what reaches the database, not the raw body.
    expect(route).toContain("occurredAt: claimed.occurredAt");
    expect(route).toContain("latitude: claimed.latitude");
    // The raw readers still appear — as arguments *into* the guard, which is
    // where they belong. What must not reappear is a call that hands
    // `completeUpload` the unfiltered values directly.
    expect(route).not.toMatch(/completeUpload\([\s\S]{0,400}asDate\(body\./);
  });

  test("a file sharp cannot read is still imported, dated by its import", async () => {
    // A photo somebody chose to keep is a photo we keep. Refusing it would be
    // the app deciding what is worth keeping.
    const nonsense = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const metadata = await readPhotoMetadata(nonsense);
    expect(metadata.width).toBeNull();
    expect(metadata.exif).toEqual({});

    const result = await importOne(towee, nonsense);
    expect(result.outcome).toBe("stored");

    const { rows } = await db.query<{ occurred_at: Date }>(
      "SELECT occurred_at FROM photo",
    );
    expect(rows[0].occurred_at).toBeInstanceOf(Date);
  });
});

describe("GPS on the way in", () => {
  test("proposes a Place and creates none", async () => {
    const result = await importOne(towee, await aPhoto(), {
      latitude: 37.5665,
      longitude: 126.978,
    });
    expect(result.outcome).toBe("stored");
    if (result.outcome !== "stored") return;

    expect(result.proposalId).not.toBeNull();

    // Nothing landed on the map. No Place named "37.5665, 126.9780".
    const { rows } = await db.query<{ n: string }>("SELECT count(*) AS n FROM place");
    expect(Number(rows[0].n)).toBe(0);
  });

  test("a photo without coordinates proposes nothing", async () => {
    const result = await importOne(towee, await aPhoto());
    if (result.outcome !== "stored") throw new Error("expected a stored photo");
    expect(result.proposalId).toBeNull();

    const { rows } = await db.query<{ n: string }>(
      "SELECT count(*) AS n FROM place_proposal",
    );
    expect(Number(rows[0].n)).toBe(0);
  });

  test("a human answering the proposal is what finally makes the Place", async () => {
    const result = await importOne(towee, await aPhoto(), {
      latitude: 37.5665,
      longitude: 126.978,
    });
    if (result.outcome !== "stored") throw new Error("expected a stored photo");

    await db.query("SELECT accept_place_proposal($1, NULL, $2)", [
      result.proposalId,
      "광화문",
    ]);

    const { rows } = await db.query<{ name: string }>("SELECT name FROM place");
    expect(rows[0].name).toBe("광화문");
  });
});

describe("renditions", () => {
  test("are made from the original and never upscale it", async () => {
    // A 200px keepsake blown up to 1600 is a bigger file carrying no more
    // picture, and it looks worse than leaving it alone.
    const small = await aPhoto(200, 150);
    const made = await makeRenditions(storage, sha256Of(small), small);

    for (const rendition of made) {
      expect(rendition.width).toBeLessThanOrEqual(200);
      expect(rendition.height).toBeLessThanOrEqual(150);
    }
  });

  test("fit inside their long edge and keep their aspect ratio", async () => {
    const bytes = await aPhoto(2400, 1200);
    const made = await makeRenditions(storage, sha256Of(bytes), bytes);

    const thumb = made.find((r) => r.kind === "thumb")!;
    expect(thumb.width).toBe(480);
    expect(thumb.height).toBe(240);

    const display = made.find((r) => r.kind === "display")!;
    expect(display.width).toBe(1600);
  });

  test("a failure to make one is not a failure to import", async () => {
    // The original is already safe in R2 by then, and a rendition is
    // rebuildable by definition — so a missing thumbnail must never cost a photo.
    const nonsense = new Uint8Array([1, 2, 3, 4]);
    const made = await makeRenditions(storage, sha256Of(nonsense), nonsense);
    expect(made).toEqual([]);

    const result = await importOne(towee, nonsense);
    expect(result.outcome).toBe("stored");
  });
});

describe("the background queue", () => {
  test("40 photos survive the app being killed mid-import", async () => {
    // The real case the ticket names: after a trip, on mobile data.
    const files = Array.from({ length: 40 }, (_, i) => ({
      filename: `IMG_${String(i).padStart(4, "0")}.jpg`,
      contentType: "image/jpeg",
      byteSize: 3_145_728,
    }));
    const queued = await enqueue(db, towee, files);
    expect(queued).toHaveLength(40);

    // Two get through, one fails, then the phone is locked and the app killed.
    for (const index of [0, 1]) {
      const bytes = await aDistinctPhoto(index);
      const sha = sha256Of(bytes);
      const grant = await grantUpload(db, storage, queued[index].id, sha);
      if (grant.outcome !== "upload") throw new Error("expected a ticket");
      await storage.uploadWithTicket(grant.ticket.url, bytes, "image/jpeg");
      await completeUpload(db, storage, { uploadId: queued[index].id, sha256: sha, bytes });
    }
    await failUpload(db, queued[2].id, "network dropped");

    // A fresh process, which knows nothing, asks what is left.
    const remaining = await outstandingUploads(db, towee);
    expect(remaining).toHaveLength(38);
    // Including the failed one — a failure that vanishes is a photo lost.
    expect(remaining.map((r) => r.id)).toContain(queued[2].id);

    const { rows } = await db.query<{ n: string }>("SELECT count(*) AS n FROM photo");
    expect(Number(rows[0].n)).toBe(2);
  });

  test("a retry of an already-stored upload does not make a second Photo", async () => {
    const bytes = await aPhoto();
    const first = await importOne(towee, bytes);
    if (first.outcome !== "stored") throw new Error("expected a stored photo");

    // The service worker did not hear the acknowledgement and tries again.
    // A retry is idempotent: it reports the same Photo rather than inventing a
    // second one *or* demoting its own queue row to 'duplicate'.
    const again = await completeUpload(db, storage, {
      uploadId: first.uploadId,
      sha256: first.sha,
      bytes,
    });
    expect(again.outcome).toBe("stored");
    if (again.outcome === "stored") expect(again.photoId).toBe(first.photoId);

    const { rows } = await db.query<{ n: string }>("SELECT count(*) AS n FROM photo");
    expect(Number(rows[0].n)).toBe(1);

    // And the queue row still names the photo it produced.
    const { rows: queue } = await db.query<{ state: string; photo_id: string }>(
      "SELECT state, photo_id FROM import_upload WHERE id = $1",
      [first.uploadId],
    );
    expect(queue[0].state).toBe("stored");
    expect(queue[0].photo_id).toBe(first.photoId);
  });

  test("completing without the bytes in R2 fails loudly and stores no Photo", async () => {
    // A Photo pointing at an object that was never written is the one state
    // that would make the library quietly lie about what it holds.
    const bytes = await aPhoto();
    const sha = sha256Of(bytes);
    const [queued] = await enqueue(db, towee, [
      { filename: "IMG_1.jpg", contentType: "image/jpeg", sha256: sha },
    ]);
    await grantUpload(db, storage, queued.id, sha);
    // The PUT never happened.

    await expect(
      completeUpload(db, storage, { uploadId: queued.id, sha256: sha, bytes }),
    ).rejects.toThrow(/not in R2/);

    const { rows } = await db.query<{ n: string }>("SELECT count(*) AS n FROM photo");
    expect(Number(rows[0].n)).toBe(0);

    const { rows: queue } = await db.query<{ state: string }>(
      "SELECT state FROM import_upload",
    );
    expect(queue[0].state).toBe("failed");
  });

  test("nothing is enqueued for an empty selection — deselecting everything is allowed", async () => {
    // The review grid's whole point is that you may keep none of them.
    expect(await enqueue(db, towee, [])).toEqual([]);
    const { rows } = await db.query<{ n: string }>(
      "SELECT count(*) AS n FROM import_upload",
    );
    expect(Number(rows[0].n)).toBe(0);
  });
});

describe("serving", () => {
  test("is by a signed URL that expires", async () => {
    const bytes = await aPhoto();
    const result = await importOne(towee, bytes);
    const key = originalKey(result.sha, "image/jpeg");

    const signed = await storage.signedRead({ key });
    expect(signed.url).toContain(encodeURIComponent(key));
    expect(signed.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
