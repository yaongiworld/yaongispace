import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPerson, migrate } from "./db";
import { reset, twoPeople } from "./world";

/**
 * Letters, end to end, against the real database (ticket 05).
 *
 * The three things this ticket promises are all database behaviour, and all
 * three are invisible to a mocked Supabase: a Letter is editable until it is
 * read and immutable after; a Letter sealed until a date does not exist as far
 * as its recipient is concerned; and **only opening a Letter seals it**.
 *
 * Everything here that is about the seal runs through `asPerson`, because the
 * owner these tests connect as bypasses RLS entirely — a policy could be
 * written backwards and an owner-run test would still pass. The seal is the
 * one rule in this app that cannot be un-broken after the fact: a letter
 * spoiled early, or locked before its writer was finished, has no undo. So it
 * is asserted from inside the wall.
 *
 * Ticket 03 already built the `letter` table, its RLS and the
 * `letter_stays_what_it_was` trigger, and `tests/rls.test.ts` covers those from
 * its own angle. This file does not restate them — it covers what migration
 * 004 adds, and the end-to-end flow the ticket is actually about.
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
 * Act as a signed-in Person and **keep** what they did.
 *
 * `asPerson` always rolls back, which is right for asking what somebody can
 * see — but opening a Letter is a write whose whole significance is that it
 * lasts. A rolled-back seal is not a seal, and the tests below turn on what is
 * still true afterwards.
 *
 * Deliberately local to this file rather than added to `tests/db.ts`: that
 * helper is shared with tickets running in parallel, and a committing variant
 * is a sharp enough tool that it should not be the easy import. It sets the
 * same JWT claim and drops to the same role, so RLS applies exactly as it does
 * in `asPerson` — the only difference is the COMMIT.
 */
async function asPersonCommitting<T>(
  client: Client,
  person: string,
  body: () => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ person_id: person }),
    ]);
    await client.query("SET LOCAL ROLE yaongi_signed_in");
    const result = await body();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/**
 * The seal, performed the way the app performs it: the recipient opens the
 * Letter and `open_letter` is what marks it.
 */
const openAs = (person: string, id: string) =>
  asPersonCommitting(db, person, async () => {
    const { rows } = await db.query<{ open_letter: Date | null }>(
      "SELECT open_letter($1) AS open_letter",
      [id],
    );
    return rows[0].open_letter;
  });

const readAtOf = async (id: string): Promise<Date | null> => {
  const { rows } = await db.query<{ read_at: Date | null }>(
    "SELECT read_at FROM letter WHERE id = $1",
    [id],
  );
  return rows[0]?.read_at ?? null;
};

/** Write a Letter for real (as owner), for tests about what happens after. */
async function letterExists(fields: {
  author: string;
  recipient: string;
  title?: string;
  body: string;
  unsealAt?: string;
}): Promise<string> {
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
}

