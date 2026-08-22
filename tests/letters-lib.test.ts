import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { Client } from "pg";
import { Pool } from "pg";
import { TEST_DATABASE_URL, migrate } from "./db";
import { reset, twoPeople } from "./world";

/**
 * The section's data layer, against the real database.
 *
 * This file exists for one reason: `lib/letters.ts` is the place a sealed
 * Letter would leak. The seal is enforced by RLS, and RLS only applies to a
 * connection that has dropped to `yaongi_signed_in` with a Person claim set —
 * so if that module ever connects as the owner, every policy is bypassed and a
 * letter sealed until 2036 comes straight back and gets rendered. Nothing else
 * in the app would notice: the query returns a row, the page renders it, and
 * the tests that check RLS at the SQL level still pass.
 *
 * So these tests exercise the actual exported functions, not the SQL they
 * happen to contain, and they assert the outcome that matters — that the
 * module does not hand back what its caller may not see.
 *
 * `lib/db.ts` reads `DATABASE_URL` and pools; it is pointed at the test
 * database here and closed at the end.
 */

let db: Client;
let towee: string;
let yangcho: string;
let letters: typeof import("@/lib/letters");

beforeAll(async () => {
  db = await migrate();

  process.env.DATABASE_URL = TEST_DATABASE_URL;
  letters = await import("@/lib/letters");
});

afterAll(async () => {
  await db?.end();
  // The module-level pool in lib/db.ts, which would otherwise hold the
  // process open past the end of the run.
  const globalForDb = globalThis as unknown as { yaongiPool?: Pool };
  await globalForDb.yaongiPool?.end();
  globalForDb.yaongiPool = undefined;
});

beforeEach(async () => {
  await reset(db);
  ({ towee, yangcho } = await twoPeople(db));
});

const write = async (fields: {
  author: string;
  recipient: string;
  title?: string;
  body: string;
  unsealAt?: string;
}) => {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO letter (author_id, recipient_id, title, body, unseal_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [
      fields.author,
      fields.recipient,
      fields.title ?? null,
      fields.body,
      fields.unsealAt ?? null,
    ],
  );
  return rows[0].id;
};

test("the letterbox never hands back a Letter that is still sealed", async () => {
  // The leak this whole file exists to catch.
  await write({
    author: towee,
    recipient: yangcho,
    title: "생일 축하해",
    body: "미리 써두는 편지",
    unsealAt: "2036-01-01T00:00:00Z",
  });
  await write({ author: towee, recipient: yangcho, body: "지금 읽어도 되는 편지" });

  const hers = await letters.lettersFor(yangcho);
  expect(hers).toHaveLength(1);
  expect(hers[0].preview).toBe("지금 읽어도 되는 편지");
  // Not even the title, which is the part that would spoil it.
  expect(JSON.stringify(hers)).not.toContain("생일");
});

test("its author still sees their own sealed Letter", async () => {
  await write({
    author: towee,
    recipient: yangcho,
    body: "10년 뒤에 읽어줘",
    unsealAt: "2036-01-01T00:00:00Z",
  });

  expect(await letters.lettersFor(towee)).toHaveLength(1);
});

test("fetching a sealed Letter by its id gives nothing, even to its recipient", async () => {
  // Guessing the id must not be a way round the seal.
  const id = await write({
    author: towee,
    recipient: yangcho,
    body: "아직 열면 안 돼",
    unsealAt: "2036-01-01T00:00:00Z",
  });

  expect(await letters.letterFor(yangcho, id)).toBeNull();
  expect(await letters.openLetter(yangcho, id)).toBeNull();

  // And it was not sealed by the attempt.
  const { rows } = await db.query<{ read_at: Date | null }>(
    "SELECT read_at FROM letter WHERE id = $1",
    [id],
  );
  expect(rows[0].read_at).toBeNull();
});

test("opening a Letter seals it, and only for its recipient", async () => {
  const id = await write({ author: towee, recipient: yangcho, body: "읽어줘" });

  // The author looking at their own letter does not seal it.
  const asAuthor = await letters.openLetter(towee, id);
  expect(asAuthor).not.toBeNull();
  expect(asAuthor?.readAt).toBeNull();

  const asRecipient = await letters.openLetter(yangcho, id);
  expect(asRecipient?.readAt).not.toBeNull();

  // And the letter it hands back carries the seal that was just applied,
  // rather than the pre-seal row it read a moment earlier.
  const again = await letters.letterFor(yangcho, id);
  expect(again?.readAt).toEqual(asRecipient?.readAt);
});

