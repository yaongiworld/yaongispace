import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { Client } from "pg";
import { migrate } from "./db";
import { reset, twoPeople } from "./world";

/**
 * The Entry index, against the real database.
 *
 * Two properties matter here and neither is visible to a mock: that a section
 * *cannot forget* to register an Entry, because the database does it rather
 * than the application; and that Korean search actually works, which
 * `to_tsvector` fails at silently (ADR-0003).
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

const entryFor = async (kind: string, sourceId: string) => {
  const { rows } = await db.query(
    "SELECT * FROM entry WHERE kind = $1 AND source_id = $2",
    [kind, sourceId],
  );
  return rows[0];
};

test("writing a Letter registers an Entry without anybody asking", async () => {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO letter (author_id, recipient_id, title, body, occurred_at)
     VALUES ($1, $2, '제주에서', '제주도에서 보낸 하루가 좋았어', '2025-10-05T21:00:00+09:00')
     RETURNING id`,
    [towee, yangcho],
  );

  const entry = await entryFor("letter", rows[0].id);
  expect(entry).toBeDefined();
  expect(entry.title).toBe("제주에서");
  expect(entry.text).toContain("제주도에서");
  // Whose doing it was: a letter is the writer's act, not the reader's.
  expect(entry.person_id).toBe(towee);
  // The index reasons in occurred-at, not created-at.
  expect((entry.occurred_at as Date).getUTCFullYear()).toBe(2025);
});

test("every source table emits an Entry", async () => {
  // The obligation ADR-0001 places on section design, checked across all of
  // them at once: if a later ticket adds a table and forgets its trigger, the
  // count here is what says so.
  const journey = await db.query<{ id: string }>(
    "INSERT INTO journey (title, started_on) VALUES ('제주, 2025년 10월', '2025-10-03') RETURNING id",
  );
  const place = await db.query<{ id: string }>(
    "INSERT INTO place (name, person_id) VALUES ('제주도', $1) RETURNING id",
    [towee],
  );
  await db.query(
    "INSERT INTO visit (place_id, person_id, occurred_at) VALUES ($1, $2, now())",
    [place.rows[0].id, towee],
  );
  await db.query(
    "INSERT INTO letter (author_id, recipient_id, body) VALUES ($1, $2, '잘 자')",
    [towee, yangcho],
  );
  await db.query(
    `INSERT INTO photo (storage_key, sha256, content_type, occurred_at, person_id)
     VALUES ('r2/a.jpg', repeat('a', 64), 'image/jpeg', now(), $1)`,
    [towee],
  );
  await db.query(
    "INSERT INTO event (title, occurred_at, person_id) VALUES ('결혼기념일', now(), $1)",
    [towee],
  );
  await db.query("INSERT INTO note (author_id, body) VALUES ($1, '메모')", [towee]);

  const { rows } = await db.query<{ kind: string; n: string }>(
    "SELECT kind, count(*) AS n FROM entry GROUP BY kind ORDER BY kind",
  );
  expect(rows.map((r) => r.kind)).toEqual([
    "event",
    "journey",
    "letter",
    "note",
    "photo",
    "place",
    "visit",
  ]);
});

test("editing a source row updates its Entry rather than adding a second", async () => {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO note (author_id, title, body) VALUES ($1, '초안', '처음 쓴 내용') RETURNING id",
    [towee],
  );
  await db.query("UPDATE note SET body = '고쳐 쓴 내용' WHERE id = $1", [rows[0].id]);

  const { rows: entries } = await db.query<{ text: string }>(
    "SELECT text FROM entry WHERE kind = 'note' AND source_id = $1",
    [rows[0].id],
  );
  expect(entries).toHaveLength(1);
  expect(entries[0].text).toContain("고쳐 쓴 내용");
  expect(entries[0].text).not.toContain("처음 쓴 내용");
});

test("deleting a source row forgets its Entry", async () => {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO note (author_id, body) VALUES ($1, '지울 메모') RETURNING id",
    [towee],
  );
  await db.query("DELETE FROM note WHERE id = $1", [rows[0].id]);
  expect(await entryFor("note", rows[0].id)).toBeUndefined();
});

test("a tombstoned Photo leaves the index but not the archive", async () => {
  // ADR-0013: a delete is a tombstone, not an erasure. It should stop
  // surfacing in recall while its bytes and its row stay exactly where they were.
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO photo (storage_key, sha256, content_type, occurred_at, person_id)
     VALUES ('r2/gone.jpg', repeat('d', 64), 'image/jpeg', now(), $1) RETURNING id`,
    [towee],
  );
  await db.query("UPDATE photo SET deleted_at = now() WHERE id = $1", [rows[0].id]);

  expect(await entryFor("photo", rows[0].id)).toBeUndefined();

  const still = await db.query<{ storage_key: string }>(
    "SELECT storage_key FROM photo WHERE id = $1",
    [rows[0].id],
  );
  expect(still.rows[0].storage_key).toBe("r2/gone.jpg");

  // And undeleting restores it, because nothing was destroyed.
  await db.query("UPDATE photo SET deleted_at = NULL WHERE id = $1", [rows[0].id]);
  expect(await entryFor("photo", rows[0].id)).toBeDefined();
});

test("a Photo's Entry follows its corrected date, not the wrong EXIF one", async () => {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO photo (storage_key, sha256, content_type, occurred_at, person_id)
     VALUES ('r2/b.jpg', repeat('e', 64), 'image/jpeg', '2019-01-01T00:00:00Z', $1)
     RETURNING id`,
    [towee],
  );
  await db.query(
    "UPDATE photo SET occurred_at_corrected = '2022-06-01T00:00:00Z' WHERE id = $1",
    [rows[0].id],
  );

  const entry = await entryFor("photo", rows[0].id);
  expect((entry.occurred_at as Date).getUTCFullYear()).toBe(2022);
});

test("a Visit carries its Place's name, and keeps it when the Place is renamed", async () => {
  const place = await db.query<{ id: string }>(
    "INSERT INTO place (name, person_id) VALUES ('제주도', $1) RETURNING id",
    [towee],
  );
  const visit = await db.query<{ id: string }>(
    "INSERT INTO visit (place_id, person_id, occurred_at) VALUES ($1, $2, now()) RETURNING id",
    [place.rows[0].id, towee],
  );

  expect((await entryFor("visit", visit.rows[0].id)).text).toContain("제주도");

  await db.query("UPDATE place SET name = '제주' WHERE id = $1", [place.rows[0].id]);

  // Otherwise searching the new name misses the Visit, and a rebuild would
  // silently disagree with what the triggers left behind.
  expect((await entryFor("visit", visit.rows[0].id)).text).toContain("제주");
});

test("changing the text clears the embedding, because it no longer describes it", async () => {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO note (author_id, body) VALUES ($1, '원래 내용') RETURNING id",
    [towee],
  );
  const embedding = `[${Array(1536).fill(0.1).join(",")}]`;
  await db.query(
    "UPDATE entry SET embedding = $1 WHERE kind = 'note' AND source_id = $2",
    [embedding, rows[0].id],
  );

  // A change that does not touch the text keeps the embedding.
  await db.query("UPDATE note SET occurred_at = now() WHERE id = $1", [rows[0].id]);
  expect((await entryFor("note", rows[0].id)).embedding).not.toBeNull();

  await db.query("UPDATE note SET body = '완전히 다른 내용' WHERE id = $1", [rows[0].id]);
  expect((await entryFor("note", rows[0].id)).embedding).toBeNull();
});

test("no vector index exists yet", async () => {
  // Below roughly 100k rows an approximate index is slower than the scan it
  // replaces and trades exact results for nothing. This asserts the decision
  // rather than the absence of an oversight.
  const { rows } = await db.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'entry'`,
  );
  const defs = rows.map((r) => r.indexdef).join("\n");
  expect(defs).not.toMatch(/ivfflat|hnsw/i);
  // But the text is indexed for the lexical half of recall, which must exist.
  // Trigram rather than pgroonga: pgroonga is the better tool and exists on
  // Supabase alone, which would make the cheapest viable host a $25/month plan
  // bought for one extension. This accepts pgroonga's index either, so a host
  // that has it can add it without this failing.
  expect(defs).toMatch(/gin_trgm_ops|pgroonga/i);
});

test("searching 제주 matches 제주도에서, which to_tsvector cannot", async () => {
  // The concrete failure ADR-0003 exists to prevent. Korean is agglutinative:
  // particles attach directly to nouns, so 제주 lives inside 제주도에서. This
  // is most Korean content, not an edge case, and it would ship looking
  // perfectly correct in English testing.
  await db.query(
    `INSERT INTO note (author_id, title, body)
     VALUES ($1, '여행 기록', '제주도에서 좋은 하루를 보냈어요')`,
    [towee],
  );

  const found = await db.query<{ n: string }>(
    "SELECT count(*) AS n FROM entry WHERE text ILIKE '%' || $1 || '%'",
    ["제주"],
  );
  expect(Number(found.rows[0].n)).toBe(1);

  const tsvector = await db.query<{ n: string }>(
    "SELECT count(*) AS n FROM entry WHERE to_tsvector(text) @@ to_tsquery('제주')",
  );
  expect(Number(tsvector.rows[0].n)).toBe(0);
});

test("one search path covers Korean and English, including a code-switched sentence", async () => {
  await db.query(
    `INSERT INTO note (author_id, body)
     VALUES ($1, '오늘 Busan 에서 먹은 밀면이 정말 맛있었어')`,
    [towee],
  );

  for (const term of ["Busan", "밀면", "맛있"]) {
    const { rows } = await db.query<{ n: string }>(
      "SELECT count(*) AS n FROM entry WHERE text ILIKE '%' || $1 || '%'",
      [term],
    );
    expect(Number(rows[0].n), `searching ${term}`).toBe(1);
  }
});
