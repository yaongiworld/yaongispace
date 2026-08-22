import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { Client } from "pg";
import { migrate } from "./db";
import { reset, twoPeople } from "./world";

/**
 * The shape of the domain, against the real database.
 *
 * These are not "does the column exist" tests — a typo would fail the fixtures
 * anyway. They assert the decisions that a future migration could plausibly
 * undo without anything else complaining: that a wish is the absence of a
 * Visit rather than a flag, that a Journey need not be travel, that a
 * correction never overwrites an original, and that nothing anywhere records
 * a language.
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

test("a Place with no Visit is a wish, and there is no flag saying so", async () => {
  // ADR-0002: wished-for and visited need no enum and no state machine.
  const { rows } = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'place'`,
  );
  const names = rows.map((r) => r.column_name);
  for (const forbidden of ["status", "is_wished", "wished", "visited", "is_visited", "state"]) {
    expect(names).not.toContain(forbidden);
  }

  const place = await db.query<{ id: string }>(
    "INSERT INTO place (name, person_id) VALUES ('마르세유', $1) RETURNING id",
    [towee],
  );
  const id = place.rows[0].id;

  // A wish is a Place whose Visit count is zero. Nothing else distinguishes it.
  const wished = async () => {
    const { rows } = await db.query<{ n: string }>(
      "SELECT count(*) AS n FROM visit WHERE place_id = $1",
      [id],
    );
    return Number(rows[0].n) === 0;
  };

  expect(await wished()).toBe(true);

  await db.query(
    "INSERT INTO visit (place_id, person_id, occurred_at) VALUES ($1, $2, now())",
    [id, towee],
  );

  // A hope became a memory with no migration and no status change.
  expect(await wished()).toBe(false);
});

test("three trips to one Place are three Visits, not three Places", async () => {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO place (name, person_id) VALUES ('제주도', $1) RETURNING id",
    [towee],
  );
  const jeju = rows[0].id;

  for (const year of [2023, 2024, 2025]) {
    await db.query(
      "INSERT INTO visit (place_id, person_id, occurred_at) VALUES ($1, $2, $3)",
      [jeju, towee, `${year}-10-05T00:00:00+09:00`],
    );
  }

  const places = await db.query<{ n: string }>("SELECT count(*) AS n FROM place");
  const visits = await db.query<{ n: string }>("SELECT count(*) AS n FROM visit");
  expect(Number(places.rows[0].n)).toBe(1);
  expect(Number(visits.rows[0].n)).toBe(3);
});

test("a Journey need not be travel", async () => {
  // ADR-0014: a wedding, a move, a season with the cats are all Journeys. If
  // anything ever required a Place or a trip flag, this insert would fail.
  await db.query(
    `INSERT INTO journey (title, description, started_on, ended_on)
     VALUES ('이사', '새 집으로', '2026-03-01', '2026-03-08')`,
  );

  const { rows } = await db.query<{ title: string }>("SELECT title FROM journey");
  expect(rows[0].title).toBe("이사");

  // And no column exists that could be used to insist otherwise.
  const cols = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'journey'`,
  );
  const names = cols.rows.map((r) => r.column_name);
  for (const forbidden of ["place_id", "is_trip", "kind", "type", "destination"]) {
    expect(names).not.toContain(forbidden);
  }
});

test("a Journey that has not ended is allowed", async () => {
  await db.query(
    "INSERT INTO journey (title, started_on) VALUES ('신혼', '2024-05-01')",
  );
  const { rows } = await db.query<{ ended_on: string | null }>(
    "SELECT ended_on FROM journey WHERE title = '신혼'",
  );
  expect(rows[0].ended_on).toBeNull();
});

test("nothing in the data model records a language", async () => {
  // Mixed and code-switched content is the normal case, and pgroonga handles
  // both halves in one field. A `language` column would invite a filter that
  // silently drops half of what we actually write.
  const { rows } = await db.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name IN ('language', 'lang', 'locale')`,
  );
  expect(rows).toEqual([]);
});

test("occurred_at is a column of its own wherever a thing happened", async () => {
  const { rows } = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'occurred_at'
      ORDER BY table_name`,
  );
  expect(rows.map((r) => r.table_name)).toEqual([
    "entry",
    "event",
    "letter",
    "note",
    "photo",
    "visit",
  ]);
});

test("a letter written today about last October occurred in October", async () => {
  await db.query(
    `INSERT INTO letter (author_id, recipient_id, body, occurred_at)
     VALUES ($1, $2, '제주도에서의 그 밤 기억나?', '2025-10-05T21:00:00+09:00')`,
    [towee, yangcho],
  );

  const { rows } = await db.query<{ occurred: Date; created: Date }>(
    "SELECT occurred_at AS occurred, created_at AS created FROM letter",
  );
  expect(rows[0].occurred.getUTCFullYear()).toBe(2025);
  expect(rows[0].created.getUTCFullYear()).toBeGreaterThanOrEqual(2026);
});

test("correcting a Photo's date never overwrites the imported one", async () => {
  // ADR-0013: every operation is additive. The imported value stays exactly as
  // it arrived, and the correction is a second column composed over it.
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO photo (storage_key, sha256, content_type, occurred_at, person_id)
     VALUES ('r2/a.jpg', repeat('a', 64), 'image/jpeg', '2019-01-01T00:00:00Z', $1)
     RETURNING id`,
    [towee],
  );
  const id = rows[0].id;

  await db.query(
    "UPDATE photo SET occurred_at_corrected = '2022-06-01T00:00:00Z' WHERE id = $1",
    [id],
  );

  const after = await db.query<{ imported: Date; effective: Date }>(
    "SELECT occurred_at AS imported, occurred_at_effective AS effective FROM photo WHERE id = $1",
    [id],
  );
  // The bad EXIF date is still there — the correction did not destroy it.
  expect(after.rows[0].imported.getUTCFullYear()).toBe(2019);
  expect(after.rows[0].effective.getUTCFullYear()).toBe(2022);
});

test("an exact duplicate photo cannot be stored twice", async () => {
  const insert = (key: string) =>
    db.query(
      `INSERT INTO photo (storage_key, sha256, content_type, occurred_at, person_id)
       VALUES ($1, repeat('b', 64), 'image/jpeg', now(), $2)`,
      [key, towee],
    );

  await insert("r2/one.jpg");
  await expect(insert("r2/two.jpg")).rejects.toThrow(/sha256/);
});

test("a Rendition is stored beside its original, never in place of it", async () => {
  const { rows } = await db.query<{ id: string; storage_key: string }>(
    `INSERT INTO photo (storage_key, sha256, content_type, occurred_at, person_id)
     VALUES ('r2/original.jpg', repeat('c', 64), 'image/jpeg', now(), $1)
     RETURNING id, storage_key`,
    [towee],
  );

  await db.query(
    `INSERT INTO rendition (photo_id, kind, storage_key, content_type)
     VALUES ($1, 'thumb', 'r2/original-thumb.jpg', 'image/jpeg')`,
    [rows[0].id],
  );

  const original = await db.query<{ storage_key: string }>(
    "SELECT storage_key FROM photo WHERE id = $1",
    [rows[0].id],
  );
  expect(original.rows[0].storage_key).toBe("r2/original.jpg");
});

test("a Letter cannot be addressed to its own author", async () => {
  // A letter to yourself is a Note, and that distinction is why both nouns
  // exist: a Letter is addressed, a Note is not.
  await expect(
    db.query(
      "INSERT INTO letter (author_id, recipient_id, body) VALUES ($1, $1, '혼잣말')",
      [towee],
    ),
  ).rejects.toThrow();
});

test("every table in the app has row level security enabled", async () => {
  // The wall has to be continuous. A table added without RLS is readable by
  // anyone who reaches the database, and nothing else in the suite would say so.
  const { rows } = await db.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND rowsecurity = false
      ORDER BY tablename`,
  );
  expect(rows.map((r) => r.tablename)).toEqual([]);
});
