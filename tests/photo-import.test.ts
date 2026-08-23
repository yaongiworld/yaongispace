import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPerson, migrate } from "./db";
import { reset, twoPeople } from "./world";

/**
 * The import path, against a real Postgres (ticket 08).
 *
 * What is asserted here is the set of properties that are quiet when broken:
 * a duplicate that raises instead of settling, EXIF that lands in a column and
 * loses the blob, a Place that appeared without anybody naming it, a delete
 * that erased rather than tombstoned. Each of those looks fine in a happy-path
 * demo and is discovered years later with data already lost.
 *
 * The R2 fake is tested separately in `tests/photo-storage.test.ts` — nothing
 * in this file touches storage, because none of these properties are about it.
 */

let db: Client;
let towee: string;
let yangcho: string;

beforeAll(async () => {
  db = await migrate();
});

afterAll(async () => {
  await db?.end();
});

beforeEach(async () => {
  await reset(db);
  ({ towee, yangcho } = await twoPeople(db));
});

/** A 64-hex digest, distinct per label, so a test can say which one it meant. */
function digest(label: string): string {
  return label.repeat(64).slice(0, 64).replace(/[^0-9a-f]/g, "a");
}

// ---------------------------------------------------------------------------
// The duplicate no-op
// ---------------------------------------------------------------------------