describe("봉하기 — writing and sealing a Letter", () => {
  test("one of us writes a Letter to the other, and it registers an Entry", async () => {
    const id = await asPerson(db, towee, async () => {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO letter (author_id, recipient_id, title, body)
         VALUES ($1, $2, '오늘 하루', '제주도에서 보낸 하루가 참 좋았어') RETURNING id`,
        [towee, yangcho],
      );
      const letterId = rows[0].id;

      // The Entry appears without the section asking for one — the database
      // does it, so a section cannot forget.
      const { rows: entries } = await db.query<{ title: string; person_id: string }>(
        "SELECT title, person_id FROM entry WHERE kind = 'letter' AND source_id = $1",
        [letterId],
      );
      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe("오늘 하루");
      // Whose doing it was: a Letter is the writer's act, not the reader's.
      expect(entries[0].person_id).toBe(towee);

      return letterId;
    });

    expect(id).toBeTruthy();
  });

  test("a Letter is findable by Korean search, which tsvector could not do", async () => {
    await letterExists({
      author: towee,
      recipient: yangcho,
      title: "제주에서",
      body: "제주도에서 보낸 하루가 참 좋았어",
    });

    await asPerson(db, yangcho, async () => {
      // 제주 must match 제주도에서. Postgres cannot tokenize Korean and
      // `to_tsvector` treats the run as one token, so this silently finds
      // nothing without pgroonga (ADR-0003).
      const { rows } = await db.query<{ n: string }>(
        "SELECT count(*) AS n FROM entry WHERE kind = 'letter' AND text ILIKE '%제주%'",
      );
      expect(Number(rows[0].n)).toBe(1);
    });
  });

  test("a Letter cannot be addressed to yourself — that is a Note", async () => {
    await asPerson(db, towee, async () => {
      await expect(
        db.query(
          "INSERT INTO letter (author_id, recipient_id, body) VALUES ($1, $1, '나에게')",
          [towee],
        ),
      ).rejects.toThrow();
    });
  });
});

describe("editable until read, then immutable", () => {
  test("the author may revise a Letter right up until it is opened", async () => {
    const id = await letterExists({
      author: towee,
      recipient: yangcho,
      body: "초고",
    });

    await asPerson(db, towee, async () => {
      const updated = await db.query("UPDATE letter SET body = '고쳐 쓴 편지' WHERE id = $1", [
        id,
      ]);
      expect(updated.rowCount).toBe(1);
    });
  });

  test("opening it locks it: the author can no longer rewrite it", async () => {
    // The ticket's required trio, in order: seal → the recipient opens →
    // editing is refused.
    const id = await letterExists({
      author: towee,
      recipient: yangcho,
      body: "처음 쓴 편지",
    });

    await openAs(yangcho, id);
    expect(await readAtOf(id)).not.toBeNull();

    await asPerson(db, towee, async () => {
      await expect(
        db.query("UPDATE letter SET body = '몰래 고친 편지' WHERE id = $1", [id]),
      ).rejects.toThrow(/cannot be rewritten/i);
    });

    // The words the recipient read are the words that are still there.
    const { rows } = await db.query<{ body: string }>(
      "SELECT body FROM letter WHERE id = $1",
      [id],
    );
    expect(rows[0].body).toBe("처음 쓴 편지");
  });
});

describe("only opening the Letter seals it", () => {
  test("the author reading their own Letter does not seal it", async () => {
    // The hazard this is guarding: the author opens their own draft to look at
    // it, `read_at` is set, and their editing window closes for good with the
    // recipient never having seen it. Feed-read and letter-read are two
    // separate notions and this is the third one that must stay separate.
    const id = await letterExists({
      author: towee,
      recipient: yangcho,
      body: "아직 다 못 쓴 편지",
    });

    const marked = await openAs(towee, id);
    expect(marked).toBeNull();
    expect(await readAtOf(id)).toBeNull();

    // And so the author can still finish it.
    await asPerson(db, towee, async () => {
      const updated = await db.query("UPDATE letter SET body = '다 쓴 편지' WHERE id = $1", [
        id,
      ]);
      expect(updated.rowCount).toBe(1);
    });
  });

  test("seeing a Letter in the Entry index does not seal it", async () => {
    // News and Recall both read Entry. Neither is reading the Letter, and
    // ticket 06's feed depends on this being true.
    const id = await letterExists({
      author: towee,
      recipient: yangcho,
      title: "안녕",
      body: "오늘 뭐 했어?",
    });

    await asPerson(db, yangcho, async () => {
      const { rows } = await db.query<{ n: string }>(
        "SELECT count(*) AS n FROM entry WHERE kind = 'letter' AND source_id = $1",
        [id],
      );
      expect(Number(rows[0].n)).toBe(1);
    });

    expect(await readAtOf(id)).toBeNull();
  });

  test("the moment of opening is the first one, and it never moves", async () => {
    // Opening a Letter twice must not rewrite when it was read: the seal is a
    // fact about the past, and letting the second open overwrite it would let
    // a recipient quietly reopen the author's editing window by re-reading.
    const id = await letterExists({
      author: towee,
      recipient: yangcho,
      body: "두 번 열어볼 편지",
    });

    const first = await openAs(yangcho, id);
    expect(first).not.toBeNull();

    const again = await openAs(yangcho, id);
    expect(again).toEqual(first);
    expect(await readAtOf(id)).toEqual(first);
  });

  test("a recipient cannot forge an earlier or later read time", async () => {
    const id = await letterExists({
      author: towee,
      recipient: yangcho,
      body: "언제 읽었는지",
    });
    await openAs(yangcho, id);
    const sealedAt = await readAtOf(id);

    await asPerson(db, yangcho, async () => {
      await expect(
        db.query("UPDATE letter SET read_at = now() + interval '1 day' WHERE id = $1", [
          id,
        ]),
      ).rejects.toThrow();
    });

    expect(await readAtOf(id)).toEqual(sealedAt);
  });
});

describe("sealed until a date", () => {
  test("before its date the Letter does not exist for its recipient — not even a countdown", async () => {
    // Absent, not greyed out: no title, no sender, no date, nothing that leaks
    // that there is something to look forward to.
    await letterExists({
      author: towee,
      recipient: yangcho,
      title: "생일 축하해",
      body: "스물아홉 번째 생일 축하해",
      unsealAt: "2036-01-01T00:00:00Z",
    });

    await asPerson(db, yangcho, async () => {
      const { rows } = await db.query("SELECT * FROM letter");
      expect(rows).toHaveLength(0);

      // Nor through the index, which is what News and Recall read. A sealed
      // letter surfacing there spoils it as completely as opening it.
      const { rows: entries } = await db.query(
        "SELECT * FROM entry WHERE kind = 'letter'",
      );
      expect(entries).toHaveLength(0);

      // And no aggregate leaks its existence either.
      const { rows: counted } = await db.query<{ n: string }>(
        "SELECT count(*) AS n FROM letter WHERE recipient_id = $1",
        [yangcho],
      );
      expect(Number(counted[0].n)).toBe(0);
    });
  });

  test("after its date the same Letter is simply there", async () => {
    const id = await letterExists({
      author: towee,
      recipient: yangcho,
      title: "생일 축하해",
      body: "스물아홉 번째 생일 축하해",
      unsealAt: "2020-01-01T00:00:00Z",
    });

    await asPerson(db, yangcho, async () => {
      const { rows } = await db.query<{ id: string; title: string }>(
        "SELECT id, title FROM letter",
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(id);
      expect(rows[0].title).toBe("생일 축하해");

      const { rows: entries } = await db.query(
        "SELECT * FROM entry WHERE kind = 'letter'",
      );
      expect(entries).toHaveLength(1);
    });
  });

  test("its author still sees it while it is sealed, because they may still be editing", async () => {
    const id = await letterExists({
      author: towee,
      recipient: yangcho,
      body: "10년 뒤에 읽어줘",
      unsealAt: "2036-01-01T00:00:00Z",
    });

    await asPerson(db, towee, async () => {
      const { rows } = await db.query("SELECT * FROM letter");
      expect(rows).toHaveLength(1);

      const updated = await db.query("UPDATE letter SET body = '고쳐 씀' WHERE id = $1", [
        id,
      ]);
      expect(updated.rowCount).toBe(1);
    });
  });

  test("a sealed Letter cannot be opened early, so it cannot be sealed early either", async () => {
    const id = await letterExists({
      author: towee,
      recipient: yangcho,
      body: "아직 열면 안 되는 편지",
      unsealAt: "2036-01-01T00:00:00Z",
    });

    // `open_letter` cannot even see it, so there is nothing to mark.
    const marked = await openAs(yangcho, id);
    expect(marked).toBeNull();
    expect(await readAtOf(id)).toBeNull();

    // Which means the author's window is still open — the letter is not
    // silently locked by a recipient poking at an id they guessed.
    await asPerson(db, towee, async () => {
      const updated = await db.query("UPDATE letter SET body = '아직 고칠 수 있어' WHERE id = $1", [
        id,
      ]);
      expect(updated.rowCount).toBe(1);
    });
  });
});

describe("the letterbox", () => {
  test("shows each of us the Letters we may see, and nothing sealed", async () => {
    await letterExists({ author: towee, recipient: yangcho, body: "첫 번째" });
    await letterExists({ author: yangcho, recipient: towee, body: "두 번째" });
    await letterExists({
      author: towee,
      recipient: yangcho,
      body: "세 번째",
      unsealAt: "2036-01-01T00:00:00Z",
    });

    // Yangcho sees the one she wrote and the one she may read — not the sealed one.
    await asPerson(db, yangcho, async () => {
      const { rows } = await db.query<{ body: string }>(
        "SELECT body FROM letter ORDER BY body",
      );
      expect(rows.map((r) => r.body)).toEqual(["두 번째", "첫 번째"]);
    });

    // Towee wrote two of them and received one, so he sees all three.
    await asPerson(db, towee, async () => {
      const { rows } = await db.query<{ n: string }>("SELECT count(*) AS n FROM letter");
      expect(Number(rows[0].n)).toBe(3);
    });
  });

  test("an unread Letter is unread for its recipient only", async () => {
    // "Unread" is a fact about the recipient, not a global flag — the author's
    // own letter is never waiting for the author.
    const id = await letterExists({
      author: towee,
      recipient: yangcho,
      body: "읽어줘",
    });

    const unreadFor = (person: string) =>
      asPerson(db, person, async () => {
        const { rows } = await db.query<{ n: string }>(
          `SELECT count(*) AS n FROM letter
            WHERE recipient_id = $1 AND read_at IS NULL`,
          [person],
        );
        return Number(rows[0].n);
      });

    expect(await unreadFor(yangcho)).toBe(1);
    expect(await unreadFor(towee)).toBe(0);

    await openAs(yangcho, id);
    expect(await unreadFor(yangcho)).toBe(0);
  });
});
