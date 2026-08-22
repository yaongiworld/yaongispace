import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { Client } from "pg";
import { migrate } from "./db";
import { reset, twoPeople } from "./world";

/**
 * The rebuild is lossless — the safe-repair property, and the most important
 * assertion in this ticket.
 *
 * ADR-0001 claims Entry is derived data, rebuildable from the source tables
 * and never the only copy of anything. That claim is what makes a bad trigger,
 * a botched backfill or a corrupted index a *repair* rather than a loss. It is
 * also the kind of claim that is true on the day it is written and quietly
 * false a year later, when a section has added a trigger and not a rebuild
 * line. So it is asserted here rather than trusted.
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

/**
 * One of everything, with enough variety that a rebuild which dropped any
 * single column would show up as a difference rather than as a smaller count.
 */
async function populate(): Promise<void> {
  const journey = await db.query<{ id: string }>(
    `INSERT INTO journey (title, description, started_on, ended_on)
     VALUES ('제주, 2025년 10월', '둘이서 처음 간 제주', '2025-10-03', '2025-10-07')
     RETURNING id`,
  );
  const jeju = journey.rows[0].id;

  const place = await db.query<{ id: string }>(
    `INSERT INTO place (name, note, latitude, longitude, person_id)
     VALUES ('제주도', 'again, in autumn', 33.4996, 126.5312, $1) RETURNING id`,
    [towee],
  );
  // A wished-for Place: no Visit, and still indexed.
  await db.query(
    "INSERT INTO place (name, note, person_id) VALUES ('마르세유', '언젠가', $1)",
    [yangcho],
  );

  await db.query(
    `INSERT INTO visit (place_id, journey_id, person_id, note, occurred_at)
     VALUES ($1, $2, $3, '흑돼지', '2025-10-05T19:00:00+09:00')`,
    [place.rows[0].id, jeju, towee],
  );

  await db.query(
    `INSERT INTO letter (author_id, recipient_id, journey_id, title, body, occurred_at)
     VALUES ($1, $2, $3, '제주에서', '제주도에서 보낸 하루가 참 좋았어', '2025-10-05T22:00:00+09:00')`,
    [towee, yangcho, jeju],
  );
  // A sealed letter, whose Entry must survive a rebuild exactly as it was.
  await db.query(
    `INSERT INTO letter (author_id, recipient_id, body, unseal_at)
     VALUES ($1, $2, '10년 뒤에 읽어줘', '2036-01-01T00:00:00Z')`,
    [yangcho, towee],
  );

  await db.query(
    `INSERT INTO photo (storage_key, sha256, content_type, caption, occurred_at,
                        occurred_at_corrected, latitude, longitude, place_id, journey_id, person_id, exif)
     VALUES ('r2/jeju.jpg', repeat('a', 64), 'image/jpeg', '성산일출봉 앞에서',
             '2019-01-01T00:00:00Z', '2025-10-05T08:00:00+09:00',
             33.4581, 126.9425, $1, $2, $3, '{"Make":"Google"}')`,
    [place.rows[0].id, jeju, towee],
  );
  // A tombstoned Photo, which must stay out of the index after a rebuild too.
  await db.query(
    `INSERT INTO photo (storage_key, sha256, content_type, occurred_at, person_id, deleted_at)
     VALUES ('r2/gone.jpg', repeat('b', 64), 'image/jpeg', now(), $1, now())`,
    [towee],
  );

  await db.query(
    `INSERT INTO event (title, description, occurred_at, all_day, repeats_yearly, place_id, person_id)
     VALUES ('결혼기념일', '매년', '2026-11-11T00:00:00+09:00', true, true, $1, $2)`,
    [place.rows[0].id, yangcho],
  );

  await db.query(
    `INSERT INTO note (author_id, journey_id, title, body, occurred_at)
     VALUES ($1, $2, '제주 맛집', '흑돼지집 이름 기억해두기', '2025-10-06T12:00:00+09:00')`,
    [yangcho, jeju],
  );
}

/**
 * The Entry index as comparable data.
 *
 * `id` and `created_at` are deliberately excluded: a rebuild makes new rows,
 * so those *must* differ, and asserting on them would be asserting that the
 * rebuild did not happen. Everything that carries meaning is compared.
 */
async function snapshot(): Promise<unknown[]> {
  const { rows } = await db.query(
    `SELECT kind, source_id, title, text, occurred_at, person_id, place_id, journey_id
       FROM entry ORDER BY kind, source_id`,
  );
  return rows;
}