test("listing Letters does not open any of them", async () => {
  // Feed-read and letter-read are two separate notions, and ticket 06's News
  // depends on this staying true.
  const id = await write({ author: towee, recipient: yangcho, body: "안 읽은 편지" });

  await letters.lettersFor(yangcho);

  const { rows } = await db.query<{ read_at: Date | null }>(
    "SELECT read_at FROM letter WHERE id = $1",
    [id],
  );
  expect(rows[0].read_at).toBeNull();
});

test("sealing a Letter writes it as its author, and it reaches the other letterbox", async () => {
  const id = await letters.sealLetter(towee, yangcho, {
    title: "오늘",
    body: "오늘 하루도 고마웠어",
  });

  const hers = await letters.lettersFor(yangcho);
  expect(hers.map((l) => l.id)).toContain(id);
  expect(hers[0].authorName).toBe("토위");

  // And it registered an Entry, so Recall and News can find it.
  const { rows } = await db.query<{ n: string }>(
    "SELECT count(*) AS n FROM entry WHERE kind = 'letter' AND source_id = $1",
    [id],
  );
  expect(Number(rows[0].n)).toBe(1);
});

test("a Letter sealed until a date is not in the other letterbox until then", async () => {
  const id = await letters.sealLetter(towee, yangcho, {
    body: "생일에 열어봐",
    unsealAt: "2036-01-01T00:00:00+09:00",
  });

  expect(await letters.lettersFor(yangcho)).toHaveLength(0);

  // The same letter, once its date has passed.
  await db.query("UPDATE letter SET unseal_at = now() - interval '1 day' WHERE id = $1", [
    id,
  ]);
  const hers = await letters.lettersFor(yangcho);
  expect(hers).toHaveLength(1);
  expect(hers[0].id).toBe(id);
});

test("a Letter is always authored by whoever is signed in", async () => {
  // `sealLetter` takes the author from the session, never from the form, so
  // there is no parameter through which one of us could sign the other's
  // name — the signature itself is what makes forgery unexpressible here.
  // RLS is the wall behind that: this is the attempt written out in SQL, the
  // way a future refactor that passed an author id from a hidden field would
  // end up making it.
  await db.query("BEGIN");
  try {
    await db.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ person_id: yangcho }),
    ]);
    await db.query("SET LOCAL ROLE yaongi_signed_in");
    await expect(
      db.query(
        "INSERT INTO letter (author_id, recipient_id, body) VALUES ($1, $2, '가짜')",
        [towee, yangcho],
      ),
    ).rejects.toThrow(/row-level security/i);
  } finally {
    await db.query("ROLLBACK");
  }

  // And the honest call — each of us writing to the other — works both ways.
  await expect(
    letters.sealLetter(yangcho, towee, { body: "진짜 편지" }),
  ).resolves.toBeTruthy();
});

test("an empty Letter is refused before it reaches the database", async () => {
  await expect(letters.sealLetter(towee, yangcho, { body: "   " })).rejects.toThrow();
});

test("revising works until it is read, and is refused after", async () => {
  const id = await letters.sealLetter(towee, yangcho, { body: "초고" });

  await letters.reviseLetter(towee, id, { body: "고쳐 쓴 편지" });
  expect((await letters.letterFor(towee, id))?.body).toBe("고쳐 쓴 편지");

  await letters.openLetter(yangcho, id);

  await expect(
    letters.reviseLetter(towee, id, { body: "몰래 고친 편지" }),
  ).rejects.toThrow(/cannot be rewritten/i);

  // The words she read are the words that are still there.
  expect((await letters.letterFor(yangcho, id))?.body).toBe("고쳐 쓴 편지");
});

test("the other Person is the one a Letter is addressed to", async () => {
  expect(await letters.theOtherPerson(towee)).toEqual({
    id: yangcho,
    displayName: "양초",
  });
  expect(await letters.theOtherPerson(yangcho)).toEqual({
    id: towee,
    displayName: "토위",
  });
});
