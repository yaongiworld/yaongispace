import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPerson, migrate } from "./db";
import { reset, twoPeople } from "./world";

/**
 * Browsing the curated library (ticket 08).
 *
 * The queries in `lib/photos/browse.ts` and `lib/photos/proposals.ts` are
 * tested here as SQL, against a real Postgres and **through `asPerson`**, which
 * is what makes the RLS they run under real rather than assumed. The functions
 * themselves wrap these same statements in a pool connection, which is
 * plumbing; the ordering, the exclusions and the policies are the behaviour.
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

function digest(n: number): string {
  return n.toString(16).padStart(64, "0");
}

/** The browse query, exactly as `browse()` issues it. */
const BROWSE_SQL = `
  SELECT p.id, p.caption, p.occurred_at_effective,
         (SELECT r.storage_key FROM rendition r
           WHERE r.photo_id = p.id AND r.kind = 'thumb') AS thumb_key,
         p.storage_key
    FROM photo p
   WHERE p.deleted_at IS NULL
     AND ($1::timestamptz IS NULL OR p.occurred_at_effective < $1)
   ORDER BY p.occurred_at_effective DESC, p.id DESC
   LIMIT $2`;

async function addPhoto(
  n: number,
  occurredAt: string,
  extra: { caption?: string; deleted?: boolean; corrected?: string } = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO photo (storage_key, sha256, content_type, caption, occurred_at,
                        occurred_at_corrected, person_id, deleted_at)
     VALUES ($1, $2, 'image/jpeg', $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      `originals/aa/${digest(n)}.jpg`,
      digest(n),
      extra.caption ?? null,
      occurredAt,
      extra.corrected ?? null,
      towee,
      extra.deleted ? new Date() : null,
    ],
  );
  return rows[0].id;
}

describe("the chronological grid", () => {
  test("is newest first, by the time the photo happened", async () => {
    // occurred_at, not created_at: these are inserted oldest-first and must
    // come back the other way round.
    await addPhoto(1, "2023-01-01T00:00:00Z");
    await addPhoto(2, "2025-10-05T00:00:00Z");
    await addPhoto(3, "2024-06-01T00:00:00Z");

    const { rows } = await db.query<{ occurred_at_effective: Date }>(BROWSE_SQL, [
      null,
      60,
    ]);
    const years = rows.map((r) => r.occurred_at_effective.getUTCFullYear());
    expect(years).toEqual([2025, 2024, 2023]);
  });

  test("reads the corrected date, so a fixed photo moves in the grid", async () => {
    // Otherwise a correction shows up everywhere except the grid, which is the
    // one place somebody would look to check it worked.
    await addPhoto(1, "2025-10-05T00:00:00Z");
    await addPhoto(2, "2019-01-01T00:00:00Z", { corrected: "2026-01-01T00:00:00Z" });

    const { rows } = await db.query<{ occurred_at_effective: Date }>(BROWSE_SQL, [
      null,
      60,
    ]);
    expect(rows[0].occurred_at_effective.getUTCFullYear()).toBe(2026);
  });

  test("leaves out tombstoned photos while their rows survive", async () => {
    await addPhoto(1, "2025-10-05T00:00:00Z");
    await addPhoto(2, "2025-10-06T00:00:00Z", { deleted: true });

    const { rows } = await db.query(BROWSE_SQL, [null, 60]);
    expect(rows).toHaveLength(1);

    // ADR-0013: the row and its pointer at the bytes are untouched.
    const { rows: all } = await db.query<{ n: string }>(
      "SELECT count(*) AS n FROM photo",
    );
    expect(Number(all[0].n)).toBe(2);
  });

  test("pages by the time of the last photo shown", async () => {
    for (let i = 1; i <= 5; i++) {
      await addPhoto(i, `2025-10-0${i}T00:00:00Z`);
    }

    const first = await db.query<{ occurred_at_effective: Date }>(BROWSE_SQL, [null, 2]);
    expect(first.rows).toHaveLength(2);

    const next = await db.query<{ occurred_at_effective: Date }>(BROWSE_SQL, [
      first.rows[1].occurred_at_effective,
      2,
    ]);
    expect(next.rows).toHaveLength(2);
    // No overlap: the second page starts strictly before the first page ended.
    expect(next.rows[0].occurred_at_effective.getTime()).toBeLessThan(
      first.rows[1].occurred_at_effective.getTime(),
    );
  });

  test("prefers the thumbnail but falls back to the original", async () => {
    // A photo whose rendition failed to generate is still a photo we hold, and
    // showing nothing would make a recoverable gap look like a lost file.
    const withThumb = await addPhoto(1, "2025-10-05T00:00:00Z");
    await addPhoto(2, "2025-10-04T00:00:00Z");

    await db.query(
      `INSERT INTO rendition (photo_id, kind, storage_key, content_type)
       VALUES ($1, 'thumb', 'renditions/aa/thumb.webp', 'image/webp')`,
      [withThumb],
    );

    const { rows } = await db.query<{ thumb_key: string | null; storage_key: string }>(
      BROWSE_SQL,
      [null, 60],
    );
    expect(rows[0].thumb_key).toBe("renditions/aa/thumb.webp");
    expect(rows[1].thumb_key).toBeNull();
    expect(rows[1].storage_key).toContain("originals/");
  });

  test("shows nothing at all to a signed-out request", async () => {
    await addPhoto(1, "2025-10-05T00:00:00Z");

    await asPerson(db, null, async () => {
      const { rows } = await db.query(BROWSE_SQL, [null, 60]);
      expect(rows).toHaveLength(0);
    });
  });

  test("shows the whole library to either of us", async () => {
    // Two people who share everything: the privacy boundary is the front door.
    await addPhoto(1, "2025-10-05T00:00:00Z");

    await asPerson(db, yangcho, async () => {
      const { rows } = await db.query(BROWSE_SQL, [null, 60]);
      expect(rows).toHaveLength(1);
    });
  });
});