describe("re-importing a photo we already hold", () => {
  test("is a silent no-op, not an error and not a second row", async () => {
    const sha = digest("d");

    await db.query(
      `INSERT INTO photo (storage_key, sha256, content_type, occurred_at, person_id)
       VALUES ('r2/originals/first.jpg', $1, 'image/jpeg', '2025-10-05T08:00:00+09:00', $2)`,
      [sha, towee],
    );

    // The second import, arriving by exactly the path the upload completion
    // takes: insert, and let the digest decide. `on conflict do nothing` is the
    // no-op — no exception for the app to swallow and no UI to show.
    const second = await db.query(
      `INSERT INTO photo (storage_key, sha256, content_type, occurred_at, person_id)
       VALUES ('r2/originals/second.jpg', $1, 'image/jpeg', '2025-10-05T08:00:00+09:00', $2)
       ON CONFLICT (sha256) DO NOTHING
       RETURNING id`,
      [sha, yangcho],
    );

    expect(second.rowCount).toBe(0);

    const { rows } = await db.query<{ n: string; storage_key: string }>(
      "SELECT count(*) AS n, min(storage_key) AS storage_key FROM photo",
    );
    expect(Number(rows[0].n)).toBe(1);
    // And the surviving row is the *first* one. A duplicate import must never
    // repoint an existing Photo at newly written bytes — that would be an
    // original changing underneath itself (ADR-0013) by another name.
    expect(rows[0].storage_key).toBe("r2/originals/first.jpg");
  });

  test("leaves exactly one Entry, so recall does not see the photo twice", async () => {
    const sha = digest("e");
    for (const key of ["r2/originals/a.jpg", "r2/originals/b.jpg"]) {
      await db.query(
        `INSERT INTO photo (storage_key, sha256, content_type, caption, occurred_at, person_id)
         VALUES ($1, $2, 'image/jpeg', '성산일출봉', now(), $3)
         ON CONFLICT (sha256) DO NOTHING`,
        [key, sha, towee],
      );
    }

    const { rows } = await db.query<{ n: string }>(
      "SELECT count(*) AS n FROM entry WHERE kind = 'photo'",
    );
    expect(Number(rows[0].n)).toBe(1);
  });

  test("a queue row may repeat a digest, so a re-share never raises at enqueue", async () => {
    // `photo.sha256` is unique; `import_upload.sha256` deliberately is not.
    // Sharing the same photo in two separate imports is an ordinary thing to
    // do, and it must settle quietly at completion rather than fail at accept.
    const sha = digest("f");
    for (let i = 0; i < 2; i++) {
      await db.query(
        `INSERT INTO import_upload (person_id, filename, content_type, sha256)
         VALUES ($1, 'IMG_0042.jpg', 'image/jpeg', $2)`,
        [towee, sha],
      );
    }

    const { rows } = await db.query<{ n: string }>(
      "SELECT count(*) AS n FROM import_upload WHERE sha256 = $1",
      [sha],
    );
    expect(Number(rows[0].n)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// EXIF
// ---------------------------------------------------------------------------

describe("EXIF", () => {
  test("lands in columns and keeps the whole blob", async () => {
    // The one-way door this guards: re-parsing originals out of R2 later to
    // recover a field nobody thought to extract. Columns are what we query;
    // the blob is what makes an unanticipated question answerable at all.
    const blob = {
      Make: "Google",
      Model: "Pixel 8",
      LensModel: "Pixel 8 back camera 6.9mm f/1.68",
      DateTimeOriginal: "2025:10:05 08:00:00",
      GPSLatitude: 33.4581,
      GPSLongitude: 126.9425,
      ExifImageWidth: 4080,
      ExifImageHeight: 3072,
      // Something nothing in the app reads today, which is exactly the point.
      SubSecTimeOriginal: "482",
    };

    const { rows: inserted } = await db.query<{ id: string }>(
      `INSERT INTO photo (storage_key, sha256, content_type, byte_size,
                          width, height, occurred_at, latitude, longitude, person_id, exif)
       VALUES ('r2/originals/exif.jpg', $1, 'image/jpeg', 3145728,
               4080, 3072, '2025-10-05T08:00:00+09:00', 33.4581, 126.9425, $2, $3)
       RETURNING id`,
      [digest("1"), towee, JSON.stringify(blob)],
    );

    const { rows } = await db.query<{
      width: number;
      height: number;
      latitude: number;
      longitude: number;
      occurred_at: Date;
      exif: Record<string, unknown>;
    }>(
      `SELECT width, height, latitude, longitude, occurred_at, exif
         FROM photo WHERE id = $1`,
      [inserted[0].id],
    );

    // The columns the app queries.
    expect(rows[0].width).toBe(4080);
    expect(rows[0].height).toBe(3072);
    expect(rows[0].latitude).toBeCloseTo(33.4581, 4);
    expect(rows[0].longitude).toBeCloseTo(126.9425, 4);
    expect(rows[0].occurred_at.toISOString()).toBe("2025-10-04T23:00:00.000Z");

    // And nothing was discarded on the way in.
    expect(rows[0].exif).toEqual(blob);
    expect(rows[0].exif.SubSecTimeOriginal).toBe("482");
  });

  test("a photo with no EXIF still lands, dated by its import", async () => {
    // A screenshot, or anything stripped by a messaging app. It must not be
    // rejected and it must not create a hole in the timeline, which is why
    // `occurred_at` falls back to the import time rather than being null.
    const { rows } = await db.query<{ occurred_at: Date; exif: unknown }>(
      `INSERT INTO photo (storage_key, sha256, content_type, occurred_at, person_id)
       VALUES ('r2/originals/screenshot.png', $1, 'image/png', now(), $2)
       RETURNING occurred_at, exif`,
      [digest("2"), towee],
    );

    expect(rows[0].occurred_at).toBeInstanceOf(Date);
    expect(rows[0].exif).toEqual({});
  });

  test("a correction never overwrites what the camera said", async () => {
    // ADR-0013 at the metadata level: the imported value survives a correction
    // so a wrong "correction" is recoverable.
    const { rows: inserted } = await db.query<{ id: string }>(
      `INSERT INTO photo (storage_key, sha256, content_type, occurred_at, person_id, exif)
       VALUES ('r2/originals/wrongdate.jpg', $1, 'image/jpeg',
               '2019-01-01T00:00:00Z', $2, '{"DateTimeOriginal":"2019:01:01 00:00:00"}')
       RETURNING id`,
      [digest("3"), towee],
    );

    await db.query(
      "UPDATE photo SET occurred_at_corrected = '2025-10-05T08:00:00+09:00' WHERE id = $1",
      [inserted[0].id],
    );

    const { rows } = await db.query<{
      imported: Date;
      effective: Date;
      exif: Record<string, string>;
    }>(
      `SELECT occurred_at AS imported, occurred_at_effective AS effective, exif
         FROM photo WHERE id = $1`,
      [inserted[0].id],
    );

    expect(rows[0].imported.getUTCFullYear()).toBe(2019);
    expect(rows[0].effective.getUTCFullYear()).toBe(2025);
    expect(rows[0].exif.DateTimeOriginal).toBe("2019:01:01 00:00:00");

    // And the Entry moved to the corrected day, which is what the timeline reads.
    const { rows: entry } = await db.query<{ occurred_at: Date }>(
      "SELECT occurred_at FROM entry WHERE kind = 'photo' AND source_id = $1",
      [inserted[0].id],
    );
    expect(entry[0].occurred_at.getUTCFullYear()).toBe(2025);
  });
});

// ---------------------------------------------------------------------------
// GPS proposes, never creates
// ---------------------------------------------------------------------------

describe("GPS", () => {
  async function photoWithCoordinates(): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO photo (storage_key, sha256, content_type, occurred_at,
                          latitude, longitude, person_id)
       VALUES ('r2/originals/gps.jpg', $1, 'image/jpeg', '2025-10-05T08:00:00+09:00',
               37.5665, 126.9780, $2)
       RETURNING id`,
      [digest("4"), towee],
    );
    return rows[0].id;
  }

  async function propose(photoId: string): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO place_proposal (photo_id, latitude, longitude, photo_occurred_at, person_id)
       SELECT id, latitude, longitude, occurred_at_effective, person_id
         FROM photo WHERE id = $1
       RETURNING id`,
      [photoId],
    );
    return rows[0].id;
  }

  test("proposes a Place rather than creating one", async () => {
    const photo = await photoWithCoordinates();
    await propose(photo);

    // The assertion that matters: importing a photo with coordinates put
    // nothing on the map. No Place named "37.5665, 126.9780".
    const { rows } = await db.query<{ n: string }>("SELECT count(*) AS n FROM place");
    expect(Number(rows[0].n)).toBe(0);

    const open = await db.query<{ n: string }>(
      "SELECT count(*) AS n FROM place_proposal WHERE resolved_at IS NULL",
    );
    expect(Number(open.rows[0].n)).toBe(1);
  });

  test("no Place is ever named after its coordinates", async () => {
    const photo = await photoWithCoordinates();
    await propose(photo);

    const { rows } = await db.query<{ name: string }>("SELECT name FROM place");
    for (const { name } of rows) {
      expect(name).not.toMatch(/^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/);
    }
  });

  test("a human accepting one names the Place, and the coordinates come from the photo", async () => {
    const photo = await photoWithCoordinates();
    const proposal = await propose(photo);

    const { rows: accepted } = await db.query<{ accept_place_proposal: string }>(
      "SELECT accept_place_proposal($1, NULL, $2)",
      [proposal, "광화문"],
    );
    const placeId = accepted[0].accept_place_proposal;

    const { rows } = await db.query<{
      name: string;
      latitude: number;
      longitude: number;
    }>("SELECT name, latitude, longitude FROM place WHERE id = $1", [placeId]);

    // The name is the human's; the coordinates are the camera's.
    expect(rows[0].name).toBe("광화문");
    expect(rows[0].latitude).toBeCloseTo(37.5665, 4);
    expect(rows[0].longitude).toBeCloseTo(126.978, 4);

    // The Photo now points at it, and so does its Entry.
    const { rows: linked } = await db.query<{ place_id: string }>(
      "SELECT place_id FROM photo WHERE id = $1",
      [photo],
    );
    expect(linked[0].place_id).toBe(placeId);

    const { rows: entry } = await db.query<{ place_id: string }>(
      "SELECT place_id FROM entry WHERE kind = 'photo' AND source_id = $1",
      [photo],
    );
    expect(entry[0].place_id).toBe(placeId);
  });

  test("accepting onto a Place we already have makes no second one", async () => {
    const { rows: existing } = await db.query<{ id: string }>(
      `INSERT INTO place (name, latitude, longitude, person_id)
       VALUES ('광화문', 37.5759, 126.9769, $1) RETURNING id`,
      [yangcho],
    );

    const photo = await photoWithCoordinates();
    const proposal = await propose(photo);

    const { rows } = await db.query<{ accept_place_proposal: string }>(
      "SELECT accept_place_proposal($1, $2, NULL)",
      [proposal, existing[0].id],
    );
    expect(rows[0].accept_place_proposal).toBe(existing[0].id);

    const { rows: count } = await db.query<{ n: string }>(
      "SELECT count(*) AS n FROM place",
    );
    expect(Number(count[0].n)).toBe(1);
  });

  test("accepting without either a Place or a name is refused", async () => {
    // The guard against an accidental accept producing a nameless pin — which
    // is precisely the "37.5665, 126.9780" failure arriving by a slip rather
    // than by design.
    const photo = await photoWithCoordinates();
    const proposal = await propose(photo);

    await expect(
      db.query("SELECT accept_place_proposal($1, NULL, NULL)", [proposal]),
    ).rejects.toThrow(/either a Place to attach to or a name/);

    const { rows } = await db.query<{ n: string }>("SELECT count(*) AS n FROM place");
    expect(Number(rows[0].n)).toBe(0);
  });

  test("dismissing one makes no Place and keeps the photo's coordinates", async () => {
    const photo = await photoWithCoordinates();
    const proposal = await propose(photo);

    await db.query("SELECT dismiss_place_proposal($1)", [proposal]);

    const { rows: places } = await db.query<{ n: string }>(
      "SELECT count(*) AS n FROM place",
    );
    expect(Number(places[0].n)).toBe(0);

    // The measurement was never in doubt — only whether it deserved a name.
    const { rows } = await db.query<{ latitude: number; place_id: string | null }>(
      "SELECT latitude, place_id FROM photo WHERE id = $1",
      [photo],
    );
    expect(rows[0].latitude).toBeCloseTo(37.5665, 4);
    expect(rows[0].place_id).toBeNull();

    // And it does not come back.
    const open = await db.query<{ n: string }>(
      "SELECT count(*) AS n FROM place_proposal WHERE resolved_at IS NULL",
    );
    expect(Number(open.rows[0].n)).toBe(0);
  });

  test("a proposal already answered cannot be answered again", async () => {
    const photo = await photoWithCoordinates();
    const proposal = await propose(photo);
    await db.query("SELECT accept_place_proposal($1, NULL, $2)", [proposal, "광화문"]);

    await expect(
      db.query("SELECT accept_place_proposal($1, NULL, $2)", [proposal, "경복궁"]),
    ).rejects.toThrow(/already been answered/);

    const { rows } = await db.query<{ n: string }>("SELECT count(*) AS n FROM place");
    expect(Number(rows[0].n)).toBe(1);
  });

  test("a proposal is not an Entry — unconfirmed coordinates never reach recall", async () => {
    const photo = await photoWithCoordinates();
    await propose(photo);

    const { rows } = await db.query<{ kind: string }>("SELECT DISTINCT kind FROM entry");
    expect(rows.map((r) => r.kind)).not.toContain("place_proposal");
    expect(rows.map((r) => r.kind)).not.toContain("place");
  });
});

// ---------------------------------------------------------------------------
// Tombstoning
// ---------------------------------------------------------------------------

describe("deleting a Photo", () => {
  test("tombstones rather than erasing, and the original key survives", async () => {
    const { rows: inserted } = await db.query<{ id: string }>(
      `INSERT INTO photo (storage_key, sha256, content_type, caption, occurred_at, person_id)
       VALUES ('r2/originals/keepsake.jpg', $1, 'image/jpeg', '성산일출봉 앞에서', now(), $2)
       RETURNING id`,
      [digest("5"), towee],
    );

    await db.query("UPDATE photo SET deleted_at = now() WHERE id = $1", [
      inserted[0].id,
    ]);

    // The row and its pointer at the bytes are untouched. The app cannot damage
    // a photo (ADR-0013), and a delete is the operation most likely to try.
    const { rows } = await db.query<{
      storage_key: string;
      sha256: string;
      deleted_at: Date;
    }>("SELECT storage_key, sha256, deleted_at FROM photo WHERE id = $1", [
      inserted[0].id,
    ]);
    expect(rows[0].storage_key).toBe("r2/originals/keepsake.jpg");
    expect(rows[0].sha256).toBe(digest("5"));
    expect(rows[0].deleted_at).toBeInstanceOf(Date);
  });

  test("drops it out of recall, and undeleting brings it back", async () => {
    const { rows: inserted } = await db.query<{ id: string }>(
      `INSERT INTO photo (storage_key, sha256, content_type, caption, occurred_at, person_id)
       VALUES ('r2/originals/undo.jpg', $1, 'image/jpeg', '흑돼지', now(), $2)
       RETURNING id`,
      [digest("6"), towee],
    );

    const count = async () => {
      const { rows } = await db.query<{ n: string }>(
        "SELECT count(*) AS n FROM entry WHERE kind = 'photo' AND source_id = $1",
        [inserted[0].id],
      );
      return Number(rows[0].n);
    };

    expect(await count()).toBe(1);

    await db.query("UPDATE photo SET deleted_at = now() WHERE id = $1", [
      inserted[0].id,
    ]);
    expect(await count()).toBe(0);

    // Every operation is additive, so the undo is a real undo.
    await db.query("UPDATE photo SET deleted_at = NULL WHERE id = $1", [
      inserted[0].id,
    ]);
    expect(await count()).toBe(1);
  });

  test("a tombstoned photo still holds its digest, so its bytes are not re-imported", async () => {
    // Otherwise deleting a photo would silently un-delete it on the next share
    // of the same file, which is a delete that does not stick.
    const sha = digest("7");
    await db.query(
      `INSERT INTO photo (storage_key, sha256, content_type, occurred_at, person_id, deleted_at)
       VALUES ('r2/originals/gone.jpg', $1, 'image/jpeg', now(), $2, now())`,
      [sha, towee],
    );

    const again = await db.query(
      `INSERT INTO photo (storage_key, sha256, content_type, occurred_at, person_id)
       VALUES ('r2/originals/again.jpg', $1, 'image/jpeg', now(), $2)
       ON CONFLICT (sha256) DO NOTHING RETURNING id`,
      [sha, towee],
    );
    expect(again.rowCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Entry emission
// ---------------------------------------------------------------------------

describe("a Photo's Entry", () => {
  test("is emitted on import, carrying the caption as its searchable text", async () => {
    const { rows: inserted } = await db.query<{ id: string }>(
      `INSERT INTO photo (storage_key, sha256, content_type, caption, occurred_at,
                          journey_id, person_id)
       VALUES ('r2/originals/jeju.jpg', $1, 'image/jpeg', '제주도에서 보낸 하루',
               '2025-10-05T08:00:00+09:00', NULL, $2)
       RETURNING id`,
      [digest("8"), towee],
    );

    const { rows } = await db.query<{
      kind: string;
      text: string;
      person_id: string;
      occurred_at: Date;
    }>(
      "SELECT kind, text, person_id, occurred_at FROM entry WHERE source_id = $1",
      [inserted[0].id],
    );

    expect(rows[0].kind).toBe("photo");
    expect(rows[0].text).toBe("제주도에서 보낸 하루");
    expect(rows[0].person_id).toBe(towee);
  });

  test("makes the caption findable in Korean, which tsvector could not do", async () => {
    // `to_tsvector` treats 제주도에서 as one token and never matches 제주 —
    // silently, and it looks fine in English testing (ADR-0003).
    await db.query(
      `INSERT INTO photo (storage_key, sha256, content_type, caption, occurred_at, person_id)
       VALUES ('r2/originals/search.jpg', $1, 'image/jpeg', '제주도에서 먹은 흑돼지', now(), $2)`,
      [digest("9"), towee],
    );

    const { rows } = await db.query<{ n: string }>(
      "SELECT count(*) AS n FROM entry WHERE kind = 'photo' AND text ILIKE '%제주%'",
    );
    expect(Number(rows[0].n)).toBe(1);
  });

  test("follows the caption when it is edited", async () => {
    const { rows: inserted } = await db.query<{ id: string }>(
      `INSERT INTO photo (storage_key, sha256, content_type, caption, occurred_at, person_id)
       VALUES ('r2/originals/caption.jpg', $1, 'image/jpeg', '무제', now(), $2)
       RETURNING id`,
      [digest("a"), towee],
    );

    await db.query("UPDATE photo SET caption = '성산일출봉 앞에서' WHERE id = $1", [
      inserted[0].id,
    ]);

    const { rows } = await db.query<{ text: string; embedding: unknown }>(
      "SELECT text, embedding FROM entry WHERE source_id = $1",
      [inserted[0].id],
    );
    expect(rows[0].text).toBe("성산일출봉 앞에서");
    // Text that changed is text that must be re-embedded.
    expect(rows[0].embedding).toBeNull();
  });

  test("a Rendition emits none of its own", async () => {
    // A thumbnail is not a separate thing that happened; indexing one would put
    // several copies of every photo in front of Recall.
    const { rows: inserted } = await db.query<{ id: string }>(
      `INSERT INTO photo (storage_key, sha256, content_type, occurred_at, person_id)
       VALUES ('r2/originals/rend.jpg', $1, 'image/jpeg', now(), $2) RETURNING id`,
      [digest("b"), towee],
    );

    await db.query(
      `INSERT INTO rendition (photo_id, kind, storage_key, content_type, width, height)
       VALUES ($1, 'thumb', 'r2/renditions/rend-thumb.webp', 'image/webp', 320, 240)`,
      [inserted[0].id],
    );

    const { rows } = await db.query<{ n: string }>("SELECT count(*) AS n FROM entry");
    expect(Number(rows[0].n)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The upload queue
// ---------------------------------------------------------------------------

describe("the upload queue", () => {
  test("survives the app being killed — the outstanding list is in the database", async () => {
    // The real case: 40 photos on mobile data after a trip. Whatever the
    // service worker loses when the app is killed, the list of what was
    // accepted is not part of it.
    for (let i = 0; i < 40; i++) {
      await db.query(
        `INSERT INTO import_upload (person_id, filename, content_type, byte_size)
         VALUES ($1, $2, 'image/jpeg', 3145728)`,
        [towee, `IMG_${String(i).padStart(4, "0")}.jpg`],
      );
    }

    // One got through before the phone gave up.
    await db.query(
      `WITH stored AS (
         INSERT INTO photo (storage_key, sha256, content_type, occurred_at, person_id)
         VALUES ('r2/originals/q0.jpg', $2, 'image/jpeg', now(), $1) RETURNING id
       )
       UPDATE import_upload SET state = 'stored', photo_id = stored.id
         FROM stored
        WHERE import_upload.id = (
          SELECT id FROM import_upload WHERE state = 'queued' ORDER BY created_at LIMIT 1
        )`,
      [towee, digest("c")],
    );

    // A fresh process, which knows nothing, asks what is left.
    const { rows } = await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM import_upload
        WHERE person_id = $1 AND state IN ('queued', 'uploading', 'failed')`,
      [towee],
    );
    expect(Number(rows[0].n)).toBe(39);
  });

  test("cannot claim to be stored without naming the Photo it stored", async () => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO import_upload (person_id, content_type) VALUES ($1, 'image/jpeg')
       RETURNING id`,
      [towee],
    );

    await expect(
      db.query("UPDATE import_upload SET state = 'stored' WHERE id = $1", [rows[0].id]),
    ).rejects.toThrow();
  });

  test("settles as a duplicate rather than failing when the digest is already held", async () => {
    const sha = digest("d");
    await db.query(
      `INSERT INTO photo (storage_key, sha256, content_type, occurred_at, person_id)
       VALUES ('r2/originals/held.jpg', $1, 'image/jpeg', now(), $2)`,
      [sha, towee],
    );

    const { rows: queued } = await db.query<{ id: string }>(
      `INSERT INTO import_upload (person_id, content_type, sha256)
       VALUES ($1, 'image/jpeg', $2) RETURNING id`,
      [towee, sha],
    );

    // What the completion step does when it finds the digest already held: a
    // terminal state with no Photo, no error, and nothing for the UI to say.
    await db.query("UPDATE import_upload SET state = 'duplicate' WHERE id = $1", [
      queued[0].id,
    ]);

    const { rows } = await db.query<{ state: string; error: string | null; photo_id: string | null }>(
      "SELECT state, error, photo_id FROM import_upload WHERE id = $1",
      [queued[0].id],
    );
    expect(rows[0].state).toBe("duplicate");
    expect(rows[0].error).toBeNull();
    expect(rows[0].photo_id).toBeNull();
  });

  test("emits no Entry — a file waiting to upload is an errand, not a memory", async () => {
    await db.query(
      `INSERT INTO import_upload (person_id, filename, content_type)
       VALUES ($1, 'IMG_0001.jpg', 'image/jpeg')`,
      [towee],
    );

    const { rows } = await db.query<{ n: string }>("SELECT count(*) AS n FROM entry");
    expect(Number(rows[0].n)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// RLS
// ---------------------------------------------------------------------------

describe("row level security", () => {
  // The owner bypasses every policy, so a wall tested only as the owner is a
  // wall nobody has ever walked into. Everything here runs as a Person.

  test("a signed-out request sees no photos and no proposals", async () => {
    await db.query(
      `INSERT INTO photo (storage_key, sha256, content_type, occurred_at, latitude, longitude, person_id)
       VALUES ('r2/originals/rls.jpg', $1, 'image/jpeg', now(), 37.5665, 126.9780, $2)`,
      [digest("1"), towee],
    );
    await db.query(
      `INSERT INTO place_proposal (photo_id, latitude, longitude, photo_occurred_at, person_id)
       SELECT id, latitude, longitude, occurred_at_effective, person_id FROM photo`,
    );

    await asPerson(db, null, async () => {
      for (const table of ["photo", "place_proposal", "import_upload"]) {
        const { rows } = await db.query<{ n: string }>(
          `SELECT count(*) AS n FROM ${table}`,
        );
        expect(Number(rows[0].n), `${table} leaked to a signed-out request`).toBe(0);
      }
    });
  });

  test("either of us can answer a GPS proposal about the other's photo", async () => {
    // Often the one who did not take the photo is the one who remembers where
    // it was. Proposals are shared for that reason.
    await db.query(
      `INSERT INTO photo (storage_key, sha256, content_type, occurred_at, latitude, longitude, person_id)
       VALUES ('r2/originals/shared.jpg', $1, 'image/jpeg', now(), 37.5665, 126.9780, $2)`,
      [digest("2"), towee],
    );
    const { rows: proposal } = await db.query<{ id: string }>(
      `INSERT INTO place_proposal (photo_id, latitude, longitude, photo_occurred_at, person_id)
       SELECT id, latitude, longitude, occurred_at_effective, person_id FROM photo
       RETURNING id`,
    );

    await asPerson(db, yangcho, async () => {
      const { rows } = await db.query<{ n: string }>(
        "SELECT count(*) AS n FROM place_proposal WHERE resolved_at IS NULL",
      );
      expect(Number(rows[0].n)).toBe(1);

      await db.query("SELECT accept_place_proposal($1, NULL, $2)", [
        proposal[0].id,
        "광화문",
      ]);

      const { rows: places } = await db.query<{ name: string }>("SELECT name FROM place");
      expect(places[0].name).toBe("광화문");
    });
  });

  test("a queue is readable by both of us but writable only by its owner", async () => {
    await asPerson(db, towee, async () => {
      await db.query(
        `INSERT INTO import_upload (person_id, content_type) VALUES ($1, 'image/jpeg')`,
        [towee],
      );
      // Enqueuing onto somebody else's queue would be enqueuing bytes they
      // never chose to a key they never picked.
      await expect(
        db.query(
          `INSERT INTO import_upload (person_id, content_type) VALUES ($1, 'image/jpeg')`,
          [yangcho],
        ),
      ).rejects.toThrow(/row-level security/);
    });

    // Seeing that the other person's import is still running is useful, and
    // harmless — it is a progress bar, not a secret.
    await db.query(
      `INSERT INTO import_upload (person_id, content_type) VALUES ($1, 'image/jpeg')`,
      [towee],
    );
    await asPerson(db, yangcho, async () => {
      const { rows } = await db.query<{ n: string }>(
        "SELECT count(*) AS n FROM import_upload",
      );
      expect(Number(rows[0].n)).toBe(1);
    });
  });

  test("a signed-in Person can import a photo and gets its Entry", async () => {
    await asPerson(db, towee, async () => {
      await db.query(
        `INSERT INTO photo (storage_key, sha256, content_type, caption, occurred_at, person_id)
         VALUES ('r2/originals/mine.jpg', $1, 'image/jpeg', '내 사진', now(), $2)`,
        [digest("3"), towee],
      );

      // `security definer` on the Entry trigger is what makes this work: the
      // signed-in role holds only SELECT on `entry`, and must.
      const { rows } = await db.query<{ n: string }>(
        "SELECT count(*) AS n FROM entry WHERE kind = 'photo'",
      );
      expect(Number(rows[0].n)).toBe(1);
    });
  });

  test("nobody can hand-write an Entry for a photo that does not exist", async () => {
    await asPerson(db, towee, async () => {
      await expect(
        db.query(
          `INSERT INTO entry (kind, source_id, text, occurred_at)
           VALUES ('photo', gen_random_uuid(), 'invented', now())`,
        ),
      ).rejects.toThrow(/permission denied/);
    });
  });
});