test("the rebuild reproduces the index exactly", async () => {
  await populate();
  const before = await snapshot();
  expect(before.length).toBeGreaterThan(0);

  const { rows } = await db.query<{ rebuild_entry_index: string }>(
    "SELECT rebuild_entry_index()",
  );
  expect(Number(rows[0].rebuild_entry_index)).toBe(before.length);

  expect(await snapshot()).toEqual(before);
});

test("a rebuild repairs an index that was wiped out from under it", async () => {
  await populate();
  const before = await snapshot();

  // The disaster this function exists for: the index is gone, and the source
  // tables are untouched.
  await db.query("DELETE FROM entry");
  expect(await snapshot()).toEqual([]);

  await db.query("SELECT rebuild_entry_index()");
  expect(await snapshot()).toEqual(before);
});

test("a rebuild repairs an index that had drifted, without touching the sources", async () => {
  await populate();
  const before = await snapshot();

  // Corruption that a count would not catch: right number of rows, wrong
  // contents. A rebuild has to overwrite it, not merely fill gaps.
  await db.query("UPDATE entry SET text = 'rubbish', occurred_at = '1970-01-01Z'");
  const sources = await db.query<{ n: string }>(
    `SELECT (SELECT count(*) FROM letter) + (SELECT count(*) FROM photo)
          + (SELECT count(*) FROM note) AS n`,
  );

  await db.query("SELECT rebuild_entry_index()");

  expect(await snapshot()).toEqual(before);
  // And the repair was confined to the derived half.
  const after = await db.query<{ n: string }>(
    `SELECT (SELECT count(*) FROM letter) + (SELECT count(*) FROM photo)
          + (SELECT count(*) FROM note) AS n`,
  );
  expect(after.rows[0].n).toBe(sources.rows[0].n);
});

test("rebuilding twice changes nothing further", async () => {
  await populate();
  await db.query("SELECT rebuild_entry_index()");
  const once = await snapshot();
  await db.query("SELECT rebuild_entry_index()");
  expect(await snapshot()).toEqual(once);
});

test("Entry is never the only copy: dropping it loses nothing but embeddings", async () => {
  await populate();
  const sources = await db.query<Record<string, string>>(
    `SELECT (SELECT count(*) FROM letter)  AS letters,
            (SELECT count(*) FROM photo)   AS photos,
            (SELECT count(*) FROM place)   AS places,
            (SELECT count(*) FROM visit)   AS visits,
            (SELECT count(*) FROM journey) AS journeys,
            (SELECT count(*) FROM event)   AS events,
            (SELECT count(*) FROM note)    AS notes`,
  );

  await db.query("DELETE FROM entry");
  await db.query("SELECT rebuild_entry_index()");

  const after = await db.query<Record<string, string>>(
    `SELECT (SELECT count(*) FROM letter)  AS letters,
            (SELECT count(*) FROM photo)   AS photos,
            (SELECT count(*) FROM place)   AS places,
            (SELECT count(*) FROM visit)   AS visits,
            (SELECT count(*) FROM journey) AS journeys,
            (SELECT count(*) FROM event)   AS events,
            (SELECT count(*) FROM note)    AS notes`,
  );
  expect(after.rows[0]).toEqual(sources.rows[0]);
});

test("every table with an Entry trigger is in the rebuild", async () => {
  // The guard for the three tickets that fan out after this one. Adding a
  // source table means writing a trigger *and* adding a line to
  // `rebuild_entry_index()`, and forgetting the second half is invisible:
  // everything works until the day somebody repairs the index, and then that
  // section quietly vanishes from recall. This is what says so, immediately.
  const triggers = await db.query<{ table_name: string }>(
    `SELECT DISTINCT c.relname AS table_name
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE NOT t.tgisinternal
        AND p.proname LIKE 'entry_from_%'
      ORDER BY 1`,
  );

  const source = await db.query<{ prosrc: string }>(
    "SELECT prosrc FROM pg_proc WHERE proname = 'rebuild_entry_index'",
  );
  const body = source.rows[0].prosrc;

  for (const { table_name } of triggers.rows) {
    expect(
      new RegExp(`update\\s+${table_name}\\s+set\\s+id\\s*=\\s*id`, "i").test(body),
      `${table_name} has an Entry trigger but is missing from rebuild_entry_index()`,
    ).toBe(true);
  }
  // Sanity: the query above actually found the triggers it is checking.
  expect(triggers.rows.length).toBeGreaterThanOrEqual(7);
});