describe("the counts on the photos page", () => {
  test("pending counts only what is still on its way in", async () => {
    await db.query(
      `INSERT INTO import_upload (person_id, content_type, state)
       VALUES ($1, 'image/jpeg', 'queued'),
              ($1, 'image/jpeg', 'uploading'),
              ($1, 'image/jpeg', 'failed'),
              ($1, 'image/jpeg', 'duplicate')`,
      [towee],
    );

    const { rows } = await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM import_upload
        WHERE person_id = $1 AND state IN ('queued', 'uploading', 'failed')`,
      [towee],
    );
    // The duplicate is settled and must not be counted as work outstanding.
    expect(Number(rows[0].n)).toBe(3);
  });

  test("open proposals are counted until they are answered", async () => {
    const photo = await db.query<{ id: string }>(
      `INSERT INTO photo (storage_key, sha256, content_type, occurred_at,
                          latitude, longitude, person_id)
       VALUES ('originals/aa/p.jpg', $1, 'image/jpeg', now(), 37.5665, 126.9780, $2)
       RETURNING id`,
      [digest(9), towee],
    );
    const proposal = await db.query<{ id: string }>(
      `INSERT INTO place_proposal (photo_id, latitude, longitude, photo_occurred_at, person_id)
       SELECT id, latitude, longitude, occurred_at_effective, person_id FROM photo WHERE id = $1
       RETURNING id`,
      [photo.rows[0].id],
    );

    const open = async () => {
      const { rows } = await db.query<{ n: string }>(
        "SELECT count(*) AS n FROM place_proposal WHERE resolved_at IS NULL",
      );
      return Number(rows[0].n);
    };

    expect(await open()).toBe(1);
    await db.query("SELECT dismiss_place_proposal($1)", [proposal.rows[0].id]);
    expect(await open()).toBe(0);
  });
});

/**
 * The nearby-places query, exactly as `placesNear()` issues it — casts and all.
 *
 * The casts are not tidiness: without them Postgres has no context to infer a
 * parameter's type from in `$1 - $3` and fails with "operator is not unique".
 * This test caught that before the page did.
 */
const NEAR_SQL = `
  SELECT id, name FROM place
   WHERE latitude BETWEEN $1::double precision - $3::double precision
                      AND $1::double precision + $3::double precision
     AND longitude BETWEEN $2::double precision - $3::double precision
                       AND $2::double precision + $3::double precision
   ORDER BY abs(latitude - $1::double precision)
          + abs(longitude - $2::double precision)
   LIMIT 5`;

describe("places offered near a proposal", () => {
  test("finds one we already named nearby, so we do not make a second", async () => {
    // A queue that only offers "make a new Place" produces three pins called
    // 광화문 within a month.
    await db.query(
      `INSERT INTO place (name, latitude, longitude, person_id)
       VALUES ('광화문', 37.5759, 126.9769, $1), ('부산역', 35.1151, 129.0415, $1)`,
      [towee],
    );

    const { rows } = await db.query<{ name: string }>(NEAR_SQL, [
      37.5759, 126.9769, 0.02,
    ]);

    expect(rows.map((r) => r.name)).toEqual(["광화문"]);
  });

  test("offers nothing when there is nothing near", async () => {
    await db.query(
      `INSERT INTO place (name, latitude, longitude, person_id)
       VALUES ('부산역', 35.1151, 129.0415, $1)`,
      [towee],
    );

    const { rows } = await db.query(NEAR_SQL, [37.5665, 126.978, 0.02]);
    expect(rows).toHaveLength(0);
  });

  test("a Place with no coordinates is never offered", async () => {
    // A wished-for Place pinned by name only. It has no location to be near.
    await db.query(
      "INSERT INTO place (name, person_id) VALUES ('마르세유', $1)",
      [yangcho],
    );

    const { rows } = await db.query(NEAR_SQL, [37.5665, 126.978, 0.02]);
    expect(rows).toHaveLength(0);
  });
});
